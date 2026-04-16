const express = require('express');
const pool = require('../db/pool');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendApprovalEmail, sendRejectionEmail } = require('../services/email');

const router = express.Router();

router.use(authenticate, requireAdmin);

const ENTRY_ORDER = `CASE te.day_of_week
  WHEN 'mon' THEN 1 WHEN 'tue' THEN 2 WHEN 'wed' THEN 3
  WHEN 'thu' THEN 4 WHEN 'fri' THEN 5 WHEN 'sat' THEN 6 WHEN 'sun' THEN 7
END`;

// GET /api/admin/timesheets?status=submitted
router.get('/timesheets', async (req, res, next) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = 'WHERE t.status = $1';
    }

    const { rows } = await pool.query(
      `SELECT t.*,
         u.name        AS employee_name,
         u.email       AS employee_email,
         u.department,
         COALESCE(
           json_agg(
             json_build_object('id', te.id, 'day_of_week', te.day_of_week, 'hours', te.hours)
             ORDER BY ${ENTRY_ORDER}
           ) FILTER (WHERE te.id IS NOT NULL),
           '[]'::json
         ) AS entries
       FROM timesheets t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN timesheet_entries te ON te.timesheet_id = t.id
       ${where}
       GROUP BY t.id, u.name, u.email, u.department
       ORDER BY t.updated_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/timesheets/:id
router.get('/timesheets/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, u.name AS employee_name, u.email AS employee_email, u.department
       FROM timesheets t JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
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

// POST /api/admin/timesheets/:id/approve
router.post('/timesheets/:id/approve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: tsRows } = await pool.query(
      `SELECT t.*, u.email, u.name
       FROM timesheets t JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [id]
    );
    const ts = tsRows[0];
    if (!ts) return res.status(404).json({ error: 'Timesheet not found' });
    if (ts.status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted timesheets can be approved' });
    }

    await pool.query(
      `UPDATE timesheets
       SET status = 'approved', reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    sendApprovalEmail(ts.email, { employeeName: ts.name, weekStart: ts.week_start_date })
      .catch(console.error);

    const { rows } = await pool.query('SELECT * FROM timesheets WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/timesheets/:id/reject
router.post('/timesheets/:id/reject', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    const { rows: tsRows } = await pool.query(
      `SELECT t.*, u.email, u.name
       FROM timesheets t JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [id]
    );
    const ts = tsRows[0];
    if (!ts) return res.status(404).json({ error: 'Timesheet not found' });
    if (ts.status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted timesheets can be rejected' });
    }

    await pool.query(
      `UPDATE timesheets
       SET status = 'rejected', admin_note = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [note || null, id]
    );

    sendRejectionEmail(ts.email, { employeeName: ts.name, weekStart: ts.week_start_date, note })
      .catch(console.error);

    const { rows } = await pool.query('SELECT * FROM timesheets WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/employees
router.get('/employees', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         u.id, u.name, u.email, u.department, u.created_at,
         COUNT(t.id)                                              AS total_timesheets,
         COUNT(t.id) FILTER (WHERE t.status = 'submitted')       AS pending,
         COUNT(t.id) FILTER (WHERE t.status = 'approved')        AS approved,
         COUNT(t.id) FILTER (WHERE t.status = 'rejected')        AS rejected
       FROM users u
       LEFT JOIN timesheets t ON t.user_id = u.id
       WHERE u.role = 'employee'
       GROUP BY u.id
       ORDER BY u.name`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
