import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Timesheet from './pages/employee/Timesheet';
import History from './pages/employee/History';
import AdminDashboard from './pages/admin/Dashboard';
import AdminTimesheets from './pages/admin/Timesheets';
import AdminEmployees from './pages/admin/Employees';

function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/timesheet'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RoleRedirect />} />

      {/* Employee routes */}
      <Route element={<ProtectedRoute role="employee" />}>
        <Route element={<Layout />}>
          <Route path="/timesheet" element={<Timesheet />} />
          <Route path="/history" element={<History />} />
        </Route>
      </Route>

      {/* Admin routes */}
      <Route element={<ProtectedRoute role="admin" />}>
        <Route element={<Layout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/timesheets" element={<AdminTimesheets />} />
          <Route path="/admin/employees" element={<AdminEmployees />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
