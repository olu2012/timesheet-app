import { useState, useEffect, useCallback } from 'react';
import api from '../../api';

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function getMondayOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function getEightWeeksAgo() {
  const d = new Date(getMondayOfCurrentWeek());
  d.setDate(d.getDate() - 56);
  return d.toISOString().split('T')[0];
}

const STATUS_BADGE = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-yellow-100 text-yellow-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
};

export default function OvertimeReport() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    employeeId: '',
    department: '',
    from: getEightWeeksAgo(),
    to: getMondayOfCurrentWeek(),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.employeeId) params.set('employeeId', filters.employeeId);
      if (filters.department) params.set('department', filters.department);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);

      const { data } = await api.get(`/admin/reports/overtime?${params.toString()}`);
      setRows(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    api.get('/admin/employees').then(({ data }) => {
      const emps = data.filter((u) => u.role === 'employee');
      setEmployees(emps);
      const depts = [...new Set(emps.map((e) => e.department).filter(Boolean))].sort();
      setDepartments(depts);
    }).catch(console.error);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (filters.employeeId) params.set('employeeIds', filters.employeeId);
    if (filters.department) params.set('departments', filters.department);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    params.set('status', ''); // all statuses — overtime filter is already applied
    const url = `/api/admin/reports/export-csv?${params.toString()}`;
    window.open(url, '_blank');
  };

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Overtime Report</h1>
        <button
          onClick={handleExportCSV}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border shadow-sm p-4 mb-6 flex flex-wrap gap-4">
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs font-medium text-gray-500">Employee</label>
          <select
            value={filters.employeeId}
            onChange={(e) => setFilter('employeeId', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">All Employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs font-medium text-gray-500">Department</label>
          <select
            value={filters.department}
            onChange={(e) => setFilter('department', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">From (week start)</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilter('from', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">To (week start)</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilter('to', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">No overtime timesheets found for the selected filters.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Department</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Week</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Hrs</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Threshold</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Overtime Hrs</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => {
                const overtimeHrs = parseFloat(row.overtime_hours || 0);
                return (
                  <tr key={i} className="hover:bg-amber-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.employee_name}</td>
                    <td className="px-4 py-3 text-gray-500">{row.department}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(row.week_start_date)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-semibold">
                      {parseFloat(row.total_hours || 0).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{row.threshold}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">
                      +{overtimeHrs.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${STATUS_BADGE[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
