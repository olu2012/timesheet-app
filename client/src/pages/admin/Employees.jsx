import { useState, useEffect } from 'react';
import api from '../../api';

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function AdminEmployees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/employees')
      .then(({ data }) => setEmployees(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16 text-gray-400">Loading…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Employees ({employees.length})</h1>

      <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Name', 'Email', 'Department', 'Total', 'Pending', 'Approved', 'Rejected', 'Joined'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.map((emp) => (
              <tr key={emp.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{emp.name}</td>
                <td className="px-4 py-3 text-gray-500">{emp.email}</td>
                <td className="px-4 py-3 text-gray-500">{emp.department || '—'}</td>
                <td className="px-4 py-3 text-center text-gray-600">{emp.total_timesheets}</td>
                <td className="px-4 py-3 text-center">
                  {parseInt(emp.pending) > 0 ? (
                    <span className="bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {emp.pending}
                    </span>
                  ) : (
                    <span className="text-gray-300">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {emp.approved}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {parseInt(emp.rejected) > 0 ? (
                    <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {emp.rejected}
                    </span>
                  ) : (
                    <span className="text-gray-300">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtDate(emp.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
