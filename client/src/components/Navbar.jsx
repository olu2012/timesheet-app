import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect, useRef } from 'react';

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

function NavDropdown({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  const isActive = items.some((i) => location.pathname === i.to);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 ${
          isActive
            ? 'bg-indigo-100 text-indigo-700'
            : 'text-gray-600 hover:text-indigo-600 hover:bg-gray-100'
        }`}
      >
        {label}
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[180px]">
          {items.map(({ to, label: itemLabel }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive: ia }) =>
                `block px-4 py-2 text-sm transition-colors ${
                  ia ? 'text-indigo-700 bg-indigo-50 font-medium' : 'text-gray-700 hover:bg-gray-50'
                }`
              }
            >
              {itemLabel}
            </NavLink>
          ))}
        </div>
      )}
    </div>
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
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="font-bold text-indigo-600 text-lg mr-3">RQSO Limited</span>

          {user?.role === 'employee' && (
            <>
              <NavItem to="/timesheet">My Timesheet</NavItem>
              <NavItem to="/history">History</NavItem>
              <NavItem to="/shifts">Shifts</NavItem>
            </>
          )}

          {user?.role === 'admin' && (
            <>
              <NavDropdown
                label="Timesheets"
                items={[
                  { to: '/admin', label: 'Dashboard' },
                  { to: '/admin/timesheets', label: 'All Timesheets' },
                  { to: '/admin/employees/overview', label: 'Employee Overview' },
                ]}
              />
              <NavDropdown
                label="Shifts"
                items={[
                  { to: '/admin/shifts', label: 'Manage Shifts' },
                ]}
              />
              <NavDropdown
                label="Reports"
                items={[
                  { to: '/admin/reports/weekly-hours', label: 'Weekly Hours' },
                  { to: '/admin/reports/department-totals', label: 'Department Totals' },
                  { to: '/admin/reports/overtime', label: 'Overtime Report' },
                  { to: '/admin/reports/export', label: 'Export CSV' },
                ]}
              />
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
