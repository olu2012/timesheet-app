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

function getEightWeeksAgo() {
  const d = new Date(getMondayOfCurrentWeek());
  d.setDate(d.getDate() - 56);
  return d.toISOString().split('T')[0];
}

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

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function ExportCSV() {
  const [allEmployees, setAllEmployees] = useState([]);
  const [allDepartments, setAllDepartments] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [from, setFrom] = useState(getEightWeeksAgo());
  const [to, setTo] = useState(getMondayOfCurrentWeek());
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  useEffect(() => {
    api.get('/admin/employees').then(({ data }) => {
      const emps = data.filter((u) => u.role === 'employee');
      setAllEmployees(emps);
      const depts = [...new Set(emps.map((e) => e.department).filter(Boolean))].sort();
      setAllDepartments(depts);
    }).catch(console.error);
  }, []);

  const buildParams = () => {
    const params = new URLSearchParams();
    selectedEmployees.forEach((id) => params.append('employeeIds', id));
    selectedDepts.forEach((d) => params.append('departments', d));
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status) params.set('status', status);
    return params;
  };

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();
      const { data } = await api.get(`/admin/timesheets?${params.toString()}`);
      setPreview(data);
      setPreviewLoaded(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedEmployees, selectedDepts, from, to, status]); // eslint-disable-line

  const handleExport = () => {
    const params = buildParams();
    const url = `/api/admin/reports/export-csv?${params.toString()}`;
    window.open(url, '_blank');
  };

  const toggleEmployee = (id) => {
    setSelectedEmployees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setPreviewLoaded(false);
  };

  const toggleDept = (dept) => {
    setSelectedDepts((prev) =>
      prev.includes(dept) ? prev.filter((x) => x !== dept) : [...prev, dept]
    );
    setPreviewLoaded(false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Export CSV</h1>
        <div className="flex gap-3">
          <button
            onClick={loadPreview}
            disabled={loading}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Preview'}
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border shadow-sm p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Employee multi-select */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Employees</label>
          <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
            {allEmployees.length === 0 && <p className="text-xs text-gray-400">Loading…</p>}
            {allEmployees.map((emp) => (
              <label key={emp.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                <input
                  type="checkbox"
                  checked={selectedEmployees.includes(String(emp.id))}
                  onChange={() => toggleEmployee(String(emp.id))}
                  className="accent-indigo-600"
                />
                {emp.name}
                {emp.department && <span className="text-gray-400 text-xs">({emp.department})</span>}
              </label>
            ))}
          </div>
          {selectedEmployees.length > 0 && (
            <button onClick={() => { setSelectedEmployees([]); setPreviewLoaded(false); }} className="text-xs text-indigo-600 mt-1 hover:underline">
              Clear selection
            </button>
          )}
        </div>

        {/* Department multi-select */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Departments</label>
          <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
            {allDepartments.length === 0 && <p className="text-xs text-gray-400">None found</p>}
            {allDepartments.map((dept) => (
              <label key={dept} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                <input
                  type="checkbox"
                  checked={selectedDepts.includes(dept)}
                  onChange={() => toggleDept(dept)}
                  className="accent-indigo-600"
                />
                {dept}
              </label>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">From (week start)</label>
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPreviewLoaded(false); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">To (week start)</label>
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPreviewLoaded(false); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Status</label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPreviewLoaded(false); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Preview table */}
      {previewLoaded && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-700">
              Preview — {preview.length} record{preview.length !== 1 ? 's' : ''}
            </h2>
          </div>

          {preview.length === 0 ? (
            <p className="text-gray-500">No records match the selected filters.</p>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Employee</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Dept</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Week</th>
                    {DAYS.map((d) => (
                      <th key={d} className="px-2 py-2 text-center font-semibold text-gray-500 uppercase">{d.charAt(0).toUpperCase() + d.slice(1)}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase">Total</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-500 uppercase">OT</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map((ts) => {
                    const total = (ts.entries || []).reduce((s, e) => s + parseFloat(e.amended_hours ?? e.hours ?? 0), 0);
                    return (
                      <tr key={ts.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{ts.employee_name}</td>
                        <td className="px-3 py-2 text-gray-500">{ts.department || '—'}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(ts.week_start_date)}</td>
                        {DAYS.map((day) => {
                          const entry = (ts.entries || []).find((e) => e.day_of_week === day);
                          const hrs = parseFloat(entry?.amended_hours ?? entry?.hours ?? 0);
                          const isAmended = entry?.amended_hours != null;
                          return (
                            <td key={day} className={`px-2 py-2 text-center ${isAmended ? 'text-amber-700 font-semibold' : 'text-gray-600'}`}>
                              {hrs > 0 ? hrs.toFixed(1) : '—'}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right font-semibold text-gray-800">{total.toFixed(1)}</td>
                        <td className="px-3 py-2 text-center">{ts.is_overtime_flagged ? '🔥' : ''}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${STATUS_BADGE[ts.status]}`}>
                            {ts.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
