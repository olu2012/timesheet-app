const cron = require('node-cron');
const pool = require('../db/pool');
const { getMondayOfCurrentWeek, getLastWeekMonday, createAuditLog } = require('../db/helpers');
const { sendReminderEmail, sendWeeklySummaryEmail } = require('./email');

async function runRemindAll(performedBy = null) {
  const weekStart = getMondayOfCurrentWeek();

  const { rows: employees } = await pool.query(
    `SELECT u.id, u.name, u.email
     FROM users u
     WHERE u.role = 'employee'
       AND NOT EXISTS (
         SELECT 1 FROM timesheets t
         WHERE t.user_id = u.id
           AND t.week_start_date = $1
           AND t.status IN ('submitted', 'approved')
       )
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
        performedBy,
        note: `Reminder sent to ${emp.name} for week ${weekStart}`,
      });
      reminded.push(emp.name);
    } catch (err) {
      console.error(`Reminder failed for ${emp.email}:`, err.message);
    }
  }

  return { reminded };
}

async function runWeeklySummary() {
  const weekStart = getLastWeekMonday();

  const { rows: statsRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('submitted','approved','rejected')) AS total_submitted,
       COUNT(*) FILTER (WHERE status = 'approved')                          AS total_approved,
       COUNT(*) FILTER (WHERE status = 'rejected')                          AS total_rejected,
       COUNT(*) FILTER (WHERE status = 'submitted')                         AS total_pending,
       COUNT(*) FILTER (WHERE is_overtime_flagged = true)                   AS overtime_flags
     FROM timesheets
     WHERE week_start_date = $1`,
    [weekStart]
  );
  const stats = statsRows[0] || {};

  const { rows: deptRows } = await pool.query(
    `SELECT
       COALESCE(u.department, 'Unassigned') AS department,
       COALESCE(SUM(eh.total), 0)           AS total_approved_hours
     FROM users u
     LEFT JOIN timesheets t
       ON t.user_id = u.id AND t.status = 'approved' AND t.week_start_date = $1
     LEFT JOIN (
       SELECT timesheet_id, SUM(hours) AS total FROM timesheet_entries GROUP BY timesheet_id
     ) eh ON eh.timesheet_id = t.id
     WHERE u.role = 'employee'
     GROUP BY u.department
     ORDER BY department`,
    [weekStart]
  );

  const { rows: neverSubmitted } = await pool.query(
    `SELECT u.name, u.department
     FROM users u
     WHERE u.role = 'employee'
       AND NOT EXISTS (
         SELECT 1 FROM timesheets t
         WHERE t.user_id = u.id
           AND t.week_start_date = $1
           AND t.status IN ('submitted', 'approved', 'rejected')
       )
     ORDER BY u.name`,
    [weekStart]
  );

  const { rows: admins } = await pool.query(`SELECT email FROM users WHERE role = 'admin'`);
  for (const admin of admins) {
    sendWeeklySummaryEmail(admin.email, {
      weekStart,
      stats,
      departmentBreakdown: deptRows,
      neverSubmitted,
    }).catch((err) => console.error('Weekly summary email failed:', err.message));
  }

  console.log(`Weekly summary sent for week ${weekStart} to ${admins.length} admin(s).`);
}

function startCronJobs() {
  // Friday at 17:00 UTC — remind all unsubmitted employees
  cron.schedule('0 17 * * 5', () => {
    console.log('[cron] Running Friday reminder...');
    runRemindAll(null).catch((err) => console.error('[cron] Reminder error:', err.message));
  }, { timezone: 'UTC' });

  // Monday at 08:00 UTC — send weekly summary to all admins
  cron.schedule('0 8 * * 1', () => {
    console.log('[cron] Running Monday weekly summary...');
    runWeeklySummary().catch((err) => console.error('[cron] Weekly summary error:', err.message));
  }, { timezone: 'UTC' });

  console.log('Cron jobs scheduled.');
}

module.exports = { startCronJobs, runRemindAll, runWeeklySummary };
