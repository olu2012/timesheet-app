const pool = require('./pool');

function getMondayOfCurrentWeek() {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return d.toISOString().split('T')[0];
}

function getLastWeekMonday() {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToCurrMonday = day === 0 ? -6 : 1 - day;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToCurrMonday - 7));
  return d.toISOString().split('T')[0];
}

async function recalcOvertimeFlag(timesheetId) {
  const { rows: entries } = await pool.query(
    'SELECT hours FROM timesheet_entries WHERE timesheet_id = $1',
    [timesheetId]
  );
  const total = entries.reduce((s, e) => s + parseFloat(e.hours || 0), 0);

  const { rows: tsRows } = await pool.query(
    `SELECT u.overtime_threshold_hours
     FROM timesheets t JOIN users u ON u.id = t.user_id
     WHERE t.id = $1`,
    [timesheetId]
  );
  const threshold = tsRows[0]?.overtime_threshold_hours ?? 40;
  const flagged = total > threshold;

  await pool.query(
    'UPDATE timesheets SET total_hours = $1, is_overtime_flagged = $2, updated_at = NOW() WHERE id = $3',
    [total, flagged, timesheetId]
  );
  return { total, flagged, threshold };
}

async function createAuditLog({ timesheetId, action, performedBy, note, changesJson }) {
  await pool.query(
    `INSERT INTO timesheet_audit_log (timesheet_id, action, performed_by, note, changes_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      timesheetId || null,
      action,
      performedBy || null,
      note || null,
      changesJson ? JSON.stringify(changesJson) : null,
    ]
  );
}

module.exports = { getMondayOfCurrentWeek, getLastWeekMonday, recalcOvertimeFlag, createAuditLog };
