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
  if (start.getMonth() === end.getMonth()) {
    return `${mo(start)} ${start.getFullYear()}`;
  }
  return `${mo(start)} – ${mo(end)} ${end.getFullYear()}`;
}

function isToday(dateStr) {
  return dateStr === new Date().toISOString().split('T')[0];
}

const STATUS_STYLE = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-4 right-4 z-50 ${type === 'error' ? 'bg-red-600' : 'bg-gray-900'} text-white px-5 py-3 rounded-xl shadow-lg text-sm flex items-center gap-3`}>
      <span>{message}</span>
      <button onClick={onClose} className="text-gray-300 hover:text-white">✕</button>
    </div>
  );
}

export default function EmployeeShifts() {
  const [weekStart, setWeekStart] = useState(getMondayOfCurrentWeek());
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/shifts?weekStart=${weekStart}`);
      setShifts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const handleClaim = async (shiftId) => {
    setBusy(`claim-${shiftId}`);
    try {
      await api.post(`/shifts/${shiftId}/claim`);
      setToast({ message: 'Shift claimed! Awaiting approval.', type: 'success' });
      await load();
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Failed to claim shift', type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async (shiftId) => {
    setBusy(`cancel-${shiftId}`);
    try {
      await api.delete(`/shifts/${shiftId}/claim`);
      setToast({ message: 'Claim cancelled.', type: 'success' });
      await load();
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Failed to cancel', type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const weekDays = getWeekDays(weekStart);
  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));
  const goToday = () => setWeekStart(getMondayOfCurrentWeek());

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Available Shifts</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">← Prev</button>
          <button onClick={goToday} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Today</button>
          <button onClick={nextWeek} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Next →</button>
          <span className="ml-2 text-sm font-medium text-gray-600">{fmtMonthYear(weekStart)}</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
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
                  <div key={date} className="min-h-[160px] bg-gray-50 rounded-xl p-1.5 space-y-1.5">
                    {dayShifts.length === 0 && (
                      <div className="h-full flex items-center justify-center">
                        <span className="text-xs text-gray-300">—</span>
                      </div>
                    )}
                    {dayShifts.map((shift) => {
                      const spotsLeft = shift.max_staff - (shift.approved_count || 0);
                      const myAssignment = shift.my_assignment;
                      const isBusy = busy === `claim-${shift.id}` || busy === `cancel-${shift.id}`;

                      return (
                        <div
                          key={shift.id}
                          className={`rounded-lg p-2 border text-xs ${
                            myAssignment?.status === 'approved'
                              ? 'bg-green-50 border-green-200'
                              : myAssignment?.status === 'pending'
                              ? 'bg-yellow-50 border-yellow-200'
                              : myAssignment?.status === 'rejected'
                              ? 'bg-red-50 border-red-200'
                              : spotsLeft <= 0
                              ? 'bg-gray-100 border-gray-200'
                              : 'bg-white border-indigo-100'
                          }`}
                        >
                          <div className="font-semibold text-gray-800 truncate">{shift.title}</div>
                          <div className="text-gray-500 mt-0.5">{fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}</div>
                          {shift.location && (
                            <div className="text-gray-400 truncate mt-0.5">📍 {shift.location}</div>
                          )}

                          {/* Status or action */}
                          <div className="mt-1.5">
                            {myAssignment ? (
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex px-1.5 py-0.5 rounded-full font-semibold uppercase text-[10px] ${STATUS_STYLE[myAssignment.status]}`}>
                                  {myAssignment.status}
                                </span>
                                {myAssignment.status === 'pending' && (
                                  <button
                                    onClick={() => handleCancel(shift.id)}
                                    disabled={isBusy}
                                    className="text-[10px] text-red-500 hover:text-red-700 disabled:opacity-50"
                                  >
                                    {isBusy ? '…' : 'Cancel'}
                                  </button>
                                )}
                              </div>
                            ) : spotsLeft <= 0 ? (
                              <span className="text-gray-400 text-[10px]">Full</span>
                            ) : (
                              <div>
                                <div className="text-gray-400 text-[10px] mb-1">{spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</div>
                                <button
                                  onClick={() => handleClaim(shift.id)}
                                  disabled={isBusy}
                                  className="w-full px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-medium disabled:opacity-50"
                                >
                                  {isBusy ? '…' : 'Claim'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!loading && shifts.length === 0 && (
        <p className="text-center text-gray-400 mt-6">No shifts scheduled for this week.</p>
      )}
    </div>
  );
}
