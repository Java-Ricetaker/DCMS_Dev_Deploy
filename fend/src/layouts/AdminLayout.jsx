
import { useEffect, useState } from "react";
import { Outlet, useNavigate, NavLink, useLocation } from "react-router-dom";
import api from "../api/api";
import { useAuth } from "../hooks/useAuth";
import "./AdminLayout.css";
import NotificationsBell from "../components/NotificationBell";
import ConfirmationModal from "../components/ConfirmationModal";
import { Toaster } from "react-hot-toast";

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 992);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Role protection - only allow admin users
  useEffect(() => {
    if (user && user.role !== 'admin') {
      // Redirect non-admin users to their appropriate dashboard
      const redirectPath = user.role === 'staff' ? '/staff' : 
                          user.role === 'patient' ? '/patient' : 
                          user.role === 'dentist' ? '/dentist' : '/';
      navigate(redirectPath, { replace: true });
    }
  }, [user, navigate]);

  // Keep sidebar open by default on lg+, closed on md-
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 992) setSidebarOpen(true);
      else setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
  };

  const handleLogoutConfirm = async () => {
    setShowLogoutModal(false);
    await logout();
    navigate("/");
  };

  const handleLogoutCancel = () => {
    setShowLogoutModal(false);
  };

  return (
    <div className={`admin-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <Toaster position="top-center" />
      {/* Sidebar */}
      <aside className="sidebar  text-white">
        <div className="sidebar-header d-flex align-items-center justify-content-center position-relative">
          <h5 className="m-0 fw-bold text-center w-100">Admin</h5>
          <div className="d-flex align-items-center gap-2 position-absolute" style={{ right: '0.9rem', zIndex: 2 }}>
            {/* Close button (mobile) */}
            <button
              className="btn btn-sm btn-outline-light d-lg-none"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <i className="bi bi-x"></i>
            </button>
          </div>
        </div>

        <div className="nav-scroller">
          <ul className="nav flex-column">
            <li className="nav-item">
            <NavLink
              to="/admin"
              end
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
              </svg>
              <span className="label">Dashboard</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/devices" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
              <span className="label">Device Management</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/staff-register" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zM4 18v-4h3v-2.5c0-.83.67-1.5 1.5-1.5h2c.83 0 1.5.67 1.5 1.5V16h3v2H4zM12.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5zM24 16v2h-3v3h-2v-3h-3v-2h3v-3h2v3h3z"/>
              </svg>
              <span className="label">Manage Staff Account</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/dentists" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
              <span className="label">Dentists</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/schedule" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
              </svg>
              <span className="label">Clinic Schedule</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/appointments" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
              </svg>
              <span className="label">Appointments</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/time-blocks" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
              </svg>
              <span className="label">Time Block Utilization</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/patient-manager" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zM4 18v-4h3v-2.5c0-.83.67-1.5 1.5-1.5h2c.83 0 1.5.67 1.5 1.5V16h3v2H4zM12.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5zM24 16v2h-3v3h-2v-3h-3v-2h3v-3h2v3h3z"/>
              </svg>
              <span className="label">Patient Manager</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/patient-binding" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10.59 13.41c.41.39.41 1.03 0 1.42-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0 5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24 2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24zm2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0 5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24 2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24.973.973 0 0 1 0-1.42z"/>
              </svg>
              <span className="label">Patient-User Binding</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/payment-records" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z"/>
              </svg>
              <span className="label">Payment Records</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/refund-requests" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H4v-4h11v4zm0-5H4V9h11v4zm5 5h-4V9h4v9z"/>
              </svg>
              <span className="label">Refund Requests</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/policy-settings" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
              </svg>
              <span className="label">Policy Settings</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/services" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <span className="label">Manage Services</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/service-discounts" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.79 21L3 11.21v2c0 .45.54.67.85.35l.79-.79 1.41 1.41c.78.78 2.05.78 2.83 0l1.41-1.41 1.41 1.41c.78.78 2.05.78 2.83 0L16.94 12 18.36 13.42c.78.78 2.05.78 2.83 0l1.41-1.41.79.79c.31.32.85.1.85-.35v-2L14.21 21c-.78.78-2.05.78-2.83 0L12.79 21zM11.38 17.41c.78.78 2.05.78 2.83 0l1.41-1.41 1.41 1.41c.78.78 2.05.78 2.83 0l.71-.71L21 16.27V5c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v11.27l.43.43.71.71z"/>
              </svg>
              <span className="label">Service Promos</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/promo-archive" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
              </svg>
              <span className="label">Promo Archive</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/inventory" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 7h-3V6a4 4 0 0 0-8 0v1H5a1 1 0 0 0-1 1v11a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8a1 1 0 0 0-1-1zM10 6a2 2 0 0 1 4 0v1h-4V6zm8 13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9h2v1a1 1 0 0 0 2 0V9h4v1a1 1 0 0 0 2 0V9h2v10z"/>
              </svg>
              <span className="label">Inventory</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/goals" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
              </svg>
              <span className="label">Goals</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/monthly-report" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>
              </svg>
              <span className="label">Monthly Visits</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/analytics" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
              </svg>
              <span className="label">Analytics</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/admin/system-logs" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
              </svg>
              <span className="label">System Logs</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/profile" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.89 1 3 1.89 3 3V21C3 22.11 3.89 23 5 23H11V21H5V19H13V17H5V15H13V13H5V11H13V9H21M15 15V17H19V19H15V21H17V23H21V21H23V17H21V15H15Z"/>
              </svg>
              <span className="label">Account</span>
            </NavLink>
          </li>


            <li className="nav-item mt-4 px-3">
              <button
                className="btn btn-outline-danger w-100 d-flex align-items-center justify-content-center icon-only-btn"
                onClick={handleLogoutClick}
                title="Logout"
                aria-label="Logout"
              >
                {/* Bootstrap Icon */}
                <i className="bi-box-arrow-right fs-5"></i>
                {/* If you don't use Bootstrap Icons, use the emoji instead:
                  <span role="img" aria-label="Logout" className="fs-5">🚪</span>
                */}
                <span className="visually-hidden">Logout</span>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      {/* Main area */}
      <div className={`content-area ${location.pathname === '/admin/device-approvals' ? 'device-approvals-content' : ''}`}>
{/* Topbar */}
<div className="topbar d-flex align-items-center pe-0">
  <button
    className="btn btn-dark toggle-btn me-2"
    onClick={() => setSidebarOpen((v) => !v)}
    aria-label="Toggle sidebar"
  >
    <i className="bi bi-list"></i>
  </button>

  {/* Notification bell next to hamburger menu */}
  <div className="notifications-bell">
    <NotificationsBell />
  </div>
</div>


        {/* Routed content */}
        <main className={`flex-grow-1 ${location.pathname === '/admin/device-approvals' ? 'device-approvals-main' : ''}`}>
          <Outlet />
        </main>
      </div>

      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "show" : ""}`}
        
        onClick={() => setSidebarOpen(false)}
      />
      <ConfirmationModal
        show={showLogoutModal}
        onConfirm={handleLogoutConfirm}
        onCancel={handleLogoutCancel}
        title="Confirm Logout"
        message="Are you sure you want to logout? You will need to login again to access your account."
        confirmText="Logout"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}

export default AdminLayout;
