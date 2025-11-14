import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../api/api";
import { useAuth } from "../hooks/useAuth";
import NotificationBell from "./NotificationBell";
import ConfirmationModal from "./ConfirmationModal";
import logo from "../pages/logo.png";

function DentistNavbar() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const { logout } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    api
      .get("/api/user")
      .then((res) => setUser(res.data))
      .catch(() => setUser(null));
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
    <>
      <nav className="navbar navbar-expand-lg navbar-light shadow-sm px-3" style={{background: 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)'}}>
        <div className="container-fluid">
          {/* Left: Logo */}
          <Link className="navbar-brand d-flex align-items-center" to="/dentist">
            <img
              src={logo}
              alt="Kreative Dental Clinic"
              style={{
                height: "32px",
                width: "32px",
                objectFit: "contain",
                marginRight: "8px",
              }}
            />
            <span className="fst-bold" style={{color: 'white'}}>Kreative Dental & Orthodontics</span>
          </Link>

          {/* Toggle for mobile menu */}
          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#dentistNavbarNav"
            aria-controls="dentistNavbarNav"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>

          {/* Right: Navigation Items (collapsible) */}
          <div className="collapse navbar-collapse" id="dentistNavbarNav">
            <div className="navbar-nav ms-auto align-items-lg-center d-flex flex-row gap-2">
              {/* Home Button */}
              <Link 
                to="/dentist" 
                className="btn d-flex align-items-center justify-content-center"
                title="Home"
                style={{
                  color: 'white',
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  width: '40px',
                  height: '40px',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </Link>

              {/* Notification Bell */}
              {user && (
                <div style={{marginLeft: '0.5rem'}}>
                  <NotificationBell />
                </div>
              )}

              {/* LOG OUT Button */}
              {user && (
                <button
                  onClick={handleLogoutClick}
                  className="btn d-flex align-items-center ms-lg-2 mt-2 mt-lg-0"
                  style={{
                    background: 'linear-gradient(90deg, #00b4d8 0%, #0077b6 100%)',
                    color: 'white',
                    border: 'none',
                    fontWeight: '600',
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease',
                    fontSize: '0.9rem',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'linear-gradient(90deg, #0096c7 0%, #0056b3 100%)';
                    e.target.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'linear-gradient(90deg, #00b4d8 0%, #0077b6 100%)';
                    e.target.style.transform = 'translateY(0)';
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#dc3545" style={{marginRight: '0.5rem'}}>
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                  </svg>
                  <span>LOG OUT</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>
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
    </>
  );
}

export default DentistNavbar;
