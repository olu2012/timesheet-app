import { useState, useEffect, useCallback } from 'react';
import api from '../../api';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMondayOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function getWeekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const h12 = hour % 12 || 12;
  return `${h12}:${m}${ampm}`;
}

function fmtDay(dateStr) {
  return new Date(dateStr + 'T00:00:00').getDate();
}

function fmtMonthYear(monday) {
  const start = new Date(monday + 'T00:00:00');
  const end = new Date(addDays(monday, 6) + 'T00:00:00');
  const mo = (d) => d.toLocaleDateString('en-US', { month: 'short' });
  if (start.getMonth() === end.getMonth()) return `${mo(start)} ${start.getFullYear()}`;
  return `${mo(start)} – ${mo(end)} ${end.getFullYear()}`;
}

function isToday(dateStr) {
  return dateStr === new Date().toISOString().split('T')[0];
}

function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-4 right-4 z-50 ${type === 'error' ? 'bg-red-600' : 'bg-gray-900'} text-white px-5 py-3 rounded-xl shadow-lg text-sm flex items-center gap-3`}>
      <span>{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

const EMPTY_FORM = { title: '', date: '', start_time: '', end_time: '', location: '', max_staff: 1 };

export default function ManageShifts() {
  const [weekStart, setWeekStart] = useState(getMondayOfCurrentWeek());
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Create / Edit modal
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // Detail modal
  const [selected, setSelected] = useState(null);
  const [actionBusy, setActionBusy] = useState(null);
  const [assignUserId, setAssignUserId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/shifts?weekStart=${weekStart}`);
      setShifts(data);
      if (selected) {
        const fresh = data.find((s) => s.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [weekStart]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/admin/employees')
      .then(({ data }) => setEmployees(data.filter((u) => u.role === 'employee')))
      .catch(console.error);
  }, []);

  const openCreate = (date = '') => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (shift) => {
    setEditingId(shift.id);
    setForm({
      title: shift.title,
      date: shift.date,
      start_time: shift.start_time?.slice(0, 5) || '',
      end_time: shift.end_time?.slice(0, 5) || '',
      location: shift.location || '',
      max_staff: shift.max_staff,
    });
    setFormError('');
    setShowForm(true);
    setSelected(null);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormBusy(true);
    setFormError('');
    try {
      if (editingId) {
        await api.put(`/admin/shifts/${editingId}`, form);
        setToast({ message: 'Shift updated.' });
      } else {
        await api.post('/admin/shifts', form);
        setToast({ message: 'Shift created.' });
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save shift');
    } finally {
      setFormBusy(false);
    }
  };

  const handleDelete = async (shiftId) => {
    if (!window.confirm('Delete this shift? This will also remove all claims.')) return;
    try {
      await api.delete(`/admin/shifts/${shiftId}`);
      setSelected(null);
      setToast({ message: 'Shift deleted.' });
      await load();
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Delete failed', type: 'error' });
    }
  };

  const handleApprove = async (shiftId, userId) => {
    setActionBusy(`approve-${userId}`);
    try {
      await api.post(`/admin/shifts/${shiftId}/assignments/${userId}/approve`);
      setToast({ message: 'Claim approved.' });
      await load();
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Failed', type: 'error' });
    } finally {
      setActionBusy(null);
    }
  };

  const handleReject = async (shiftId, userId) => {
    setActionBusy(`reject-${userId}`);
    try {
      await api.post(`/admin/shifts/${shiftId}/assignments/${userId}/reject`);
      setToast({ message: 'Claim rejected.' });
      await load();
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Failed', type: 'error' });
    } finally {
      setActionBusy(null);
    }
  };

  const handleAssign = async () => {
    if (!assignUserId) return;
    setActionBusy('assign');
    try {
      await api.post(`/admin/shifts/${selected.id}/assign`, { userId: assignUserId });
      setAssignUserId('');
      setToast({ message: 'Staff assigned.' });
      await load();
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Failed', type: 'error' });
    } finally {
      setActionBusy(null);
    }
  };

  const weekDays = getWeekDays(weekStart);
  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));
  const goToday = () => setWeekStart(getMondayOfCurrentWeek());

  const assignedIds = (selected?.assignments || [])
    .filter((a) => a.status === 'approved')
    .map((a) => a.user_id);

  const unassignedEmployees = employees.filter((e) => !assignedIds.includes(e.id));

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Manage Shifts</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={prevWeek} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">← Prev</button>
          <button onClick={goToday} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Today</button>
          <button onClick={nextWeek} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Next →</button>
          <span className="text-sm font-medium text-gray-600 mx-1">{fmtMonthYear(weekStart)}</span>
          <button
            onClick={() => openCreate()}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
          >
            + New Shift
          </button>
        </div>
      </div>

      {/* Calendar */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {weekDays.map((date, i) => (
                <div key={date} className="text-center py-2">
                  <div className="text-xs font-medium text-gray-400 uppercase">{DAY_NAMES[i]}</div>
                  <div className={`text-sm font-bold mt-0.5 w-7 h-7 mx-auto rounded-full flex items-center justify-center ${
                    isToday(date) ? 'bg-indigo-600 text-white' : 'text-gray-800'
                  }`}>
                    {fmtDay(date)}
                  </div>
                </div>
              ))}
            </div>

            {/* Shift columns */}
            <div className="grid grid-cols-7 gap-1.5">
              {weekDays.map((date) => {
                const dayShifts = shifts
                  .filter((s) => s.date === date)
                  .sort((a, b) => a.start_time.localeCompare(b.start_time));

                return (
                  <div
                    key={date}
                    className="min-h-[160px] bg-gray-50 rounded-xl p-1.5 space-y-1.5"
                  >
                    {/* Quick-add button on hover */}
                    <button
                      onClick={() => openCreate(date)}
                      className="w-full text-[10px] text-gray-300 hover:text-indigo-400 hover:bg-white rounded py-0.5 transition-colors"
                    >
                      + add
                    </button>

                    {dayShifts.map((shift) => {
                      const hasPending = shift.pending_count > 0;
                      const staffLabel = `${shift.approved_count}/${shift.max_staff}`;

                      return (
                        <button
                          key={shift.id}
                          onClick={() => { setSelected(shift); setAssignUserId(''); }}
                          className={`w-full text-left rounded-lg p-2 border text-xs transition-shadow hover:shadow-md ${
                            hasPending
                              ? 'bg-yellow-50 border-yellow-300'
                              : shift.approved_count >= shift.max_staff
                              ? 'bg-green-50 border-green-200'
                              : 'bg-white border-indigo-100'
                          }`}
                        >
                          <div className="font-semibold text-gray-800 truncate">{shift.title}</div>
                          <div className="text-gray-500 mt-0.5">{fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}</div>
                          {shift.location && <div className="text-gray-400 truncate">📍 {shift.location}</div>}
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-gray-500">👤 {staffLabel}</span>
                            {hasPending && (
                              <span className="bg-yellow-400 text-yellow-900 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                {shift.pending_count} pending
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              {editingId ? 'Edit Shift' : 'New Shift'}
            </h2>
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">
                {formError}
              </div>
            )}
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Morning Clean"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">End Time *</label>
                  <input
                    type="time"
                    required
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Building A, Floor 2"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Max Staff</label>
                <input
                  type="number"
                  min={1}
                  value={form.max_staff}
                  onChange={(e) => setForm({ ...form, max_staff: parseInt(e.target.value) || 1 })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={formBusy}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {formBusy ? 'Saving…' : editingId ? 'Update Shift' : 'Create Shift'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Shift Detail Modal ──────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{selected.title}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {new Date(selected.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-sm text-gray-600 mt-0.5">
                  {fmtTime(selected.start_time)} – {fmtTime(selected.end_time)}
                  {selected.location && <> · 📍 {selected.location}</>}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Staff: {selected.approved_count}/{selected.max_staff}
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => openEdit(selected)}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="px-3 py-1.5 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Pending Claims */}
              {(() => {
                const pending = (selected.assignments || []).filter((a) => a.status === 'pending');
                return pending.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Pending Claims ({pending.length})
                    </h3>
                    <div className="space-y-2">
                      {pending.map((a) => (
                        <div key={a.user_id} className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                          <span className="text-sm font-medium text-gray-800">{a.user_name}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(selected.id, a.user_id)}
                              disabled={!!actionBusy}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium disabled:opacity-50"
                            >
                              {actionBusy === `approve-${a.user_id}` ? '…' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleReject(selected.id, a.user_id)}
                              disabled={!!actionBusy}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium disabled:opacity-50"
                            >
                              {actionBusy === `reject-${a.user_id}` ? '…' : 'Reject'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Approved Staff */}
              {(() => {
                const approved = (selected.assignments || []).filter((a) => a.status === 'approved');
                return (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Assigned Staff ({approved.length}/{selected.max_staff})
                    </h3>
                    {approved.length === 0 ? (
                      <p className="text-sm text-gray-400">No staff assigned yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {approved.map((a) => (
                          <div key={a.user_id} className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                            <span className="text-green-600">✓</span>
                            <span className="font-medium text-gray-800">{a.user_name}</span>
                            {a.assigned_by && <span className="text-xs text-gray-400 ml-auto">assigned by admin</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Assign Staff */}
              {selected.approved_count < selected.max_staff && unassignedEmployees.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Assign Staff</h3>
                  <div className="flex gap-2">
                    <select
                      value={assignUserId}
                      onChange={(e) => setAssignUserId(e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">Select employee…</option>
                      {unassignedEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssign}
                      disabled={!assignUserId || actionBusy === 'assign'}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {actionBusy === 'assign' ? '…' : 'Assign'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
