import { BrowserRouter, Routes, Route } from "react-router-dom";
import AuthRedirector from "../components/AuthRedirector";
import { lazy, Suspense } from "react";

import LandingPage from "../pages/LandingPage";

import InventoryPage from "../pages/Inventory/InventoryPage";
import {
  Gate,
  isAdmin,
  canStaffReceive,
  canConsumeForFinishedVisit,
} from "../components/RouteGuards";

// Auth pages
import Login from "../pages/Login";
import Register from "../pages/Register";
import ForgotPassword from "../pages/ForgotPassword";
import ResetPassword from "../pages/ResetPassword";
import VerifyEmail from "../pages/VerifyEmail";
import VerifySuccess from "../pages/VerifySuccess";
import VerifyEmailRedirect from "../pages/VerifyEmailRedirect";
import NotFound from "../pages/NotFound";

// Admin layout and pages
import AdminLayout from "../layouts/AdminLayout";
import AdminDashboard from "../pages/Admin/Dashboard";
import AdminDeviceManager from "../pages/Admin/AdminDeviceManager";
import ManageStaffAccount from "../pages/Admin/ManageStaffAccount";
import AdminProfile from "../pages/Admin/AdminProfile";
import AdminServices from "../pages/Admin/ServiceManager";
import ServiceDiscountManager from "../pages/Admin/ServiceDiscountManager";
import PromoArchive from "../pages/Admin/PromoArchive";
import ScheduleManager from "../pages/Admin/ScheduleManager";
import ClinicCalendarManager from "../pages/Admin/ClinicCalendarManager";
import AdminMonthlyReport from "../pages/Admin/AdminMonthlyReport";
import AdminGoalsPage from "../pages/Admin/AdminGoalsPage";
import SystemLogsPage from "../pages/Admin/SystemLogsPage";
import AdminAnalyticsDashboard from "../pages/Admin/AdminAnalyticsDashboard";
import PatientManager from "../pages/Admin/PatientManager";
import TimeBlockUtilizationDashboard from "../pages/Admin/TimeBlockUtilizationDashboard";
import PaymentRecords from "../pages/Admin/PaymentRecords";
import AdminPatientUserBindingPage from "../pages/Admin/PatientUserBindingPage";
import RefundRequestManager from "../pages/Admin/RefundRequestManager";
import RefundSettings from "../pages/Admin/RefundSettings";
import PolicySettings from "../pages/Admin/PolicySettings";
const DentistScheduleManager = lazy(() =>
  import("../pages/Admin/DentistScheduleManager")
); // Lazy load dentist schedule manager

// Staff layout and pages
import StaffLayout from "../layouts/StaffLayout";
import StaffDashboard from "../pages/Staff/StaffDashboard";
import StaffProfile from "../pages/Staff/StaffProfile";
// Lazy load appointment-related components for code splitting
const StaffAppointmentManager = lazy(() => import("../pages/Staff/StaffAppointmentManager"));
const AppointmentFinder = lazy(() => import("../pages/Staff/AppointmentFinder"));
const VisitTrackerManager = lazy(() => import("../components/Staff/VisitTrackerManager"));
import AdminAppointmentManager from "../pages/Admin/AdminAppointmentManager"; // Admin appointment management
import AppointmentReminders from "../pages/Staff/AppointmentReminders";
import ConsumeStockPage from "../pages/Staff/ConsumeStockPage";
import StaffPaymentRecords from "../pages/Staff/PaymentRecords";
import StaffPatientUserBindingPage from "../pages/Staff/PatientUserBindingPage";

// Patient layout and pages
import PatientLayout from "../layouts/PatientLayout";
import PatientHomepage from "../pages/Patient/PatientHomepage";
import BookAppointment from "../pages/Patient/BookAppointment";
import PatientProfile from "../pages/Patient/PatientProfile";
import PatientAppointments from "../pages/Patient/PatientAppointments";

// Dentist layout and pages
import DentistLayout from "../layouts/DentistLayout";
import DentistHomepage from "../pages/Dentist/DentistHomepage";
import DentistProfile from "../pages/Dentist/DentistProfile";
import DentistDashboard from "../pages/Dentist/DentistDashboard";
import DentistSchedule from "../pages/Dentist/DentistSchedule";
import DentistVisitManager from "../pages/Dentist/DentistVisitManager";
import DentistScheduleView from "../pages/Dentist/DentistScheduleView";

//
import NotificationsPage from "../pages/NotificationsPage";
import PaymentRedirect from "../components/PaymentRedirect";
//


// import 'bootstrap/dist/css/bootstrap.min.css';
// import 'bootstrap-icons/font/bootstrap-icons.css';

export default function AppRouter() {
  return (
    <BrowserRouter basename="/">
      <AuthRedirector /> {/* Redirects based on auth state */}
      <Routes>
        {/* Public / Auth Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/password-reset/:token" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/verify-success" element={<VerifySuccess />} />
        <Route path="/verify-email/:id/:hash" element={<VerifyEmailRedirect />} />
        <Route path="/notifications" element={<NotificationsPage />} />

        {/* Admin Routes */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="devices" element={<AdminDeviceManager />} />
          <Route path="staff-register" element={<ManageStaffAccount />} />
          <Route path="profile" element={<AdminProfile />} />
          <Route path="services" element={<AdminServices />} />
          <Route
            path="service-discounts"
            element={<ServiceDiscountManager />}
          />
          <Route path="promo-archive" element={<PromoArchive />} />
          <Route path="schedule" element={<ScheduleManager />} />

          <Route path="clinic-calendar" element={<ClinicCalendarManager />} />
          <Route path="monthly-report" element={<AdminMonthlyReport />} />
          <Route path="analytics" element={<AdminAnalyticsDashboard />} />
          <Route path="goals" element={<AdminGoalsPage />} />
          <Route
            path="dentists"
            element={
              <Suspense fallback={<div>Loading…</div>}>
                <DentistScheduleManager />
              </Suspense>
            }
          />
          <Route
            path="inventory"
            element={
              <Gate allow={({ user }) => user?.role === "admin"} to="/admin">
                <InventoryPage />
              </Gate>
            }
          />
          {/* Admin Appointments with Visit Tracking */}
          <Route path="appointments" element={<AdminAppointmentManager />} />
          {/* Patient Manager */}
          <Route path="patient-manager" element={<PatientManager />} />
          {/* Payment Records */}
          <Route path="payment-records" element={<PaymentRecords />} />
          {/* System Logs */}
          <Route path="system-logs" element={<SystemLogsPage />} />
          {/* Time Block Utilization Dashboard */}
          <Route path="time-blocks" element={<TimeBlockUtilizationDashboard />} />
          {/* Patient-User Binding */}
          <Route path="patient-binding" element={<AdminPatientUserBindingPage />} />
          {/* Refund Management */}
          <Route path="refund-requests" element={<RefundRequestManager />} />
          <Route path="refund-settings" element={<RefundSettings />} />
          {/* Policy Settings */}
          <Route path="policy-settings" element={<PolicySettings />} />
          {/* Add more admin routes as needed */}
        </Route>

        {/* Staff Routes */}
        <Route path="/staff" element={<StaffLayout />}>
          <Route index element={<StaffDashboard />} />
          <Route path="profile" element={<StaffProfile />} />
          <Route 
            path="appointments" 
            element={
              <Suspense fallback={<div>Loading appointments...</div>}>
                <StaffAppointmentManager />
              </Suspense>
            } 
          />
          <Route 
            path="appointment-finder" 
            element={
              <Suspense fallback={<div>Loading appointment finder...</div>}>
                <AppointmentFinder />
              </Suspense>
            } 
          />
          <Route
            path="appointment-reminders"
            element={<AppointmentReminders />}
          />
          <Route path="payment-records" element={<StaffPaymentRecords />} />
          {/* Refund Management */}
          <Route path="refund-requests" element={<RefundRequestManager />} />
          {/* Patient-User Binding */}
          <Route path="patient-binding" element={<StaffPatientUserBindingPage />} />
          {/* Patient Visit Tracker */}
          <Route
            path="visit-tracker"
            element={
              <Suspense fallback={<div>Loading visit tracker...</div>}>
                <VisitTrackerManager />
              </Suspense>
            }
          />
          <Route
            path="inventory"
            element={
              <Gate allow={canStaffReceive} to="/staff">
                <InventoryPage />
              </Gate>
            }
          />
          <Route //// inside onFinish handler navigate(`/staff/visits/${visit.id}/consume`, { state: { visitFinished: true } });
            path="visits/:id/consume"
            element={
              <Gate
                allow={({ user, settings }) =>
                  canConsumeForFinishedVisit({
                    user,
                    settings,
                    visitFinished: true,
                  })
                }
                to="/staff"
              >
                <ConsumeStockPage />
              </Gate>
            }
          />
          {/* Add more staff routes as needed */}
        </Route>

        {/* Patient Routes */}
        <Route path="/patient" element={<PatientLayout />}>
          <Route index element={<PatientHomepage />} />
          <Route path="appointment" element={<BookAppointment />} />
          <Route path="profile" element={<PatientProfile />} />
          <Route path="appointments" element={<PatientAppointments />} />
        </Route>

        {/* Dentist Routes */}
        <Route path="/dentist" element={<DentistLayout />}>
          <Route index element={<DentistHomepage />} />
          <Route path="dashboard" element={<DentistDashboard />} />
          <Route path="profile" element={<DentistProfile />} />
          <Route path="schedule" element={<DentistSchedule />} />
          <Route path="visit-manager" element={<DentistVisitManager />} />
          <Route path="visit/:visitCode" element={<DentistVisitManager />} />
          <Route path="schedule-view" element={<DentistScheduleView />} />
        </Route>
        {/* Payment Result Routes */}
        <Route path="/pay/success" element={<PaymentRedirect to="/patient" />} />
        <Route path="/pay/failure" element={<PaymentRedirect to="/patient" />} />
        <Route path="/pay/cancel" element={<PaymentRedirect to="/patient" />} />
        {/* Catch-all for 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
