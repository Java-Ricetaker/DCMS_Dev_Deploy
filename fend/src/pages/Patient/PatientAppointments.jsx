import { useEffect, useState, useRef } from "react";
import api from "../../api/api";
import PatientServiceHistory from "../../components/Patient/PatientServiceHistory";
import ConfirmationModal from "../../components/ConfirmationModal";
import toast, { Toaster } from "react-hot-toast";

function PatientAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [meta, setMeta] = useState({});
  const [paying, setPaying] = useState(null); // appointment_id being processed
  const [canceling, setCanceling] = useState(null); // appointment_id being cancelled
  const [rescheduleModal, setRescheduleModal] = useState(null); // appointment being rescheduled
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  
  // Tab state for switching between appointments and service history
  const [activeTab, setActiveTab] = useState("appointments");
  
  // Date filter states
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  // Track which tabs have been loaded (for lazy loading)
  const tabsLoaded = useRef({
    appointments: false,
    history: false
  });
  
  // CSRF initialized flag
  const csrfInitialized = useRef(false);

  // Initialize CSRF and load default tab on mount
  useEffect(() => {
    const initializeAndLoad = async () => {
      try {
        await api.get("/sanctum/csrf-cookie");
        csrfInitialized.current = true;
        // Load appointments tab immediately since it's the default
        fetchAppointments(currentPage);
      } catch (e) {
        console.warn("CSRF prime failed (will retry later)", e);
        // Still try to load appointments even if CSRF prime fails
        fetchAppointments(currentPage);
      }
    };
    initializeAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load appointments tab when active or page changes (skip initial load)
  useEffect(() => {
    if (activeTab === "appointments" && csrfInitialized.current && tabsLoaded.current.appointments) {
      fetchAppointments(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, activeTab]);

  // Refresh appointments when user returns to the page (e.g., after payment)
  useEffect(() => {
    const handleFocus = () => {
      if (activeTab === "appointments") {
        console.log('Page focused, refreshing appointments...');
        fetchAppointments(currentPage);
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && activeTab === "appointments") {
        console.log('Page visible, refreshing appointments...');
        fetchAppointments(currentPage);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentPage, activeTab]);

  const fetchAppointments = async (page = 1) => {
    try {
      setLoading(true);
      
      // Build query parameters
      const params = new URLSearchParams({ page: page.toString() });
      
      // Add date filters if present
      if (startDate) {
        params.append('start_date', startDate);
      }
      if (endDate) {
        params.append('end_date', endDate);
      }
      
      const res = await api.get(`/api/user-appointments?${params.toString()}`, {
        // this route often probes auth; ignore 401 auto-redirects
        skip401Handler: true,
      });
      
      // Debug: Log the response to see payment status
      console.log('Appointments API Response:', res.data.data);
      
      setAppointments(res.data.data);
      setMeta({
        current_page: res.data.current_page,
        last_page: res.data.last_page,
        per_page: res.data.per_page,
        total: res.data.total,
      });
      
      // Mark appointments tab as loaded
      tabsLoaded.current.appointments = true;
    } catch (err) {
      console.error("Failed to fetch appointments", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelClick = (id) => {
    setSelectedAppointmentId(id);
    setShowCancelModal(true);
  };

  const handleCancel = async () => {
    if (!selectedAppointmentId) return;

    try {
      setCanceling(selectedAppointmentId);
      setShowCancelModal(false);
      await api.get("/sanctum/csrf-cookie");
      const response = await api.post(`/api/appointment/${selectedAppointmentId}/cancel`);
      
      // Check if refund request was created
      const refundMessage = response?.data?.refund_request_created 
        ? " A refund request has been created and will be processed shortly." 
        : "";
      
      toast.success("Appointment cancelled successfully!" + refundMessage, {
        style: {
          background: '#28a745',
          color: '#fff',
          borderRadius: '8px',
          padding: '16px',
          fontSize: '16px',
        },
        duration: 4000,
      });
      
      fetchAppointments(currentPage);
      setSelectedAppointmentId(null);
    } catch (err) {
      console.error("Cancel failed", err);
      const serverMsg =
        err.response?.data?.message ||
        "Failed to cancel appointment. Please try again.";
      toast.error(serverMsg, {
        style: {
          background: '#dc3545',
          color: '#fff',
          borderRadius: '8px',
          padding: '16px',
        },
      });
    } finally {
      setCanceling(null);
    }
  };

  const handlePayNow = async (appointmentId) => {
    try {
      setPaying(appointmentId);

      // ✅ 1) make sure we have fresh CSRF + session
      await api.get("/sanctum/csrf-cookie");

      // ✅ 2) let backend compute amount + create Maya checkout
      const { data } = await api.post(
        "/api/maya/payments",
        { appointment_id: appointmentId },
        { skip401Handler: true }
      );

      if (data?.redirect_url) {
        // ✅ 3) go to Maya sandbox hosted page
        window.location.href = data.redirect_url;
      } else {
        toast.error("Payment link not available. Please try again.");
      }
    } catch (err) {
      console.error("Create Maya payment failed", err);
      // surface server hint if available
      const serverMsg =
        err.response?.data?.message ||
        err.response?.data?.maya?.message ||
        "Unable to start payment. Please try again.";
      toast.error(serverMsg);
    } finally {
      setPaying(null);
    }
  };

  const handleOpenReschedule = (appointment) => {
    setRescheduleModal(appointment);
    setRescheduleDate("");
    setRescheduleSlots([]);
    setSelectedRescheduleSlot("");
  };

  const handleRescheduleDateChange = async (e) => {
    const date = e.target.value;
    setRescheduleDate(date);
    setRescheduleSlots([]);
    setSelectedRescheduleSlot("");

    if (date && rescheduleModal) {
      try {
        const res = await api.get(
          `/api/appointment/available-slots?date=${date}&service_id=${rescheduleModal.service.id}`
        );
        setRescheduleSlots(res.data.slots);
      } catch (err) {
        console.error("Failed to fetch available slots", err);
        setRescheduleSlots([]);
      }
    }
  };

  const handleRescheduleSubmit = async () => {
    if (!rescheduleDate || !selectedRescheduleSlot || !rescheduleModal) {
      toast.error("Please select both date and time slot.");
      return;
    }

    try {
      setRescheduleLoading(true);
      await api.post(`/api/appointments/${rescheduleModal.id}/reschedule`,{
        date: rescheduleDate,
        start_time: selectedRescheduleSlot,
      });

      toast.success("Appointment rescheduled successfully! It will need staff approval.");
      setRescheduleModal(null);
      setRescheduleDate("");
      setRescheduleSlots([]);
      setSelectedRescheduleSlot("");
      fetchAppointments(currentPage);
    } catch (err) {
      console.error("Reschedule failed", err);
      const errorData = err.response?.data;
      
      // Check if this is a blocked patient error
      if (errorData?.blocked) {
        toast.error(errorData.message);
      } else {
        const serverMsg = errorData?.message || "Failed to reschedule appointment.";
        toast.error(serverMsg);
      }
    } finally {
      setRescheduleLoading(false);
    }
  };

  const handleCloseReschedule = () => {
    setRescheduleModal(null);
    setRescheduleDate("");
    setRescheduleSlots([]);
    setSelectedRescheduleSlot("");
  };

  // Handle date filter changes
  const handleApplyDateFilter = () => {
    // Reset to page 1 when applying filters
    setCurrentPage(1);
    fetchAppointments(1);
  };

  const handleClearDateFilter = () => {
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
    // Fetch without filters
    fetchAppointmentsWithoutFilters(1);
  };

  const fetchAppointmentsWithoutFilters = async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.get(`/api/user-appointments?page=${page}`, {
        skip401Handler: true,
      });
      
      console.log('Appointments API Response:', res.data.data);
      
      setAppointments(res.data.data);
      setMeta({
        current_page: res.data.current_page,
        last_page: res.data.last_page,
        per_page: res.data.per_page,
        total: res.data.total,
      });
      
      tabsLoaded.current.appointments = true;
    } catch (err) {
      console.error("Failed to fetch appointments", err);
    } finally {
      setLoading(false);
    }
  };

  // Helper functions for date formatting
  const todayStr = () => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  };

  const tomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  const sevenDaysOutStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  };


  const renderStatusBadge = (status) => {
    const map = {
      approved: "bg-success",
      pending: "bg-warning text-dark",
      rejected: "bg-danger",
      cancelled: "bg-secondary text-white fw-semibold",
      completed: "bg-primary",
    };
    return <span className={`badge ${map[status] || "bg-secondary"}`}>{status}</span>;
  };

  return (
    <>
      <Toaster position="top-center" />
      <ConfirmationModal
        show={showCancelModal}
        onConfirm={handleCancel}
        onCancel={() => {
          setShowCancelModal(false);
          setSelectedAppointmentId(null);
        }}
        title="Cancel Appointment"
        message="Are you sure you want to cancel this appointment?"
        confirmText="Yes, Cancel"
        cancelText="No, Keep It"
        variant="danger"
      />
    <div className="w-100">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4">
            <h2 className="h4 mb-3 mb-md-0">
              <i className="bi bi-calendar3 me-2"></i>
              My Appointments & History
            </h2>
            <div className="d-flex gap-2">
              <button 
                className="btn btn-outline-primary btn-sm"
                onClick={() => fetchAppointments(currentPage)}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                    Refreshing...
                  </>
                ) : (
                  <>
                    <i className="bi bi-arrow-clockwise me-1"></i>
                    Refresh
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="d-flex gap-2 mb-4" role="group" aria-label="Content tabs">
            <button
              className={`btn flex-fill flex-sm-grow-0 border-0 shadow-sm ${
                activeTab === "appointments" ? "" : "btn-outline-primary"
              }`}
              onClick={() => setActiveTab("appointments")}
              type="button"
              style={{
                background: activeTab === "appointments" 
                  ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                  : 'transparent',
                color: activeTab === "appointments" ? 'white' : '#3b82f6',
                border: activeTab === "appointments" ? 'none' : '1px solid #3b82f6',
                borderRadius: '8px',
                padding: '12px 16px',
                fontWeight: '600',
                transition: 'all 0.3s ease',
                minWidth: '140px'
              }}
            >
              <i className="bi bi-calendar3 me-2"></i>
              <span className="d-none d-sm-inline">Appointments</span>
              <span className="d-sm-none">Appts</span>
            </button>
            <button
              className={`btn flex-fill flex-sm-grow-0 border-0 shadow-sm ${
                activeTab === "history" ? "" : "btn-outline-primary"
              }`}
              onClick={() => setActiveTab("history")}
              type="button"
              style={{
                background: activeTab === "history" 
                  ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                  : 'transparent',
                color: activeTab === "history" ? 'white' : '#3b82f6',
                border: activeTab === "history" ? 'none' : '1px solid #3b82f6',
                borderRadius: '8px',
                padding: '12px 16px',
                fontWeight: '600',
                transition: 'all 0.3s ease',
                minWidth: '140px'
              }}
            >
              <i className="bi bi-clock-history me-2"></i>
              <span className="d-none d-sm-inline">Service History</span>
              <span className="d-sm-none">History</span>
            </button>
          </div>

          {/* Date Filter - Only show for appointments tab */}
          {activeTab === "appointments" && (
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body">
                <div className="row g-3 align-items-end">
                  <div className="col-md-4">
                    <label htmlFor="startDate" className="form-label fw-semibold">
                      <i className="bi bi-calendar-check me-2 text-primary"></i>
                      Start Date
                    </label>
                    <input
                      id="startDate"
                      type="date"
                      className="form-control"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      placeholder="Select start date"
                    />
                    <small className="text-muted">
                      Filter from this date
                    </small>
                  </div>
                  <div className="col-md-4">
                    <label htmlFor="endDate" className="form-label fw-semibold">
                      <i className="bi bi-calendar-x me-2 text-primary"></i>
                      End Date
                    </label>
                    <input
                      id="endDate"
                      type="date"
                      className="form-control"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate || undefined}
                      placeholder="Select end date"
                      disabled={!startDate}
                    />
                    <small className="text-muted">
                      {startDate ? "Filter up to this date" : "Select start date first"}
                    </small>
                  </div>
                  <div className="col-md-4">
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-primary flex-fill"
                        onClick={handleApplyDateFilter}
                        disabled={!startDate || loading}
                      >
                        {loading ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                            Loading...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-funnel me-1"></i>
                            Apply Filter
                          </>
                        )}
                      </button>
                      <button
                        className="btn btn-outline-secondary"
                        onClick={handleClearDateFilter}
                        disabled={!startDate && !endDate || loading}
                        title="Clear filters"
                      >
                        <i className="bi bi-x-circle"></i>
                      </button>
                    </div>
                  </div>
                </div>
                {(startDate || endDate) && (
                  <div className="mt-3">
                    <div className="alert alert-info mb-0 d-flex align-items-center">
                      <i className="bi bi-info-circle me-2"></i>
                      <span>
                        {startDate && !endDate && `Showing appointments on ${startDate}`}
                        {startDate && endDate && `Showing appointments from ${startDate} to ${endDate}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab Content */}
          <div className="tab-content">
            {activeTab === "appointments" && (
              <div className="tab-pane fade show active">
                {/* Desktop Table View */}
                <div className="d-none d-lg-block">
                  <div className="card border-0 shadow-sm">
                    <div className="card-body p-0">
                      <div className="table-responsive">
                        <table className="table table-hover mb-0">
                          <thead className="table-light">
                            <tr>
                              <th>Date & Time</th>
                              <th>Service</th>
                              <th>Payment Method</th>
                              <th>Payment Status</th>
                              <th>Appointment Status</th>
                              <th>Notes</th>
                              <th style={{ width: 160 }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {loading ? (
                              <tr>
                                <td colSpan="7" className="text-center py-5">
                                  <div className="spinner-border text-primary" role="status">
                                    <span className="visually-hidden">Loading...</span>
                                  </div>
                                  <p className="text-muted mt-2 mb-0">Loading appointments...</p>
                                </td>
                              </tr>
                            ) : appointments.length === 0 ? (
                              <tr>
                                <td colSpan="7" className="text-center py-5">
                                  <i className="bi bi-calendar-x display-4 text-muted"></i>
                                  <h6 className="mt-3 text-muted">No appointments yet</h6>
                                  <p className="text-muted mb-3">You haven't booked any appointments yet.</p>
                                  <a href="/patient/appointment" className="btn btn-primary">
                                    <i className="bi bi-calendar-plus me-2"></i>
                                    Book Your First Appointment
                                  </a>
                                </td>
                              </tr>
                            ) : (
                              appointments.map((a) => {
                            const showPayNow =
                              a.payment_method === "maya" &&
                              a.payment_status === "awaiting_payment" &&
                              a.status === "approved";

                            const showReschedule = a.payment_method === "maya" && a.payment_status === "paid" && (a.status === "approved" || a.status === "pending");

                            return (
                              <tr key={a.id}>
                                <td>
                                  <div className="fw-medium">{a.date}</div>
                                  <small className="text-muted">{a.start_time}</small>
                                </td>
                                <td>
                                  <div className="fw-medium">{a.service?.name || "—"}</div>
                                </td>
                                <td>
                                  <span className="badge bg-light text-dark text-capitalize">
                                    {a.payment_method}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className={`badge ${
                                      a.payment_status === "paid"
                                        ? "bg-success"
                                        : a.payment_status === "awaiting_payment"
                                        ? "bg-warning text-dark"
                                        : "bg-secondary"
                                    }`}
                                  >
                                    {a.payment_status?.replace('_', ' ')}
                                  </span>
                                </td>
                                <td>
                                  {renderStatusBadge(a.status)}
                                  {a.status === "cancelled" && a.refund_request && (
                                    <div className="mt-1">
                                      <small className={`badge ${
                                        a.refund_request.status === "pending" ? "bg-warning text-dark" :
                                        a.refund_request.status === "approved" ? "bg-info" :
                                        a.refund_request.status === "processed" ? "bg-success" :
                                        a.refund_request.status === "completed" ? "bg-primary" :
                                        a.refund_request.status === "rejected" ? "bg-danger" : "bg-secondary"
                                      }`}>
                                        Refund: {a.refund_request.status}
                                        {a.refund_request.refund_amount > 0 && ` (₱${Number(a.refund_request.refund_amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})`}
                                      </small>
                                    </div>
                                  )}
                                </td>
                                <td className="text-muted small">{a.notes || "—"}</td>
                                <td>
                                  <div className="d-flex gap-1 flex-wrap">
                                    {showPayNow && (
                                      <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => handlePayNow(a.id)}
                                        disabled={paying === a.id}
                                      >
                                        {paying === a.id ? (
                                          <>
                                            <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                            Redirecting...
                                          </>
                                        ) : (
                                          "Pay now"
                                        )}
                                      </button>
                                    )}

                                    {showReschedule && (
                                      <button
                                        className="btn btn-warning btn-sm"
                                        onClick={() => handleOpenReschedule(a)}
                                        title="Reschedule Appointment"
                                      >
                                        <i className="bi bi-calendar-event me-1"></i>
                                        Reschedule
                                      </button>
                                    )}

                                    {/* Show cancel button for pending, approved (unpaid/awaiting), or approved paid Maya appointments */}
                                    {(a.status === "pending" || 
                                      (a.status === "approved" && 
                                       (a.payment_status === "unpaid" || 
                                        a.payment_status === "awaiting_payment" || 
                                        (a.payment_method === "maya" && a.payment_status === "paid")))) && (
                                      <button
                                        className="btn btn-outline-danger btn-sm"
                                        onClick={() => handleCancelClick(a.id)}
                                        disabled={canceling === a.id || paying === a.id}
                                      >
                                        {canceling === a.id ? (
                                          <>
                                            <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                            Canceling...
                                          </>
                                        ) : (
                                          <>
                                            <i className="bi bi-x-circle me-1"></i>
                                            Cancel
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              );
                            })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile Card View */}
                <div className="d-lg-none">
                  {loading ? (
                    <div className="card border-0 shadow-sm">
                      <div className="card-body text-center py-5">
                        <div className="spinner-border text-primary" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        <p className="text-muted mt-2 mb-0">Loading appointments...</p>
                      </div>
                    </div>
                  ) : appointments.length === 0 ? (
                    <div className="card border-0 shadow-sm">
                      <div className="card-body text-center py-5">
                        <i className="bi bi-calendar-x display-4 text-muted"></i>
                        <h6 className="mt-3 text-muted">No appointments yet</h6>
                        <p className="text-muted mb-3">You haven't booked any appointments yet.</p>
                        <a href="/patient/appointment" className="btn btn-primary">
                          <i className="bi bi-calendar-plus me-2"></i>
                          Book Your First Appointment
                        </a>
                      </div>
                    </div>
                  ) : (
                    appointments.map((a) => {
                      const showPayNow =
                        a.payment_method === "maya" &&
                        a.payment_status === "awaiting_payment" &&
                        a.status === "approved";

                      const showReschedule = a.payment_method === "maya" && a.payment_status === "paid" && (a.status === "approved" || a.status === "pending");

                      return (
                    <div key={a.id} className="card mb-3 border-0 shadow-sm">
                      <div className="card-body">
                        <div className="row">
                          <div className="col-8">
                            <h6 className="card-title mb-1">{a.service?.name || "—"}</h6>
                            <p className="card-text text-muted mb-2">
                              <i className="bi bi-calendar me-1"></i>
                              {a.date} at {a.start_time}
                            </p>
                          </div>
                          <div className="col-4 text-end">
                            {renderStatusBadge(a.status)}
                          </div>
                        </div>
                        
                        <div className="row mt-2">
                          <div className="col-6">
                            <small className="text-muted">Payment Method:</small>
                            <div className="badge bg-light text-dark text-capitalize">
                              {a.payment_method}
                            </div>
                          </div>
                          <div className="col-6">
                            <small className="text-muted">Payment Status:</small>
                            <div>
                              <span
                                className={`badge ${
                                  a.payment_status === "paid"
                                    ? "bg-success"
                                    : a.payment_status === "awaiting_payment"
                                    ? "bg-warning text-dark"
                                    : "bg-secondary"
                                }`}
                              >
                                {a.payment_status?.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>

                        {a.status === "cancelled" && a.refund_request && (
                          <div className="mt-2">
                            <small className="text-muted">Refund Status:</small>
                            <div>
                              <small className={`badge ${
                                a.refund_request.status === "pending" ? "bg-warning text-dark" :
                                a.refund_request.status === "approved" ? "bg-info" :
                                a.refund_request.status === "processed" ? "bg-success" :
                                a.refund_request.status === "rejected" ? "bg-danger" : "bg-secondary"
                              }`}>
                                {a.refund_request.status}
                                {a.refund_request.refund_amount > 0 && ` - ₱${Number(a.refund_request.refund_amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
                              </small>
                            </div>
                          </div>
                        )}

                        {a.notes && (
                          <div className="mt-2">
                            <small className="text-muted">Notes:</small>
                            <p className="small mb-0">{a.notes}</p>
                          </div>
                        )}

                        <div className="d-flex gap-2 mt-3">
                          {showPayNow && (
                            <button
                              className="btn btn-primary btn-sm flex-fill"
                              onClick={() => handlePayNow(a.id)}
                              disabled={paying === a.id}
                            >
                              {paying === a.id ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                  Redirecting...
                                </>
                              ) : (
                                "Pay now"
                              )}
                            </button>
                          )}

                          {showReschedule && (
                            <button
                              className="btn btn-warning btn-sm flex-fill"
                              onClick={() => handleOpenReschedule(a)}
                            >
                              <i className="bi bi-calendar-event me-1"></i>
                              Reschedule
                            </button>
                          )}

                          {/* Show cancel button for pending, approved (unpaid/awaiting), or approved paid Maya appointments */}
                          {(a.status === "pending" || 
                            (a.status === "approved" && 
                             (a.payment_status === "unpaid" || 
                              a.payment_status === "awaiting_payment" || 
                              (a.payment_method === "maya" && a.payment_status === "paid")))) && (
                            <button
                              className="btn btn-outline-danger btn-sm flex-fill"
                              onClick={() => handleCancelClick(a.id)}
                              disabled={canceling === a.id || paying === a.id}
                            >
                              {canceling === a.id ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                  Canceling...
                                </>
                              ) : (
                                <>
                                  <i className="bi bi-x-circle me-1"></i>
                                  Cancel
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                      );
                    })
                  )}
                </div>

                {/* Pagination */}
                {!loading && meta.last_page > 1 && (
                <div className="d-flex justify-content-between align-items-center mt-4">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                  >
                    <i className="bi bi-chevron-left me-1"></i>
                    Previous
                  </button>

                  <span className="text-muted">
                    Page {meta.current_page} of {meta.last_page}
                  </span>

                  <button
                    className="btn btn-outline-secondary btn-sm"
                    disabled={currentPage === meta.last_page}
                    onClick={() => setCurrentPage(currentPage + 1)}
                  >
                    Next
                    <i className="bi bi-chevron-right ms-1"></i>
                  </button>
                </div>
                )}
              </div>
            )}

            {activeTab === "history" && (
              <div className="tab-pane fade show active">
                <PatientServiceHistory />
              </div>
            )}
          </div>

          {/* Reschedule Modal */}
          {rescheduleModal && (
            <div className="modal show d-block" style={{ 
              backgroundColor: 'rgba(0,0,0,0.5)',
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1050,
              overflowY: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem"
            }} tabIndex="-1">
              <div className="modal-dialog modal-dialog-centered" style={{
                margin: "0 auto",
                maxHeight: "calc(100vh - 2rem)",
                width: "100%"
              }}>
                <div className="modal-content" style={{
                  display: "flex",
                  flexDirection: "column",
                  maxHeight: "calc(100vh - 2rem)",
                  overflow: "hidden"
                }}>
                  <div className="modal-header flex-shrink-0" style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    backgroundColor: "#fff",
                    borderBottom: "1px solid #dee2e6"
                  }}>
                    <h5 className="modal-title">
                      <i className="bi bi-calendar-event me-2"></i>
                      Reschedule Appointment
                    </h5>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={handleCloseReschedule}
                      disabled={rescheduleLoading}
                    ></button>
                  </div>
                  <div className="modal-body flex-grow-1" style={{
                    overflowY: "auto",
                    overflowX: "hidden",
                    flex: "1 1 auto",
                    minHeight: 0
                  }}>
                    <div className="alert alert-info border-0">
                      <i className="bi bi-info-circle me-2"></i>
                      <strong>Service:</strong> {rescheduleModal.service?.name}
                      <br />
                      <strong>Current Date:</strong> {rescheduleModal.date} at {rescheduleModal.start_time}
                      <br />
                      <small>All other details (payment method, service, etc.) will remain the same.</small>
                    </div>

                    <div className="mb-3">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-calendar3 me-2 text-primary"></i>
                        Select New Date
                      </label>
                      <input
                        type="date"
                        className="form-control"
                        value={rescheduleDate}
                        onChange={handleRescheduleDateChange}
                        min={tomorrowStr()}
                        max={sevenDaysOutStr()}
                        disabled={rescheduleLoading}
                      />
                      <div className="form-text">
                        Appointments can be rescheduled from tomorrow up to 7 days in advance
                      </div>
                    </div>

                    {rescheduleDate && rescheduleSlots.length > 0 && (
                      <div className="mb-3">
                        <label className="form-label fw-semibold">
                          <i className="bi bi-clock me-2 text-primary"></i>
                          Available Time Slots
                        </label>
                        <select
                          className="form-select"
                          value={selectedRescheduleSlot}
                          onChange={(e) => setSelectedRescheduleSlot(e.target.value)}
                          disabled={rescheduleLoading}
                        >
                          <option value="">-- Select Time Slot --</option>
                          {rescheduleSlots.map((slot) => (
                            <option key={slot} value={slot}>
                              {slot}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {rescheduleDate && rescheduleSlots.length === 0 && (
                      <div className="alert alert-warning border-0">
                        <i className="bi bi-exclamation-triangle me-2"></i>
                        No available slots for this date. Please select a different date.
                      </div>
                    )}
                  </div>
                  <div className="modal-footer flex-shrink-0" style={{
                    position: "sticky",
                    bottom: 0,
                    zIndex: 1,
                    backgroundColor: "#fff",
                    borderTop: "1px solid #dee2e6"
                  }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCloseReschedule}
                      disabled={rescheduleLoading}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-warning"
                      onClick={handleRescheduleSubmit}
                      disabled={!rescheduleDate || !selectedRescheduleSlot || rescheduleLoading}
                    >
                      {rescheduleLoading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                          Rescheduling...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-calendar-event me-1"></i>
                          Reschedule Appointment
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
    </div>
    </>
  );
}

export default PatientAppointments;
