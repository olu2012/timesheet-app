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

const FILTER_TABS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'overtime', label: '🔥 Overtime' },
];

function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm flex items-center gap-3">
      <span>{message}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
    </div>
  );
}

export default function AdminTimesheets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get('status') || '');
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [busy, setBusy] = useState(null);

  // Bulk approve
  const [selected, setSelected] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState(null);

  // Amendment state: { [tsId]: { mon: '8', ... } }
  const [amendState, setAmendState] = useState({});
  const [amendBusy, setAmendBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : '';
      const { data } = await api.get(`/admin/timesheets${qs}`);
      setTimesheets(data);
      setSelected(new Set());
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

  // Initialise amendment state when a submitted timesheet is expanded
  useEffect(() => {
    if (!expanded) return;
    const ts = timesheets.find((t) => t.id === expanded);
    if (!ts || ts.status !== 'submitted') return;
    if (amendState[expanded]) return; // already initialised
    const init = {};
    for (const day of DAYS) {
      const entry = ts.entries?.find((e) => e.day_of_week === day);
      init[day] = String(entry?.amended_hours ?? entry?.hours ?? 0);
    }
    setAmendState((prev) => ({ ...prev, [expanded]: init }));
  }, [expanded, timesheets]); // eslint-disable-line

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

  const handleAmendAndApprove = async (ts) => {
    setAmendBusy(ts.id);
    try {
      const state = amendState[ts.id] || {};
      const entries = DAYS.map((day) => ({
        day_of_week: day,
        hours: parseFloat(state[day] ?? 0),
      }));
      await api.put(`/admin/timesheets/${ts.id}/amend-and-approve`, { entries });
      setAmendState((prev) => { const n = { ...prev }; delete n[ts.id]; return n; });
      setToast('Timesheet amended and approved.');
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Amendment failed');
    } finally {
      setAmendBusy(null);
    }
  };

  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const { data } = await api.post('/admin/timesheets/bulk-approve', {
        ids: Array.from(selected),
      });
      setToast(`${data.succeeded.length} approved${data.failed.length ? `, ${data.failed.length} failed` : ''}.`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Bulk approve failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const submittedIds = timesheets.filter((t) => t.status === 'submitted').map((t) => t.id);
  const allSubmittedSelected = submittedIds.length > 0 && submittedIds.every((id) => selected.has(id));

  const toggleSelectAll = () => {
    if (allSubmittedSelected) {
      setSelected((prev) => {
        const n = new Set(prev);
        submittedIds.forEach((id) => n.delete(id));
        return n;
      });
    } else {
      setSelected((prev) => {
        const n = new Set(prev);
        submittedIds.forEach((id) => n.add(id));
        return n;
      });
    }
  };

  return (
    <div>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <h1 className="text-2xl font-bold text-gray-800">All Timesheets</h1>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button
              onClick={handleBulkApprove}
              disabled={bulkBusy}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {bulkBusy ? 'Approving…' : `Approve Selected (${selected.size})`}
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 mb-5">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === tab.value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {submittedIds.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="ml-auto px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            {allSubmittedSelected ? 'Deselect All' : 'Select All Submitted'}
          </button>
        )}
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
            const isOT = ts.is_overtime_flagged;
            const state = amendState[ts.id] || {};

            return (
              <div
                key={ts.id}
                className={`bg-white rounded-xl shadow-sm border overflow-hidden ${isOT ? 'border-amber-300 bg-amber-50/30' : ''}`}
              >
                {/* Row header */}
                <div className="flex items-center w-full">
                  {/* Checkbox (only for submitted) */}
                  {ts.status === 'submitted' && (
                    <div className="pl-4 pr-2 flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={selected.has(ts.id)}
                        onChange={(e) => toggleSelect(ts.id, e)}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                  {ts.status !== 'submitted' && <div className="pl-4 pr-2 w-8 flex-shrink-0" />}

                  <button
                    className="flex-1 flex flex-wrap items-center justify-between px-3 py-4 hover:bg-gray-50/80 text-left gap-2"
                    onClick={() => setExpanded(open ? null : ts.id)}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      {isOT && <span title="Overtime flagged">🔥</span>}
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
                </div>

                {/* Expanded detail */}
                {open && (
                  <div className="border-t px-5 pb-5 pt-4 bg-gray-50">
                    {/* Overtime banner */}
                    {isOT && (
                      <div className="mb-4 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 text-sm text-amber-800 flex items-center gap-2">
                        🔥 <strong>Overtime flagged:</strong> {total.toFixed(1)} hrs vs {ts.overtime_threshold_hours ?? 40} hr threshold
                      </div>
                    )}

                    {/* Day grid — editable for submitted, static otherwise */}
                    {ts.status === 'submitted' ? (
                      <div className="grid grid-cols-7 gap-2 text-center mb-4">
                        {DAYS.map((day) => {
                          const entry = (ts.entries || []).find((e) => e.day_of_week === day);
                          const origHours = parseFloat(entry?.hours || 0);
                          const currentVal = state[day] ?? String(origHours);
                          const isEdited = Math.abs(parseFloat(currentVal) - origHours) >= 0.05;
                          return (
                            <div key={day}>
                              <div className="text-xs text-gray-400 mb-1">{DAY_SHORT[day]}</div>
                              <input
                                type="number"
                                min={0}
                                max={24}
                                step={0.5}
                                value={currentVal}
                                onChange={(e) =>
                                  setAmendState((prev) => ({
                                    ...prev,
                                    [ts.id]: { ...prev[ts.id], [day]: e.target.value },
                                  }))
                                }
                                className={`w-full text-center text-sm font-semibold rounded-md border px-1 py-1 focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                                  isEdited
                                    ? 'border-amber-400 bg-amber-50 text-amber-800'
                                    : 'border-gray-200'
                                }`}
                              />
                              {isEdited && (
                                <div className="text-xs text-gray-400 mt-0.5">was {origHours.toFixed(1)}</div>
                              )}
                              {entry?.amended_hours != null && !isEdited && (
                                <div className="text-xs text-amber-600 mt-0.5">amended</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-7 gap-2 text-center mb-4">
                        {DAYS.map((day) => {
                          const entry = (ts.entries || []).find((e) => e.day_of_week === day);
                          const displayHours = entry?.amended_hours ?? entry?.hours ?? 0;
                          const isAmended = entry?.amended_hours != null;
                          return (
                            <div key={day}>
                              <div className="text-xs text-gray-400 mb-1">{DAY_SHORT[day]}</div>
                              <div className={`text-sm font-semibold ${isAmended ? 'text-amber-700' : 'text-gray-800'}`}>
                                {parseFloat(displayHours).toFixed(1)}
                              </div>
                              {isAmended && (
                                <div className="text-xs text-amber-500">edited</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

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

                    {/* Actions */}
                    {ts.status === 'submitted' && (
                      <div className="mt-3 flex flex-wrap gap-3 items-start">
                        <button
                          onClick={() => handleAmendAndApprove(ts)}
                          disabled={!!busy || !!amendBusy}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          {amendBusy === ts.id ? 'Saving…' : 'Amend & Approve'}
                        </button>

                        <button
                          onClick={() => handleApprove(ts.id)}
                          disabled={!!busy || !!amendBusy}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          {busy === `${ts.id}-approve` ? 'Approving…' : 'Approve As-Is'}
                        </button>

                        {!isRejecting ? (
                          <button
                            onClick={() => setRejectTarget(ts.id)}
                            disabled={!!busy || !!amendBusy}
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
