const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { sendAdminSubmitEmail } = require('../services/email');

const router = express.Router();

router.use(authenticate);

// Normalize any date to the Monday of its week (UTC)
function getMondayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

const ENTRY_ORDER = `CASE te.day_of_week
  WHEN 'mon' THEN 1 WHEN 'tue' THEN 2 WHEN 'wed' THEN 3
  WHEN 'thu' THEN 4 WHEN 'fri' THEN 5 WHEN 'sat' THEN 6 WHEN 'sun' THEN 7
END`;

// GET /api/timesheets/my  — all timesheets for the logged-in employee
router.get('/my', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*,
         COALESCE(
           json_agg(
             json_build_object('id', te.id, 'day_of_week', te.day_of_week, 'hours', te.hours)
             ORDER BY ${ENTRY_ORDER}
           ) FILTER (WHERE te.id IS NOT NULL),
           '[]'::json
         ) AS entries
       FROM timesheets t
       LEFT JOIN timesheet_entries te ON te.timesheet_id = t.id
       WHERE t.user_id = $1
       GROUP BY t.id
       ORDER BY t.week_start_date DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/timesheets/my/:weekStart  — get (or create) timesheet for a specific week
router.get('/my/:weekStart', async (req, res, next) => {
  try {
    let weekStart;
    try {
      weekStart = getMondayOfWeek(req.params.weekStart);
    } catch {
      return res.status(400).json({ error: 'Invalid date' });
    }

    // Find existing or create
    let { rows } = await pool.query(
      'SELECT * FROM timesheets WHERE user_id = $1 AND week_start_date = $2',
      [req.user.id, weekStart]
    );
    if (rows.length === 0) {
      const insert = await pool.query(
        'INSERT INTO timesheets (user_id, week_start_date) VALUES ($1, $2) RETURNING *',
        [req.user.id, weekStart]
      );
      rows = insert.rows;
    }
    const timesheet = rows[0];

    const entries = await pool.query(
      `SELECT * FROM timesheet_entries WHERE timesheet_id = $1
       ORDER BY ${ENTRY_ORDER.replace(/te\./g, '')}`,
      [timesheet.id]
    );

    res.json({ ...timesheet, entries: entries.rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/timesheets/:id  — save draft
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes, entries } = req.body;

    const { rows: tsRows } = await pool.query(
      'SELECT * FROM timesheets WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    const ts = tsRows[0];
    if (!ts) return res.status(404).json({ error: 'Timesheet not found' });
    if (ts.status === 'submitted' || ts.status === 'approved') {
      return res.status(400).json({ error: 'Cannot edit a submitted or approved timesheet' });
    }

    await pool.query(
      'UPDATE timesheets SET notes = $1, updated_at = NOW() WHERE id = $2',
      [notes ?? ts.notes, id]
    );

    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const hours = Math.min(24, Math.max(0, parseFloat(entry.hours) || 0));
        // Round to nearest 0.5
        const rounded = Math.round(hours * 2) / 2;
        await pool.query(
          `INSERT INTO timesheet_entries (timesheet_id, day_of_week, hours)
           VALUES ($1, $2, $3)
           ON CONFLICT (timesheet_id, day_of_week) DO UPDATE SET hours = $3`,
          [id, entry.day_of_week, rounded]
        );
      }
    }

    const updated = await pool.query('SELECT * FROM timesheets WHERE id = $1', [id]);
    const updatedEntries = await pool.query(
      `SELECT * FROM timesheet_entries WHERE timesheet_id = $1
       ORDER BY ${ENTRY_ORDER.replace(/te\./g, '')}`,
      [id]
    );
    res.json({ ...updated.rows[0], entries: updatedEntries.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/timesheets/:id/submit  — submit for approval
router.post('/:id/submit', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: tsRows } = await pool.query(
      'SELECT * FROM timesheets WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    const ts = tsRows[0];
    if (!ts) return res.status(404).json({ error: 'Timesheet not found' });
    if (ts.status !== 'draft' && ts.status !== 'rejected') {
      return res.status(400).json({ error: 'Only draft or rejected timesheets can be submitted' });
    }

    await pool.query(
      `UPDATE timesheets
       SET status = 'submitted', submitted_at = NOW(), admin_note = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Calculate total hours for notification
    const { rows: entries } = await pool.query(
      'SELECT hours FROM timesheet_entries WHERE timesheet_id = $1',
      [id]
    );
    const totalHours = entries.reduce((s, e) => s + parseFloat(e.hours), 0);

    // Notify all admins (fire-and-forget — email failures don't block the response)
    const { rows: admins } = await pool.query("SELECT email FROM users WHERE role = 'admin'");
    const empName = req.user.name;
    for (const admin of admins) {
      sendAdminSubmitEmail(admin.email, {
        employeeName: empName,
        weekStart: ts.week_start_date,
        totalHours,
      }).catch(console.error);
    }

    const result = await pool.query('SELECT * FROM timesheets WHERE id = $1', [id]);
    const updatedEntries = await pool.query(
      'SELECT * FROM timesheet_entries WHERE timesheet_id = $1',
      [id]
    );
    res.json({ ...result.rows[0], entries: updatedEntries.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
