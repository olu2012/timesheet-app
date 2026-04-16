import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

function StatCard({ label, value, color, to }) {
  const inner = (
    <div className={`border rounded-2xl p-6 ${color} transition-transform hover:scale-105`}>
      <div className="text-4xl font-bold mb-1">{value}</div>
      <div className="text-sm font-medium opacity-80">{label}</div>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/timesheets')
      .then(({ data }) => {
        setStats({
          pending:  data.filter((t) => t.status === 'submitted').length,
          approved: data.filter((t) => t.status === 'approved').length,
          rejected: data.filter((t) => t.status === 'rejected').length,
          total:    data.length,
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16 text-gray-400">Loading…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Pending Review"
          value={stats.pending}
          color="bg-yellow-50 border-yellow-200 text-yellow-800"
          to="/admin/timesheets?status=submitted"
        />
        <StatCard
          label="Approved"
          value={stats.approved}
          color="bg-green-50 border-green-200 text-green-800"
          to="/admin/timesheets?status=approved"
        />
        <StatCard
          label="Rejected"
          value={stats.rejected}
          color="bg-red-50 border-red-200 text-red-800"
          to="/admin/timesheets?status=rejected"
        />
        <StatCard
          label="Total Timesheets"
          value={stats.total}
          color="bg-indigo-50 border-indigo-200 text-indigo-800"
          to="/admin/timesheets"
        />
      </div>

      {stats.pending > 0 && (
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 flex items-center justify-between">
          <p className="text-yellow-800 text-sm font-medium">
            {stats.pending} timesheet{stats.pending !== 1 ? 's' : ''} waiting for review
          </p>
          <Link
            to="/admin/timesheets?status=submitted"
            className="text-sm font-semibold text-yellow-700 underline"
          >
            Review now →
          </Link>
        </div>
      )}
    </div>
  );
}
