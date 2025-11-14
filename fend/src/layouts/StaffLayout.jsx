import { useEffect, useState } from "react";
import { Outlet, useNavigate, NavLink } from "react-router-dom";
import api from "../api/api";
import { useAuth } from "../hooks/useAuth";
import NotificationsBell from "../components/NotificationBell";
import ConfirmationModal from "../components/ConfirmationModal";
import { getFingerprint } from "../utils/getFingerprint";
import "./StaffLayout.css";
import { Toaster } from "react-hot-toast";

function StaffLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [allowInventory, setAllowInventory] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [deviceLoaded, setDeviceLoaded] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Role protection - only allow staff users
  useEffect(() => {
    if (user && user.role !== 'staff') {
      // Redirect non-staff users to their appropriate dashboard
      const redirectPath = user.role === 'admin' ? '/admin' : 
                          user.role === 'patient' ? '/patient' : 
                          user.role === 'dentist' ? '/dentist' : '/';
      navigate(redirectPath, { replace: true });
    }
  }, [user, navigate]);

  // Sidebar is always open for staff
  const sidebarOpen = true;

  // Inventory settings
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await api.get("/api/inventory/settings");
        if (mounted) setAllowInventory(!!data?.staff_can_receive);
      } catch {
        /* ignore */
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Device approval status
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const fingerprint = await getFingerprint();
        api.defaults.headers.common["X-Device-Fingerprint"] = fingerprint;
        const res = await api.get("/api/device-status", {
          headers: { "X-Device-Fingerprint": fingerprint },
        });
        if (mounted) setDeviceStatus(res.data);
      } catch (err) {
        console.error("Device check failed", err);
        if (mounted) setDeviceStatus({ approved: false });
      } finally {
        if (mounted) setDeviceLoaded(true);
      }
    })();
    return () => { mounted = false; };
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

  const linkState = (isActive) =>
    "nav-link" + (isActive ? " active" : "");

  const maybeDisable = () => deviceLoaded && deviceStatus && !deviceStatus.approved;

  return (
    <div className={`staff-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <Toaster position="top-center" />
      {/* Sidebar */}
      <aside className="sidebar bg-dark text-white">
        <div className="sidebar-header d-flex align-items-center justify-content-between">
          <h6 className="m-0 fw-bold">Staff Menu</h6>
          {/* Close (mobile) */}
          <button
            className="btn btn-sm btn-outline-light d-lg-none"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        <ul className="nav flex-column nav-scroller">
          <li className="nav-item">
            <NavLink to="/staff" end className={({ isActive }) => linkState(isActive)}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
              </svg>
              <span className="label">Dashboard</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/staff/appointments"
              className={({ isActive }) =>
                linkState(isActive) + (maybeDisable() ? " disabled text-muted" : "")
              }
              onClick={(e) => { if (maybeDisable()) e.preventDefault(); }}
              style={{ cursor: maybeDisable() ? "not-allowed" : "pointer", opacity: maybeDisable() ? 0.5 : 1 }}
            >
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
              </svg>
              <span className="label">Appointments</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/staff/appointment-finder"
              className={({ isActive }) =>
                linkState(isActive) + (maybeDisable() ? " disabled text-muted" : "")
              }
              onClick={(e) => { if (maybeDisable()) e.preventDefault(); }}
              style={{ cursor: maybeDisable() ? "not-allowed" : "pointer", opacity: maybeDisable() ? 0.5 : 1 }}
            >
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
              <span className="label">Appointment Finder</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/staff/appointment-reminders"
              className={({ isActive }) =>
                linkState(isActive) + (maybeDisable() ? " disabled text-muted" : "")
              }
              onClick={(e) => { if (maybeDisable()) e.preventDefault(); }}
              style={{ cursor: maybeDisable() ? "not-allowed" : "pointer", opacity: maybeDisable() ? 0.5 : 1 }}
            >
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
              </svg>
              <span className="label">Reminders</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/staff/visit-tracker"
              className={({ isActive }) =>
                linkState(isActive) + (maybeDisable() ? " disabled text-muted" : "")
              }
              onClick={(e) => { if (maybeDisable()) e.preventDefault(); }}
              style={{ cursor: maybeDisable() ? "not-allowed" : "pointer", opacity: maybeDisable() ? 0.5 : 1 }}
            >
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
              <span className="label">Patient Visit Tracker</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/staff/payment-records"
              className={({ isActive }) =>
                linkState(isActive) + (maybeDisable() ? " disabled text-muted" : "")
              }
              onClick={(e) => { if (maybeDisable()) e.preventDefault(); }}
              style={{ cursor: maybeDisable() ? "not-allowed" : "pointer", opacity: maybeDisable() ? 0.5 : 1 }}
            >
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z"/>
              </svg>
              <span className="label">Payment Records</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/staff/refund-requests"
              className={({ isActive }) =>
                linkState(isActive) + (maybeDisable() ? " disabled text-muted" : "")
              }
              onClick={(e) => { if (maybeDisable()) e.preventDefault(); }}
              style={{ cursor: maybeDisable() ? "not-allowed" : "pointer", opacity: maybeDisable() ? 0.5 : 1 }}
            >
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
              </svg>
              <span className="label">Refund Requests</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/staff/patient-binding"
              className={({ isActive }) =>
                linkState(isActive) + (maybeDisable() ? " disabled text-muted" : "")
              }
              onClick={(e) => { if (maybeDisable()) e.preventDefault(); }}
              style={{ cursor: maybeDisable() ? "not-allowed" : "pointer", opacity: maybeDisable() ? 0.5 : 1 }}
            >
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10.59 13.41c.41.39.41 1.03 0 1.42-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0 5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24 2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24zm2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0 5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24 2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24.973.973 0 0 1 0-1.42z"/>
              </svg>
              <span className="label">Patient-User Binding</span>
            </NavLink>
          </li>

          {loaded && allowInventory && (
            <>
              <li className="nav-item mt-2 small text-uppercase text-secondary ps-3">Operations</li>
              <li className="nav-item">
                <NavLink
                  to="/staff/inventory"
                  className={({ isActive }) =>
                    linkState(isActive) + (maybeDisable() ? " disabled text-muted" : "")
                  }
                  onClick={(e) => { if (maybeDisable()) e.preventDefault(); }}
                  style={{ cursor: maybeDisable() ? "not-allowed" : "pointer", opacity: maybeDisable() ? 0.5 : 1 }}
                >
                  <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 7h-3V6a4 4 0 0 0-8 0v1H5a1 1 0 0 0-1 1v11a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8a1 1 0 0 0-1-1zM10 6a2 2 0 0 1 4 0v1h-4V6zm8 13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9h2v1a1 1 0 0 0 2 0V9h4v1a1 1 0 0 0 2 0V9h2v10z"/>
                  </svg>
                  <span className="label">Inventory</span>
                </NavLink>
              </li>
            </>
          )}

          <li className="nav-item">
            <NavLink to="/staff/profile" className={({ isActive }) => linkState(isActive)}>
              <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.89 1 3 1.89 3 3V21C3 22.11 3.89 23 5 23H11V21H5V19H13V17H5V15H13V13H5V11H13V9H21M15 15V17H19V19H15V21H17V23H21V21H23V17H21V15H15Z"/>
              </svg>
              <span className="label">Account</span>
            </NavLink>
          </li>
        </ul>

        {/* Logout button - fixed at bottom */}
        <div className="sidebar-footer">
          <button
            className="btn btn-outline-danger w-100 d-flex align-items-center justify-content-center icon-only-btn"
            onClick={handleLogoutClick}
            title="Logout"
            aria-label="Logout"
          >
            <i className="bi-box-arrow-right fs-5"></i>
            <span className="visually-hidden">Logout</span>
          </button>
        </div>
      </aside>

      {/* Right side */}
      <div className="content-area">
       {/* Topbar (bell only) */}
<div className="topbar d-flex align-items-center pe-0">
  <div className="topbar-bell">
    <NotificationsBell />
  </div>
</div>


        <main className="flex-grow-1 p-4 overflow-auto">
          <div className="container-fluid h-100">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile overlay (transparent click catcher) */}
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

export default StaffLayout;
