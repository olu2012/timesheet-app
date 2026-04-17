import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const STATUS_PILL = {
  not_started: 'bg-gray-100 text-gray-500',
  draft:       'bg-blue-100 text-blue-700',
  submitted:   'bg-yellow-100 text-yellow-700',
  approved:    'bg-green-100 text-green-700',
  rejected:    'bg-red-100 text-red-700',
};

const STATUS_LABEL = {
  not_started: 'Not Started',
  draft:       'Draft',
  submitted:   'Submitted',
  approved:    'Approved',
  rejected:    'Rejected',
};

function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  const bg = type === 'error' ? 'bg-red-600' : 'bg-gray-900';
  return (
    <div className={`fixed bottom-4 right-4 z-50 ${bg} text-white px-5 py-3 rounded-xl shadow-lg text-sm flex items-center gap-3`}>
      <span>{message}</span>
      <button onClick={onClose} className="text-gray-300 hover:text-white">✕</button>
    </div>
  );
}

export default function EmployeeOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reminderBusy, setReminderBusy] = useState(null);
  const [remindAllBusy, setRemindAllBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data: res } = await api.get('/admin/employees/overview');
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 60000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  const handleRemind = async (emp) => {
    setReminderBusy(emp.id);
    try {
      const { data: res } = await api.post(`/admin/employees/${emp.id}/remind`);
      setToast({ message: res.message, type: 'success' });
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Reminder failed', type: 'error' });
    } finally {
      setReminderBusy(null);
    }
  };

  const handleRemindAll = async () => {
    setRemindAllBusy(true);
    try {
      const { data: res } = await api.post('/admin/reminders/remind-all');
      setToast({
        message: `Reminded ${res.reminded.length} employee(s). Skipped ${res.skipped.length}.`,
        type: 'success',
      });
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Failed', type: 'error' });
    } finally {
      setRemindAllBusy(false);
    }
  };

  if (loading) {
    return <div className="text-center py-16 text-gray-400">Loading…</div>;
  }

  const employees = data?.employees || [];
  const weekStart = data?.weekStart;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Employee Overview</h1>
          {weekStart && (
            <p className="text-sm text-gray-500 mt-0.5">Week of {fmtDate(weekStart)}</p>
          )}
        </div>
        <button
          onClick={handleRemindAll}
          disabled={remindAllBusy}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          🔔 {remindAllBusy ? 'Sending…' : 'Remind All Unsubmitted'}
        </button>
      </div>

      {employees.length === 0 ? (
        <p className="text-gray-500">No employees found.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Department</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Hours</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Overtime</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map((emp) => {
                const statusKey = emp.status || 'not_started';
                const hours = parseFloat(emp.computed_hours || 0);
                const hasSubmitted = emp.status === 'submitted' || emp.status === 'approved';

                return (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                    <td className="px-4 py-3 text-gray-500">{emp.department || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_PILL[statusKey]}`}>
                        {STATUS_LABEL[statusKey]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {emp.status ? hours.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {emp.is_overtime_flagged ? <span title="Overtime">🔥</span> : ''}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {emp.timesheet_id && (
                          <Link
                            to={`/admin/timesheets?employeeId=${emp.id}`}
                            className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                          >
                            View
                          </Link>
                        )}
                        <button
                          onClick={() => handleRemind(emp)}
                          disabled={hasSubmitted || reminderBusy === emp.id}
                          title={hasSubmitted ? 'Already submitted' : 'Send reminder'}
                          className={`text-lg leading-none transition-opacity ${
                            hasSubmitted ? 'opacity-30 cursor-not-allowed' : 'hover:opacity-75 cursor-pointer'
                          }`}
                        >
                          {reminderBusy === emp.id ? '…' : '🔔'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3">Auto-refreshes every 60 seconds.</p>
    </div>
  );
}
