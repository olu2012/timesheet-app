import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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

export default function AdminTimesheets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get('status') || '');
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [busy, setBusy] = useState(null); // `${id}-approve` | `${id}-reject`

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : '';
      const { data } = await api.get(`/admin/timesheets${qs}`);
      setTimesheets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
    if (filter) setSearchParams({ status: filter });
    else setSearchParams({});
  }, [filter, load, setSearchParams]);

  const handleApprove = async (id) => {
    setBusy(`${id}-approve`);
    try {
      await api.post(`/admin/timesheets/${id}/approve`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async (id) => {
    setBusy(`${id}-reject`);
    try {
      await api.post(`/admin/timesheets/${id}/reject`, { note: rejectNote });
      setRejectTarget(null);
      setRejectNote('');
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">All Timesheets</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : timesheets.length === 0 ? (
        <p className="text-gray-500">No timesheets found.</p>
      ) : (
        <div className="space-y-3">
          {timesheets.map((ts) => {
            const total = (ts.entries || []).reduce((s, e) => s + parseFloat(e.hours), 0);
            const open = expanded === ts.id;
            const isRejecting = rejectTarget === ts.id;

            return (
              <div key={ts.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                {/* Row header */}
                <button
                  className="w-full flex flex-wrap items-center justify-between px-5 py-4 hover:bg-gray-50 text-left gap-2"
                  onClick={() => setExpanded(open ? null : ts.id)}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <span className="font-semibold text-gray-800">{ts.employee_name}</span>
                      {ts.department && (
                        <span className="ml-2 text-xs text-gray-400">{ts.department}</span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">Week of {fmtDate(ts.week_start_date)}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase ${STATUS_BADGE[ts.status]}`}>
                      {ts.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500 shrink-0">
                    <span>{total.toFixed(1)} hrs</span>
                    <span>{open ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded detail */}
                {open && (
                  <div className="border-t px-5 pb-5 pt-4 bg-gray-50">
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
                    {ts.admin_note && (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 mb-3">
                        <strong>Admin note:</strong> {ts.admin_note}
                      </div>
                    )}

                    {/* Approve / Reject actions */}
                    {ts.status === 'submitted' && (
                      <div className="mt-3 flex flex-wrap gap-3 items-start">
                        <button
                          onClick={() => handleApprove(ts.id)}
                          disabled={!!busy}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          {busy === `${ts.id}-approve` ? 'Approving…' : 'Approve'}
                        </button>

                        {!isRejecting ? (
                          <button
                            onClick={() => setRejectTarget(ts.id)}
                            disabled={!!busy}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                          >
                            Reject
                          </button>
                        ) : (
                          <div className="flex flex-col gap-2 flex-1 max-w-sm">
                            <textarea
                              value={rejectNote}
                              onChange={(e) => setRejectNote(e.target.value)}
                              placeholder="Rejection note (optional)"
                              rows={2}
                              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleReject(ts.id)}
                                disabled={!!busy}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                              >
                                {busy === `${ts.id}-reject` ? 'Rejecting…' : 'Confirm Reject'}
                              </button>
                              <button
                                onClick={() => { setRejectTarget(null); setRejectNote(''); }}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {ts.submitted_at && (
                      <p className="text-xs text-gray-400 mt-3">
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
