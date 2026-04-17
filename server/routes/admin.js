const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  sendApprovalEmail, sendRejectionEmail, sendReminderEmail, sendAmendmentEmail,
  sendShiftApprovedEmail, sendShiftRejectedEmail, sendShiftAssignedEmail,
} = require('../services/email');
const { getMondayOfCurrentWeek, createAuditLog } = require('../db/helpers');
const { runRemindAll, runWeeklySummary } = require('../services/cron');

const router = express.Router();
router.use(authenticate, requireAdmin);

const ENTRY_ORDER = `CASE te.day_of_week
  WHEN 'mon' THEN 1 WHEN 'tue' THEN 2 WHEN 'wed' THEN 3
  WHEN 'thu' THEN 4 WHEN 'fri' THEN 5 WHEN 'sat' THEN 6 WHEN 'sun' THEN 7
END`;

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function csvEscape(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── GET /api/admin/timesheets ──────────────────────────────────────────────
router.get('/timesheets', async (req, res, next) => {
  try {
    const { status, employeeId } = req.query;
    const params = [];
    const conditions = [];

    if (status === 'overtime') {
      conditions.push('t.is_overtime_flagged = true');
    } else if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (employeeId) {
      params.push(employeeId);
      conditions.push(`t.user_id = $${params.length}`);
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT t.*,
         u.name        AS employee_name,
         u.email       AS employee_email,
         u.department,
         u.overtime_threshold_hours,
         COALESCE(
           json_agg(
             json_build_object(
               'id', te.id,
               'day_of_week', te.day_of_week,
               'hours', te.hours,
               'amended_hours', te.amended_hours
             ) ORDER BY ${ENTRY_ORDER}
           ) FILTER (WHERE te.id IS NOT NULL),
           '[]'::json
         ) AS entries
       FROM timesheets t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN timesheet_entries te ON te.timesheet_id = t.id
       ${where}
       GROUP BY t.id, u.name, u.email, u.department, u.overtime_threshold_hours
       ORDER BY t.updated_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/timesheets/bulk-approve ────────────────────────────────
router.post('/timesheets/bulk-approve', async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }

    const succeeded = [];
    const failed = [];

    for (const id of ids) {
      try {
        const { rows: tsRows } = await pool.query(
          `SELECT t.*, u.email, u.name FROM timesheets t JOIN users u ON u.id = t.user_id WHERE t.id = $1`,
          [id]
        );
        const ts = tsRows[0];
        if (!ts) { failed.push({ id, reason: 'Not found' }); continue; }
        if (ts.status !== 'submitted') { failed.push({ id, reason: 'Not submitted' }); continue; }

        await pool.query(
          `UPDATE timesheets SET status = 'approved', reviewed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [id]
        );
        await createAuditLog({ timesheetId: id, action: 'approved', performedBy: req.user.id });
        sendApprovalEmail(ts.email, { employeeName: ts.name, weekStart: ts.week_start_date }).catch(console.error);
        succeeded.push(id);
      } catch (err) {
        failed.push({ id, reason: err.message });
      }
    }

    res.json({ succeeded, failed });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/timesheets/:id ─────────────────────────────────────────
router.get('/timesheets/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, u.name AS employee_name, u.email AS employee_email, u.department, u.overtime_threshold_hours
       FROM timesheets t JOIN users u ON u.id = t.user_id WHERE t.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Timesheet not found' });

    const { rows: entries } = await pool.query(
      'SELECT * FROM timesheet_entries WHERE timesheet_id = $1',
      [req.params.id]
    );
    res.json({ ...rows[0], entries });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/timesheets/:id/approve ─────────────────────────────────
router.post('/timesheets/:id/approve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: tsRows } = await pool.query(
      `SELECT t.*, u.email, u.name FROM timesheets t JOIN users u ON u.id = t.user_id WHERE t.id = $1`,
      [id]
    );
    const ts = tsRows[0];
    if (!ts) return res.status(404).json({ error: 'Timesheet not found' });
    if (ts.status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted timesheets can be approved' });
    }

    await pool.query(
      `UPDATE timesheets SET status = 'approved', reviewed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await createAuditLog({ timesheetId: id, action: 'approved', performedBy: req.user.id });
    sendApprovalEmail(ts.email, { employeeName: ts.name, weekStart: ts.week_start_date }).catch(console.error);

    const { rows } = await pool.query('SELECT * FROM timesheets WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/timesheets/:id/reject ──────────────────────────────────
router.post('/timesheets/:id/reject', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    const { rows: tsRows } = await pool.query(
      `SELECT t.*, u.email, u.name FROM timesheets t JOIN users u ON u.id = t.user_id WHERE t.id = $1`,
      [id]
    );
    const ts = tsRows[0];
    if (!ts) return res.status(404).json({ error: 'Timesheet not found' });
    if (ts.status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted timesheets can be rejected' });
    }

    await pool.query(
      `UPDATE timesheets SET status = 'rejected', admin_note = $1, reviewed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [note || null, id]
    );
    await createAuditLog({ timesheetId: id, action: 'rejected', performedBy: req.user.id, note });
    sendRejectionEmail(ts.email, { employeeName: ts.name, weekStart: ts.week_start_date, note }).catch(console.error);

    const { rows } = await pool.query('SELECT * FROM timesheets WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/admin/timesheets/:id/amend-and-approve ────────────────────────
router.put('/timesheets/:id/amend-and-approve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { entries: submittedEntries } = req.body;

    if (!Array.isArray(submittedEntries)) {
      return res.status(400).json({ error: 'entries must be an array' });
    }

    const { rows: tsRows } = await pool.query(
      `SELECT t.*, u.email, u.name FROM timesheets t JOIN users u ON u.id = t.user_id WHERE t.id = $1`,
      [id]
    );
    const ts = tsRows[0];
    if (!ts) return res.status(404).json({ error: 'Timesheet not found' });
    if (ts.status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted timesheets can be amended' });
    }

    const { rows: currentEntries } = await pool.query(
      'SELECT * FROM timesheet_entries WHERE timesheet_id = $1',
      [id]
    );

    const changes = {};
    for (const entry of submittedEntries) {
      const { day_of_week, hours } = entry;
      if (!DAYS.includes(day_of_week)) continue;
      const newHours = Math.min(24, Math.max(0, Math.round((parseFloat(hours) || 0) * 2) / 2));
      const existing = currentEntries.find((e) => e.day_of_week === day_of_week);
      const originalHours = parseFloat(existing?.hours || 0);

      if (Math.abs(newHours - originalHours) >= 0.05) {
        changes[day_of_week] = { before: originalHours, after: newHours };
        await pool.query(
          `INSERT INTO timesheet_entries (timesheet_id, day_of_week, hours, amended_hours)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (timesheet_id, day_of_week) DO UPDATE SET amended_hours = $4`,
          [id, day_of_week, existing?.hours ?? 0, newHours]
        );
      }
    }

    await pool.query(
      `UPDATE timesheets SET status = 'approved', reviewed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );

    const hasChanges = Object.keys(changes).length > 0;
    await createAuditLog({
      timesheetId: id,
      action: hasChanges ? 'amended_and_approved' : 'approved',
      performedBy: req.user.id,
      changesJson: hasChanges ? changes : null,
    });

    if (hasChanges) {
      sendAmendmentEmail(ts.email, { employeeName: ts.name, weekStart: ts.week_start_date, changes }).catch(console.error);
    } else {
      sendApprovalEmail(ts.email, { employeeName: ts.name, weekStart: ts.week_start_date }).catch(console.error);
    }

    const { rows } = await pool.query('SELECT * FROM timesheets WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/employees/overview ──────────────────────────────────────
router.get('/employees/overview', async (req, res, next) => {
  try {
    const weekStart = getMondayOfCurrentWeek();

    const { rows } = await pool.query(
      `SELECT
         u.id, u.name, u.department,
         t.id         AS timesheet_id,
         t.status,
         t.total_hours,
         t.is_overtime_flagged,
         COALESCE(
           (SELECT SUM(hours) FROM timesheet_entries WHERE timesheet_id = t.id), 0
         ) AS computed_hours
       FROM users u
       LEFT JOIN timesheets t
         ON t.user_id = u.id AND t.week_start_date = $1
       WHERE u.role = 'employee'
       ORDER BY u.name`,
      [weekStart]
    );
    res.json({ weekStart, employees: rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/employees ───────────────────────────────────────────────
router.get('/employees', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         u.id, u.name, u.email, u.role, u.department, u.created_at,
         u.overtime_threshold_hours,
         COUNT(DISTINCT t.id)                                              AS total_timesheets,
         COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'submitted')       AS pending,
         COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'approved')        AS approved,
         COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'rejected')        AS rejected,
         COALESCE(SUM(te.hours) FILTER (WHERE t.status = 'approved'), 0)  AS total_approved_hours
       FROM users u
       LEFT JOIN timesheets t ON t.user_id = u.id
       LEFT JOIN timesheet_entries te ON te.timesheet_id = t.id
       WHERE u.role IN ('employee', 'admin')
       GROUP BY u.id
       ORDER BY u.name`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/employees/:id/remind ───────────────────────────────────
router.post('/employees/:id/remind', async (req, res, next) => {
  try {
    const { id } = req.params;
    const weekStart = getMondayOfCurrentWeek();

    const { rows: userRows } = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [id]
    );
    const user = userRows[0];
    if (!user) return res.status(404).json({ error: 'Employee not found' });
    if (user.role !== 'employee') return res.status(400).json({ error: 'User is not an employee' });

    const { rows: existing } = await pool.query(
      `SELECT id FROM timesheets WHERE user_id = $1 AND week_start_date = $2 AND status IN ('submitted','approved')`,
      [id, weekStart]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Employee has already submitted a timesheet this week' });
    }

    await sendReminderEmail(user.email, { employeeName: user.name, weekStart });
    await createAuditLog({
      timesheetId: null,
      action: 'reminder_sent',
      performedBy: req.user.id,
      note: `Reminder sent to ${user.name} for week ${weekStart}`,
    });

    res.json({ message: `Reminder sent to ${user.name}` });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/reminders/remind-all ───────────────────────────────────
router.post('/reminders/remind-all', async (req, res, next) => {
  try {
    const weekStart = getMondayOfCurrentWeek();

    const { rows: employees } = await pool.query(
      `SELECT u.id, u.name, u.email
       FROM users u
       WHERE u.role = 'employee'
         AND NOT EXISTS (
           SELECT 1 FROM timesheets t
           WHERE t.user_id = u.id AND t.week_start_date = $1 AND t.status IN ('submitted','approved')
         )
       ORDER BY u.name`,
      [weekStart]
    );

    const { rows: alreadySubmitted } = await pool.query(
      `SELECT u.name
       FROM users u
       JOIN timesheets t ON t.user_id = u.id
       WHERE u.role = 'employee' AND t.week_start_date = $1 AND t.status IN ('submitted','approved')
       ORDER BY u.name`,
      [weekStart]
    );

    const reminded = [];
    for (const emp of employees) {
      try {
        await sendReminderEmail(emp.email, { employeeName: emp.name, weekStart });
        await createAuditLog({
          timesheetId: null,
          action: 'reminder_sent',
          performedBy: req.user.id,
          note: `Reminder sent to ${emp.name} for week ${weekStart}`,
        });
        reminded.push(emp.name);
      } catch (err) {
        console.error(`Reminder failed for ${emp.email}:`, err.message);
      }
    }

    res.json({
      reminded,
      skipped: alreadySubmitted.map((e) => e.name),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/reports/department-totals ───────────────────────────────
router.get('/reports/department-totals', async (req, res, next) => {
  try {
    const weekStart = req.query.weekStart || getMondayOfCurrentWeek();

    const { rows } = await pool.query(
      `SELECT
         COALESCE(u.department, 'Unassigned')                     AS department,
         COUNT(DISTINCT u.id)::int                                AS employees,
         COALESCE(SUM(eh.total), 0)                              AS total_approved_hours,
         ROUND(
           CASE WHEN COUNT(DISTINCT u.id) > 0
             THEN COALESCE(SUM(eh.total), 0) / COUNT(DISTINCT u.id)::numeric
             ELSE 0 END, 1
         )                                                        AS avg_hours_per_employee,
         COUNT(t.id) FILTER (WHERE t.is_overtime_flagged)::int   AS overtime_count
       FROM users u
       LEFT JOIN timesheets t
         ON t.user_id = u.id AND t.status = 'approved' AND t.week_start_date = $1::DATE
       LEFT JOIN (
         SELECT timesheet_id, SUM(hours) AS total FROM timesheet_entries GROUP BY timesheet_id
       ) eh ON eh.timesheet_id = t.id
       WHERE u.role = 'employee'
       GROUP BY u.department
       ORDER BY department`,
      [weekStart]
    );
    res.json({ weekStart, departments: rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/reports/overtime ────────────────────────────────────────
router.get('/reports/overtime', async (req, res, next) => {
  try {
    const { employeeId, department, from, to } = req.query;
    const params = [];
    const conditions = ['t.is_overtime_flagged = true'];

    if (employeeId) { params.push(employeeId); conditions.push(`u.id = $${params.length}`); }
    if (department) { params.push(department); conditions.push(`u.department = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`t.week_start_date >= $${params.length}::DATE`); }
    if (to) { params.push(to); conditions.push(`t.week_start_date <= $${params.length}::DATE`); }

    const { rows } = await pool.query(
      `SELECT
         u.id AS employee_id,
         u.name AS employee_name,
         COALESCE(u.department, 'Unassigned') AS department,
         t.week_start_date,
         COALESCE(
           (SELECT SUM(hours) FROM timesheet_entries WHERE timesheet_id = t.id), 0
         ) AS total_hours,
         u.overtime_threshold_hours AS threshold,
         COALESCE(
           (SELECT SUM(hours) FROM timesheet_entries WHERE timesheet_id = t.id), 0
         ) - u.overtime_threshold_hours AS overtime_hours,
         t.status
       FROM timesheets t
       JOIN users u ON u.id = t.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.week_start_date DESC, u.name`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/reports/export-csv ──────────────────────────────────────
router.get('/reports/export-csv', async (req, res, next) => {
  try {
    const { employeeIds, departments, from, to, status } = req.query;
    const params = [];
    const conditions = [];

    const empIds = employeeIds ? (Array.isArray(employeeIds) ? employeeIds : [employeeIds]) : [];
    const depts = departments ? (Array.isArray(departments) ? departments : [departments]) : [];

    if (empIds.length) {
      params.push(empIds.map(Number));
      conditions.push(`u.id = ANY($${params.length})`);
    }
    if (depts.length) {
      params.push(depts);
      conditions.push(`u.department = ANY($${params.length})`);
    }
    if (from) { params.push(from); conditions.push(`t.week_start_date >= $${params.length}::DATE`); }
    if (to) { params.push(to); conditions.push(`t.week_start_date <= $${params.length}::DATE`); }
    if (status) { params.push(status); conditions.push(`t.status = $${params.length}`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT
         u.name AS employee_name,
         COALESCE(u.department, '') AS department,
         t.week_start_date,
         MAX(CASE WHEN te.day_of_week = 'mon' THEN COALESCE(te.amended_hours, te.hours, 0) END) AS mon,
         MAX(CASE WHEN te.day_of_week = 'tue' THEN COALESCE(te.amended_hours, te.hours, 0) END) AS tue,
         MAX(CASE WHEN te.day_of_week = 'wed' THEN COALESCE(te.amended_hours, te.hours, 0) END) AS wed,
         MAX(CASE WHEN te.day_of_week = 'thu' THEN COALESCE(te.amended_hours, te.hours, 0) END) AS thu,
         MAX(CASE WHEN te.day_of_week = 'fri' THEN COALESCE(te.amended_hours, te.hours, 0) END) AS fri,
         MAX(CASE WHEN te.day_of_week = 'sat' THEN COALESCE(te.amended_hours, te.hours, 0) END) AS sat,
         MAX(CASE WHEN te.day_of_week = 'sun' THEN COALESCE(te.amended_hours, te.hours, 0) END) AS sun,
         COALESCE(SUM(COALESCE(te.amended_hours, te.hours, 0)), 0) AS total_hours,
         t.is_overtime_flagged,
         t.status,
         t.submitted_at,
         t.reviewed_at,
         t.admin_note
       FROM timesheets t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN timesheet_entries te ON te.timesheet_id = t.id
       ${where}
       GROUP BY t.id, u.name, u.department
       ORDER BY t.week_start_date DESC, u.name`,
      params
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="timesheets.csv"');

    res.write('Employee Name,Department,Week Start,Mon,Tue,Wed,Thu,Fri,Sat,Sun,Total Hours,Overtime Flagged,Status,Submitted At,Approved At,Admin Note\r\n');

    for (const row of rows) {
      const cells = [
        csvEscape(row.employee_name),
        csvEscape(row.department),
        row.week_start_date,
        row.mon ?? 0,
        row.tue ?? 0,
        row.wed ?? 0,
        row.thu ?? 0,
        row.fri ?? 0,
        row.sat ?? 0,
        row.sun ?? 0,
        parseFloat(row.total_hours || 0).toFixed(1),
        row.is_overtime_flagged ? 'Yes' : 'No',
        row.status,
        row.submitted_at ? new Date(row.submitted_at).toISOString() : '',
        row.reviewed_at ? new Date(row.reviewed_at).toISOString() : '',
        csvEscape(row.admin_note || ''),
      ];
      res.write(cells.join(',') + '\r\n');
    }

    res.end();
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/reports/weekly-summary-email ───────────────────────────
router.post('/reports/weekly-summary-email', async (req, res, next) => {
  try {
    await runWeeklySummary();
    res.json({ message: 'Weekly summary email sent' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/users ──────────────────────────────────────────────────
router.post('/users', async (req, res, next) => {
  try {
    const { name, email, password, role, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (!['employee', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be employee or admin' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, department)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, department, created_at`,
      [name.trim(), email.toLowerCase().trim(), hash, role, department?.trim() || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/admin/users/:id ───────────────────────────────────────────────
router.put('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, password } = req.body;

    if (!name && !password) {
      return res.status(400).json({ error: 'Provide a new name or password to update' });
    }
    if (name && name.trim().length === 0) {
      return res.status(400).json({ error: 'Name cannot be blank' });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const { rows: existing } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!existing[0]) return res.status(404).json({ error: 'User not found' });

    const updatedName = name ? name.trim() : existing[0].name;
    const updatedHash = password ? await bcrypt.hash(password, 10) : existing[0].password_hash;

    const { rows } = await pool.query(
      `UPDATE users SET name = $1, password_hash = $2
       WHERE id = $3
       RETURNING id, name, email, role, department, created_at`,
      [updatedName, updatedHash, id]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── Shift helpers ────────────────────────────────────────────────────────────
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

const SHIFT_SELECT = `
  SELECT
    s.*,
    s.date::text AS date,
    creator.name AS created_by_name,
    COUNT(sa.id) FILTER (WHERE sa.status = 'approved')::int AS approved_count,
    COUNT(sa.id) FILTER (WHERE sa.status = 'pending')::int  AS pending_count,
    COALESCE(
      json_agg(
        json_build_object(
          'id', sa.id,
          'user_id', sa.user_id,
          'user_name', assignee.name,
          'status', sa.status,
          'assigned_by', sa.assigned_by
        ) ORDER BY sa.created_at
      ) FILTER (WHERE sa.id IS NOT NULL),
      '[]'::json
    ) AS assignments
  FROM shifts s
  LEFT JOIN users creator ON creator.id = s.created_by
  LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
  LEFT JOIN users assignee ON assignee.id = sa.user_id`;

// ─── GET /api/admin/shifts ───────────────────────────────────────────────────
router.get('/shifts', async (req, res, next) => {
  try {
    const monday = req.query.weekStart || getMondayOfCurrentWeek();
    const sunday = addDays(monday, 6);
    const { rows } = await pool.query(
      `${SHIFT_SELECT}
       WHERE s.date BETWEEN $1::DATE AND $2::DATE
       GROUP BY s.id, creator.name
       ORDER BY s.date, s.start_time`,
      [monday, sunday]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/shifts ──────────────────────────────────────────────────
router.post('/shifts', async (req, res, next) => {
  try {
    const { title, date, start_time, end_time, location, max_staff } = req.body;
    if (!title || !date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Title, date, start time and end time are required' });
    }
    if (end_time <= start_time) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }
    const { rows } = await pool.query(
      `INSERT INTO shifts (title, date, start_time, end_time, location, max_staff, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *, date::text AS date`,
      [title.trim(), date, start_time, end_time, location?.trim() || null, max_staff || 1, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/admin/shifts/:id ───────────────────────────────────────────────
router.put('/shifts/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, date, start_time, end_time, location, max_staff } = req.body;
    if (!title || !date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Title, date, start time and end time are required' });
    }
    if (end_time <= start_time) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }
    const { rows } = await pool.query(
      `UPDATE shifts SET title=$1, date=$2, start_time=$3, end_time=$4, location=$5, max_staff=$6
       WHERE id=$7 RETURNING *, date::text AS date`,
      [title.trim(), date, start_time, end_time, location?.trim() || null, max_staff || 1, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Shift not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/admin/shifts/:id ────────────────────────────────────────────
router.delete('/shifts/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM shifts WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Shift not found' });
    res.json({ message: 'Shift deleted' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/shifts/:id/assignments/:userId/approve ──────────────────
router.post('/shifts/:id/assignments/:userId/approve', async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    const { rows: shiftRows } = await pool.query('SELECT * FROM shifts WHERE id=$1', [id]);
    const shift = shiftRows[0];
    if (!shift) return res.status(404).json({ error: 'Shift not found' });

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM shift_assignments WHERE shift_id=$1 AND status='approved' AND user_id != $2`,
      [id, userId]
    );
    if (countRows[0].count >= shift.max_staff) {
      return res.status(400).json({ error: 'Shift is already at maximum staff capacity' });
    }

    const { rows } = await pool.query(
      `UPDATE shift_assignments SET status='approved' WHERE shift_id=$1 AND user_id=$2 RETURNING *`,
      [id, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Assignment not found' });

    const { rows: userRows } = await pool.query('SELECT name, email FROM users WHERE id=$1', [userId]);
    const user = userRows[0];
    if (user) {
      sendShiftApprovedEmail(user.email, {
        employeeName: user.name,
        shiftTitle: shift.title,
        date: shift.date,
        startTime: shift.start_time,
        endTime: shift.end_time,
        location: shift.location,
      }).catch(console.error);
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/shifts/:id/assignments/:userId/reject ───────────────────
router.post('/shifts/:id/assignments/:userId/reject', async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    const { rows: shiftRows } = await pool.query('SELECT * FROM shifts WHERE id=$1', [id]);
    const shift = shiftRows[0];
    if (!shift) return res.status(404).json({ error: 'Shift not found' });

    const { rows } = await pool.query(
      `UPDATE shift_assignments SET status='rejected' WHERE shift_id=$1 AND user_id=$2 RETURNING *`,
      [id, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Assignment not found' });

    const { rows: userRows } = await pool.query('SELECT name, email FROM users WHERE id=$1', [userId]);
    const user = userRows[0];
    if (user) {
      sendShiftRejectedEmail(user.email, {
        employeeName: user.name,
        shiftTitle: shift.title,
        date: shift.date,
      }).catch(console.error);
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/shifts/:id/assign ──────────────────────────────────────
router.post('/shifts/:id/assign', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const { rows: shiftRows } = await pool.query('SELECT * FROM shifts WHERE id=$1', [id]);
    const shift = shiftRows[0];
    if (!shift) return res.status(404).json({ error: 'Shift not found' });

    const { rows: userRows } = await pool.query(
      `SELECT id, name, email, role FROM users WHERE id=$1`, [userId]
    );
    const user = userRows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'employee') return res.status(400).json({ error: 'Can only assign employees' });

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM shift_assignments WHERE shift_id=$1 AND status='approved' AND user_id != $2`,
      [id, userId]
    );
    if (countRows[0].count >= shift.max_staff) {
      return res.status(400).json({ error: 'Shift is already at maximum staff capacity' });
    }

    await pool.query(
      `INSERT INTO shift_assignments (shift_id, user_id, status, assigned_by)
       VALUES ($1, $2, 'approved', $3)
       ON CONFLICT (shift_id, user_id) DO UPDATE SET status='approved', assigned_by=$3`,
      [id, userId, req.user.id]
    );

    sendShiftAssignedEmail(user.email, {
      employeeName: user.name,
      shiftTitle: shift.title,
      date: shift.date,
      startTime: shift.start_time,
      endTime: shift.end_time,
      location: shift.location,
    }).catch(console.error);

    res.json({ message: `${user.name} assigned to shift` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
