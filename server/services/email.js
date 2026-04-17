const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const COMPANY = 'RQSO Limited';

function fmtWeek(dateStr) {
  try {
    return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    });
  } catch {
    return dateStr;
  }
}

function header(color = '#4f46e5') {
  return `<div style="background:${color};padding:16px 24px;border-radius:8px 8px 0 0">
    <span style="color:white;font-weight:bold;font-size:18px">${COMPANY}</span>
  </div>`;
}

function footer() {
  return `<p style="color:#6b7280;font-size:12px;margin-top:24px">${COMPANY} — Timesheet Portal</p>`;
}

async function sendApprovalEmail(to, { employeeName, weekStart }) {
  await resend.emails.send({
    from: FROM, to,
    subject: `[${COMPANY}] Your timesheet has been approved ✓`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
      ${header()}
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h2 style="color:#16a34a;margin-top:0">Timesheet Approved</h2>
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Your timesheet for the week of <strong>${fmtWeek(weekStart)}</strong> has been <strong>approved</strong>.</p>
        <p>Thank you for submitting on time!</p>
        ${footer()}
      </div></div>`,
  });
}

async function sendRejectionEmail(to, { employeeName, weekStart, note }) {
  await resend.emails.send({
    from: FROM, to,
    subject: `[${COMPANY}] Your timesheet needs revision`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
      ${header()}
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h2 style="color:#dc2626;margin-top:0">Timesheet Rejected</h2>
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Your timesheet for the week of <strong>${fmtWeek(weekStart)}</strong> has been <strong>rejected</strong>.</p>
        ${note ? `<p style="background:#fef2f2;padding:12px;border-radius:6px;border-left:4px solid #dc2626"><strong>Admin note:</strong> ${note}</p>` : ''}
        <p>Please review your entries and resubmit.</p>
        ${footer()}
      </div></div>`,
  });
}

async function sendAdminSubmitEmail(to, { employeeName, weekStart, totalHours }) {
  await resend.emails.send({
    from: FROM, to,
    subject: `[${COMPANY}] New timesheet submitted — ${employeeName}`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
      ${header()}
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h2 style="color:#4f46e5;margin-top:0">New Timesheet Submission</h2>
        <p>A timesheet is waiting for your review.</p>
        <table style="border-collapse:collapse;width:100%;margin-top:12px">
          <tr><td style="padding:6px 0;color:#6b7280">Employee</td><td><strong>${employeeName}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Week of</td><td><strong>${fmtWeek(weekStart)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Total hours</td><td><strong>${parseFloat(totalHours).toFixed(1)}</strong></td></tr>
        </table>
        <p style="margin-top:16px">Please log in to approve or reject this timesheet.</p>
        ${footer()}
      </div></div>`,
  });
}

async function sendReminderEmail(to, { employeeName, weekStart }) {
  await resend.emails.send({
    from: FROM, to,
    subject: `[${COMPANY}] Reminder: Please submit your timesheet`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
      ${header('#d97706')}
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h2 style="color:#d97706;margin-top:0">Timesheet Reminder</h2>
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>This is a friendly reminder that your timesheet for the week of <strong>${fmtWeek(weekStart)}</strong> has not yet been submitted.</p>
        <p>Please log in and submit your timesheet as soon as possible.</p>
        ${footer()}
      </div></div>`,
  });
}

async function sendAmendmentEmail(to, { employeeName, weekStart, changes }) {
  const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const changeRows = Object.entries(changes)
    .map(([day, { before, after }]) =>
      `<tr>
        <td style="padding:6px 8px;border:1px solid #e5e7eb">${DAY_LABELS[day] || day}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;text-decoration:line-through;color:#9ca3af">${parseFloat(before).toFixed(1)} hrs</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;color:#d97706;font-weight:bold">${parseFloat(after).toFixed(1)} hrs</td>
      </tr>`
    ).join('');

  await resend.emails.send({
    from: FROM, to,
    subject: `[${COMPANY}] Your timesheet was amended and approved`,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:auto">
      ${header()}
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h2 style="color:#16a34a;margin-top:0">Timesheet Amended &amp; Approved</h2>
        <p>Hi <strong>${employeeName}</strong>,</p>
        <p>Your timesheet for the week of <strong>${fmtWeek(weekStart)}</strong> has been reviewed, amended, and approved.</p>
        ${changeRows ? `
        <p style="margin-top:16px"><strong>The following changes were made:</strong></p>
        <table style="border-collapse:collapse;width:100%">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Day</th>
              <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Original</th>
              <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Amended</th>
            </tr>
          </thead>
          <tbody>${changeRows}</tbody>
        </table>` : ''}
        ${footer()}
      </div></div>`,
  });
}

async function sendWeeklySummaryEmail(to, { weekStart, stats, departmentBreakdown, neverSubmitted }) {
  const deptRows = departmentBreakdown.map(d =>
    `<tr>
      <td style="padding:6px 8px;border:1px solid #e5e7eb">${d.department}</td>
      <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right">${parseFloat(d.total_approved_hours || 0).toFixed(1)}</td>
    </tr>`
  ).join('');

  const noSubmitRows = neverSubmitted.map(e =>
    `<li style="margin:4px 0">${e.name}${e.department ? ` (${e.department})` : ''}</li>`
  ).join('');

  await resend.emails.send({
    from: FROM, to,
    subject: `[${COMPANY}] Weekly Timesheet Summary — w/c ${weekStart}`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:auto">
      ${header()}
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h2 style="color:#4f46e5;margin-top:0">Weekly Summary</h2>
        <p>Week commencing <strong>${fmtWeek(weekStart)}</strong></p>

        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr style="background:#f9fafb"><td style="padding:8px;border:1px solid #e5e7eb">Total Submitted</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">${stats.total_submitted}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Approved</td><td style="padding:8px;border:1px solid #e5e7eb;color:#16a34a;font-weight:bold">${stats.total_approved}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:8px;border:1px solid #e5e7eb">Rejected</td><td style="padding:8px;border:1px solid #e5e7eb;color:#dc2626;font-weight:bold">${stats.total_rejected}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Still Pending</td><td style="padding:8px;border:1px solid #e5e7eb;color:#d97706;font-weight:bold">${stats.total_pending}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:8px;border:1px solid #e5e7eb">Overtime Flags</td><td style="padding:8px;border:1px solid #e5e7eb;color:#ea580c;font-weight:bold">${stats.overtime_flags}</td></tr>
        </table>

        ${deptRows ? `
        <h3 style="color:#374151">Department Hours (Approved)</h3>
        <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
          <thead><tr style="background:#f9fafb">
            <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Department</th>
            <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right">Total Hours</th>
          </tr></thead>
          <tbody>${deptRows}</tbody>
        </table>` : ''}

        ${noSubmitRows ? `
        <h3 style="color:#374151">Did Not Submit</h3>
        <ul style="margin:0;padding-left:20px">${noSubmitRows}</ul>` : '<p style="color:#16a34a">All employees submitted their timesheets this week!</p>'}

        ${footer()}
      </div></div>`,
  });
}

async function sendShiftClaimNotification(to, { employeeName, shiftTitle, date, startTime, endTime, location }) {
  await resend.emails.send({
    from: FROM, to,
    subject: `[${COMPANY}] Shift claim — ${employeeName}`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
      ${header()}
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h2 style="color:#4f46e5;margin-top:0">New Shift Claim</h2>
        <p><strong>${employeeName}</strong> has claimed a shift and is awaiting approval.</p>
        <table style="border-collapse:collapse;width:100%;margin-top:12px">
          <tr><td style="padding:6px 0;color:#6b7280">Shift</td><td><strong>${shiftTitle}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Date</td><td><strong>${date}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Time</td><td><strong>${startTime} – ${endTime}</strong></td></tr>
          ${location ? `<tr><td style="padding:6px 0;color:#6b7280">Location</td><td><strong>${location}</strong></td></tr>` : ''}
        </table>
        <p style="margin-top:16px">Please log in to approve or reject this claim.</p>
        ${footer()}
      </div></div>`,
  });
}

async function sendShiftApprovedEmail(to, { employeeName, shiftTitle, date, startTime, endTime, location }) {
  await resend.emails.send({
    from: FROM, to,
    subject: `[${COMPANY}] Shift confirmed — ${shiftTitle}`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
      ${header()}
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h2 style="color:#16a34a;margin-top:0">Shift Approved</h2>
        <p>Hi <strong>${employeeName}</strong>, your shift has been confirmed!</p>
        <table style="border-collapse:collapse;width:100%;margin-top:12px">
          <tr><td style="padding:6px 0;color:#6b7280">Shift</td><td><strong>${shiftTitle}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Date</td><td><strong>${date}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Time</td><td><strong>${startTime} – ${endTime}</strong></td></tr>
          ${location ? `<tr><td style="padding:6px 0;color:#6b7280">Location</td><td><strong>${location}</strong></td></tr>` : ''}
        </table>
        ${footer()}
      </div></div>`,
  });
}

async function sendShiftRejectedEmail(to, { employeeName, shiftTitle, date }) {
  await resend.emails.send({
    from: FROM, to,
    subject: `[${COMPANY}] Shift claim not approved — ${shiftTitle}`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
      ${header()}
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h2 style="color:#dc2626;margin-top:0">Shift Claim Rejected</h2>
        <p>Hi <strong>${employeeName}</strong>, unfortunately your claim for <strong>${shiftTitle}</strong> on <strong>${date}</strong> was not approved.</p>
        <p>Please check the shifts page for other available shifts.</p>
        ${footer()}
      </div></div>`,
  });
}

async function sendShiftAssignedEmail(to, { employeeName, shiftTitle, date, startTime, endTime, location }) {
  await resend.emails.send({
    from: FROM, to,
    subject: `[${COMPANY}] You have been assigned a shift — ${shiftTitle}`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
      ${header()}
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h2 style="color:#4f46e5;margin-top:0">Shift Assigned</h2>
        <p>Hi <strong>${employeeName}</strong>, you have been assigned to the following shift:</p>
        <table style="border-collapse:collapse;width:100%;margin-top:12px">
          <tr><td style="padding:6px 0;color:#6b7280">Shift</td><td><strong>${shiftTitle}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Date</td><td><strong>${date}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Time</td><td><strong>${startTime} – ${endTime}</strong></td></tr>
          ${location ? `<tr><td style="padding:6px 0;color:#6b7280">Location</td><td><strong>${location}</strong></td></tr>` : ''}
        </table>
        ${footer()}
      </div></div>`,
  });
}

module.exports = {
  sendApprovalEmail,
  sendRejectionEmail,
  sendAdminSubmitEmail,
  sendReminderEmail,
  sendAmendmentEmail,
  sendWeeklySummaryEmail,
  sendShiftClaimNotification,
  sendShiftApprovedEmail,
  sendShiftRejectedEmail,
  sendShiftAssignedEmail,
};
