const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { sendShiftClaimNotification } = require('../services/email');

const router = express.Router();
router.use(authenticate);

function getMondayOfCurrentWeek() {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// GET /api/shifts?weekStart=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const monday = req.query.weekStart || getMondayOfCurrentWeek();
    const sunday = addDays(monday, 6);

    const { rows } = await pool.query(
      `SELECT
         s.*,
         s.date::text AS date,
         COUNT(sa.id) FILTER (WHERE sa.status = 'approved')::int AS approved_count,
         (
           SELECT json_build_object('id', sa2.id, 'status', sa2.status)
           FROM shift_assignments sa2
           WHERE sa2.shift_id = s.id AND sa2.user_id = $3
           LIMIT 1
         ) AS my_assignment
       FROM shifts s
       LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
       WHERE s.date BETWEEN $1::DATE AND $2::DATE
       GROUP BY s.id
       ORDER BY s.date, s.start_time`,
      [monday, sunday, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/shifts/:id/claim
router.post('/:id/claim', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: shiftRows } = await pool.query('SELECT * FROM shifts WHERE id = $1', [id]);
    const shift = shiftRows[0];
    if (!shift) return res.status(404).json({ error: 'Shift not found' });

    const { rows: existing } = await pool.query(
      'SELECT * FROM shift_assignments WHERE shift_id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (existing[0]) {
      return res.status(400).json({ error: 'You have already claimed this shift' });
    }

    const { rows: approved } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM shift_assignments WHERE shift_id = $1 AND status = 'approved'`,
      [id]
    );
    if (approved[0].count >= shift.max_staff) {
      return res.status(400).json({ error: 'This shift is already full' });
    }

    await pool.query(
      `INSERT INTO shift_assignments (shift_id, user_id) VALUES ($1, $2)`,
      [id, req.user.id]
    );

    const { rows: admins } = await pool.query(`SELECT email FROM users WHERE role = 'admin'`);
    for (const admin of admins) {
      sendShiftClaimNotification(admin.email, {
        employeeName: req.user.name,
        shiftTitle: shift.title,
        date: shift.date,
        startTime: shift.start_time,
        endTime: shift.end_time,
        location: shift.location,
      }).catch(console.error);
    }

    res.status(201).json({ message: 'Shift claimed successfully' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shifts/:id/claim
router.delete('/:id/claim', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      'SELECT * FROM shift_assignments WHERE shift_id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    const assignment = rows[0];
    if (!assignment) return res.status(404).json({ error: 'No claim found' });
    if (assignment.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending claims can be cancelled' });
    }

    await pool.query(
      'DELETE FROM shift_assignments WHERE shift_id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    res.json({ message: 'Claim cancelled' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
