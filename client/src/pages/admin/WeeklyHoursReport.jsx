import { useState, useEffect, useCallback } from 'react';
import api from '../../api';

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

function fmtWeekRange(monday) {
  const start = new Date(monday + 'T00:00:00');
  const end = new Date(addDays(monday, 6) + 'T00:00:00');
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}

const STATUS_BADGE = {
  draft:     'bg-gray-100 text-gray-500',
  submitted: 'bg-yellow-100 text-yellow-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
};

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeeklyHoursReport() {
  const [weekStart, setWeekStart] = useState(getMondayOfCurrentWeek());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get(`/admin/reports/weekly-hours?weekStart=${weekStart}`);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const employees = data?.employees || [];
  const grandTotal = employees.reduce((s, e) => s + parseFloat(e.total_hours || 0), 0);

  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));
  const goToday  = () => setWeekStart(getMondayOfCurrentWeek());

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Weekly Hours Report</h1>
          {data && (
            <p className="text-sm text-gray-500 mt-0.5">{fmtWeekRange(data.weekStart)}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">← Prev</button>
          <button onClick={goToday}  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">This Week</button>
          <button onClick={nextWeek} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Next →</button>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      {/* Summary card */}
      {!loading && employees.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-indigo-600">{grandTotal.toFixed(1)}</div>
            <div className="text-xs text-gray-500 mt-1">Total Hours (All Staff)</div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {employees.filter((e) => e.status === 'approved').length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Approved</div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-yellow-500">
              {employees.filter((e) => e.status === 'submitted').length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Pending Review</div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-gray-400">
              {employees.filter((e) => !e.status).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Not Submitted</div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : employees.length === 0 ? (
        <p className="text-gray-500">No employees found.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Department</th>
                {DAY_LABELS.map((d) => (
                  <th key={d} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">{d}</th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Total Hrs</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map((emp) => {
                const total = parseFloat(emp.total_hours || 0);
                const hasTimesheet = !!emp.status;
                return (
                  <tr key={emp.id} className={`hover:bg-gray-50 ${!hasTimesheet ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{emp.name}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{emp.department}</td>
                    {DAYS.map((day) => {
                      const hrs = parseFloat(emp[day] || 0);
                      return (
                        <td key={day} className="px-3 py-3 text-center text-gray-700">
                          {hasTimesheet ? (hrs > 0 ? hrs.toFixed(1) : <span className="text-gray-300">—</span>) : <span className="text-gray-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right">
                      {hasTimesheet ? (
                        <span className="font-bold text-gray-900">{total.toFixed(1)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {hasTimesheet ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${STATUS_BADGE[emp.status]}`}>
                          {emp.status}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">No timesheet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Grand total footer */}
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td className="px-4 py-3 font-bold text-gray-700" colSpan={2}>Total</td>
                {DAYS.map((day) => {
                  const dayTotal = employees.reduce((s, e) => s + parseFloat(e[day] || 0), 0);
                  return (
                    <td key={day} className="px-3 py-3 text-center font-semibold text-gray-700">
                      {dayTotal > 0 ? dayTotal.toFixed(1) : <span className="text-gray-300">—</span>}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right font-bold text-indigo-700 text-base">
                  {grandTotal.toFixed(1)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
