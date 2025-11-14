import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import DentistNavbar from "../components/DentistNavbar";
import "./DentistLayout.css";
import DentistPasswordGate from "../components/DentistPasswordGate";
import { Toaster } from "react-hot-toast";

function DentistLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Role protection - only allow dentist users
  useEffect(() => {
    if (user && user.role !== 'dentist') {
      // Redirect non-dentist users to their appropriate dashboard
      const redirectPath = user.role === 'admin' ? '/admin' : 
                          user.role === 'staff' ? '/staff' : 
                          user.role === 'patient' ? '/patient' : '/';
      navigate(redirectPath, { replace: true });
    }
  }, [user, navigate]);
  
  // Check if current route is the homepage
  const isHomepage = location.pathname === "/dentist" || location.pathname === "/dentist/";
  
  return (
    <div className="d-flex flex-column min-vh-100 bg-light dentist-layout">
      <Toaster position="top-center" />
      <DentistNavbar />
      
      {isHomepage ? (
        // Full-width layout for homepage
        <main className="flex-grow-1">
          <DentistPasswordGate>
            <Outlet />
          </DentistPasswordGate>
        </main>
      ) : (
        // Full-width responsive layout for all other pages
        <main className="flex-grow-1">
          <DentistPasswordGate>
            <Outlet />
          </DentistPasswordGate>
        </main>
      )}
    </div>
  );
}

export default DentistLayout;
