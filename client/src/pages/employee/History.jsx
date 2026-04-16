import { useState, useEffect } from 'react';
import api from '../../api';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const STATUS_BADGE = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-yellow-100 text-yellow-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
};

export default function History() {
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get('/timesheets/my')
      .then(({ data }) => setTimesheets(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16 text-gray-400">Loading…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Timesheet History</h1>

      {timesheets.length === 0 ? (
        <p className="text-gray-500">No timesheets yet. Start by entering hours for the current week.</p>
      ) : (
        <div className="space-y-3">
          {timesheets.map((ts) => {
            const total = (ts.entries || []).reduce((s, e) => s + parseFloat(e.hours), 0);
            const open = expanded === ts.id;
            return (
              <div key={ts.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
                  onClick={() => setExpanded(open ? null : ts.id)}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-medium text-gray-800">Week of {fmtDate(ts.week_start_date)}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase ${STATUS_BADGE[ts.status]}`}>
                      {ts.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 shrink-0">
                    <span>{total.toFixed(1)} hrs</span>
                    <span>{open ? '▲' : '▼'}</span>
                  </div>
                </button>

                {open && (
                  <div className="border-t px-5 pb-5 pt-4 bg-gray-50">
                    {/* Day breakdown */}
                    <div className="grid grid-cols-7 gap-2 text-center mb-4">
                      {DAYS.map((day) => {
                        const entry = (ts.entries || []).find((e) => e.day_of_week === day);
                        return (
                          <div key={day}>
                            <div className="text-xs text-gray-400 mb-1">{DAY_SHORT[day]}</div>
                            <div className="text-sm font-semibold text-gray-800">
                              {parseFloat(entry?.hours || 0).toFixed(1)}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {ts.notes && (
                      <p className="text-sm text-gray-600 mb-2">
                        <strong>Notes:</strong> {ts.notes}
                      </p>
                    )}
                    {ts.status === 'rejected' && ts.admin_note && (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                        <strong>Admin note:</strong> {ts.admin_note}
                      </div>
                    )}
                    {ts.submitted_at && (
                      <p className="text-xs text-gray-400 mt-2">
                        Submitted: {new Date(ts.submitted_at).toLocaleString()}
                      </p>
                    )}
                    {ts.reviewed_at && (
                      <p className="text-xs text-gray-400">
                        Reviewed: {new Date(ts.reviewed_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
