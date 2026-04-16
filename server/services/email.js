const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || 'onboarding@resend.dev';

function fmtWeek(dateStr) {
  try {
    return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    });
  } catch {
    return dateStr;
  }
}

const COMPANY = 'RQSO Limited';

async function sendApprovalEmail(to, { employeeName, weekStart }) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `[${COMPANY}] Your timesheet has been approved ✓`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <div style="background:#4f46e5;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:white;font-weight:bold;font-size:18px">${COMPANY}</span>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="color:#16a34a;margin-top:0">Timesheet Approved</h2>
          <p>Hi <strong>${employeeName}</strong>,</p>
          <p>Your timesheet for the week of <strong>${fmtWeek(weekStart)}</strong> has been <strong>approved</strong>.</p>
          <p>Thank you for submitting on time!</p>
          <p style="color:#6b7280;font-size:12px;margin-top:24px">${COMPANY} — Timesheet Portal</p>
        </div>
      </div>`,
  });
}

async function sendRejectionEmail(to, { employeeName, weekStart, note }) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `[${COMPANY}] Your timesheet needs revision`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <div style="background:#4f46e5;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:white;font-weight:bold;font-size:18px">${COMPANY}</span>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="color:#dc2626;margin-top:0">Timesheet Rejected</h2>
          <p>Hi <strong>${employeeName}</strong>,</p>
          <p>Your timesheet for the week of <strong>${fmtWeek(weekStart)}</strong> has been <strong>rejected</strong>.</p>
          ${note ? `<p style="background:#fef2f2;padding:12px;border-radius:6px;border-left:4px solid #dc2626"><strong>Admin note:</strong> ${note}</p>` : ''}
          <p>Please review your entries and resubmit.</p>
          <p style="color:#6b7280;font-size:12px;margin-top:24px">${COMPANY} — Timesheet Portal</p>
        </div>
      </div>`,
  });
}

async function sendAdminSubmitEmail(to, { employeeName, weekStart, totalHours }) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `[${COMPANY}] New timesheet submitted — ${employeeName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <div style="background:#4f46e5;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:white;font-weight:bold;font-size:18px">${COMPANY}</span>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="color:#4f46e5;margin-top:0">New Timesheet Submission</h2>
          <p>A timesheet is waiting for your review.</p>
          <table style="border-collapse:collapse;width:100%;margin-top:12px">
            <tr><td style="padding:6px 0;color:#6b7280">Employee</td><td><strong>${employeeName}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Week of</td><td><strong>${fmtWeek(weekStart)}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Total hours</td><td><strong>${parseFloat(totalHours).toFixed(1)}</strong></td></tr>
          </table>
          <p style="margin-top:16px">Please log in to approve or reject this timesheet.</p>
          <p style="color:#6b7280;font-size:12px;margin-top:24px">${COMPANY} — Timesheet Portal</p>
        </div>
      </div>`,
  });
}

module.exports = { sendApprovalEmail, sendRejectionEmail, sendAdminSubmitEmail };
