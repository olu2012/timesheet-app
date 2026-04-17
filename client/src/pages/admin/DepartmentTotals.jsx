import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../api';

function getMondayOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d.toISOString().split('T')[0];
}

const COLORS = [
  '#6366f1','#10b981','#f59e0b','#3b82f6','#ef4444',
  '#8b5cf6','#06b6d4','#84cc16','#f97316','#ec4899',
];

export default function DepartmentTotals() {
  const [weekStart, setWeekStart] = useState(getMondayOfCurrentWeek());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get(`/admin/reports/department-totals?weekStart=${weekStart}`);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const departments = data?.departments || [];

  const chartData = departments.map((d) => ({
    name: d.department,
    hours: parseFloat(d.total_approved_hours || 0),
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Department Totals</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 font-medium">Week of</label>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : departments.length === 0 ? (
        <p className="text-gray-500">No data for this week.</p>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Department</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Employees</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Approved Hrs</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Hrs / Employee</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Overtime Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {departments.map((dept, i) => (
                  <tr key={dept.department} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      {dept.department}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{dept.employees}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-semibold">
                      {parseFloat(dept.total_approved_hours || 0).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {parseFloat(dept.avg_hours_per_employee || 0).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {dept.overtime_count > 0 ? (
                        <span className="text-amber-600 font-semibold">🔥 {dept.overtime_count}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {chartData.some((d) => d.hours > 0) && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-base font-semibold text-gray-700 mb-4">Approved Hours by Department</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: 32, left: 8, bottom: 0 }}
                >
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(val) => [`${parseFloat(val).toFixed(1)} hrs`, 'Approved Hours']}
                  />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
