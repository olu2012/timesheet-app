import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
          isActive
            ? 'bg-indigo-100 text-indigo-700'
            : 'text-gray-600 hover:text-indigo-600 hover:bg-gray-100'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="bg-white border-b shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-indigo-600 text-lg mr-4">Timesheet</span>
          {user?.role === 'employee' && (
            <>
              <NavItem to="/timesheet">My Timesheet</NavItem>
              <NavItem to="/history">History</NavItem>
            </>
          )}
          {user?.role === 'admin' && (
            <>
              <NavItem to="/admin">Dashboard</NavItem>
              <NavItem to="/admin/timesheets">Timesheets</NavItem>
              <NavItem to="/admin/employees">Employees</NavItem>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">{user?.name}</span>
          <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full capitalize">
            {user?.role}
          </span>
          <button
            onClick={handleLogout}
            className="text-red-500 hover:text-red-700 font-medium"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
