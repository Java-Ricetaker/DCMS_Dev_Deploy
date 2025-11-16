import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function AppointmentFinder({ onSelectReferenceCode }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState("");
  const searchTimeoutRef = useRef(null);
  const navigate = useNavigate();

  // Debounced search function
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        searchPatients();
      }, 300); // 300ms delay
    } else {
      setSearchResults([]);
      setShowResults(false);
      setSelectedPatient(null);
      setAppointments([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const searchPatients = async () => {
    setLoading(true);
    setError("");
    
    try {
      const response = await api.get(`/api/patients/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(response.data);
      setShowResults(true);
    } catch (err) {
      console.error("Search failed:", err);
      setError("Failed to search patients. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const selectPatient = async (patient) => {
    setSelectedPatient(patient);
    setShowResults(false);
    setLoading(true);
    setError("");

    try {
      // Search for approved appointments for this patient
      const response = await api.get(`/api/appointments`, {
        params: {
          patient_id: patient.id,
          status: 'approved'
        }
      });
      
      // Filter appointments for this specific patient
      const patientAppointments = response.data.filter(appointment => 
        appointment.patient_id === patient.id && appointment.status === 'approved'
      );
      
      setAppointments(patientAppointments);
    } catch (err) {
      console.error("Failed to fetch appointments:", err);
      setError("Failed to fetch appointments. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (timeSlot) => {
    if (!timeSlot) return '';
    const [start, end] = timeSlot.split('-');
    return `${start} - ${end}`;
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'approved':
        return 'badge bg-success';
      case 'pending':
        return 'badge bg-warning';
      case 'completed':
        return 'badge bg-info';
      case 'cancelled':
        return 'badge bg-secondary';
      case 'rejected':
        return 'badge bg-danger';
      default:
        return 'badge bg-secondary';
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setAppointments([]);
    setSelectedPatient(null);
    setShowResults(false);
    setError("");
  };

  return (
    <div className="container-fluid px-4 py-4">
      <div className="row">
        <div className="col-12">
          <div className="bg-white rounded-3 shadow-sm p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h1 className="h3 fw-bold mb-1" style={{ color: '#1e293b' }}>
                  <i className="bi bi-search me-2"></i>
                  Appointment Finder
                </h1>
                <p className="text-muted mb-0">
                  Search for patient appointments by name to find reference codes
                </p>
              </div>
              {selectedPatient && (
                <button 
                  className="btn btn-outline-secondary"
                  onClick={clearSearch}
                >
                  <i className="bi bi-arrow-left me-1"></i>
                  New Search
                </button>
              )}
            </div>

            {/* Search Input */}
            {!selectedPatient && (
              <div className="mb-4">
                <div className="position-relative">
                  <input
                    type="text"
                    className="form-control form-control-lg"
                    placeholder="Type patient name (minimum 2 letters)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      paddingLeft: '3rem',
                      border: '2px solid #e2e8f0',
                      borderRadius: '12px',
                      fontSize: '1.1rem'
                    }}
                  />
                  <i 
                    className="bi bi-search position-absolute"
                    style={{
                      left: '1rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#6b7280',
                      fontSize: '1.2rem'
                    }}
                  ></i>
                  {loading && (
                    <div 
                      className="position-absolute"
                      style={{
                        right: '1rem',
                        top: '50%',
                        transform: 'translateY(-50%)'
                      }}
                    >
                      <LoadingSpinner size="sm" />
                    </div>
                  )}
                </div>

                {searchQuery.length > 0 && searchQuery.length < 2 && (
                  <div className="mt-2">
                    <small className="text-warning">
                      <i className="bi bi-info-circle me-1"></i>
                      Please type at least 2 letters to search
                    </small>
                  </div>
                )}

                {/* Search Results Dropdown */}
                {showResults && searchResults.length > 0 && (
                  <div 
                    className="position-absolute bg-white border rounded-3 shadow-lg mt-1"
                    style={{
                      width: '100%',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      zIndex: 1000
                    }}
                  >
                    {searchResults.map((patient) => (
                      <div
                        key={patient.id}
                        className="p-3 border-bottom cursor-pointer"
                        onClick={() => selectPatient(patient)}
                        style={{
                          cursor: 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                      >
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <h6 className="mb-1 fw-semibold">
                              {patient.first_name} {patient.last_name}
                              {patient.middle_name && ` ${patient.middle_name}`}
                            </h6>
                            <small className="text-muted">
                              {patient.contact_number && (
                                <span className="me-3">
                                  <i className="bi bi-telephone me-1"></i>
                                  {patient.contact_number}
                                </span>
                              )}
                              {patient.birthdate && (
                                <span>
                                  <i className="bi bi-calendar me-1"></i>
                                  {new Date(patient.birthdate).toLocaleDateString()}
                                </span>
                              )}
                            </small>
                          </div>
                          <i className="bi bi-chevron-right text-muted"></i>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {showResults && searchResults.length === 0 && searchQuery.length >= 2 && (
                  <div className="mt-3 p-3 bg-light rounded-3">
                    <div className="text-center">
                      <i className="bi bi-person-x display-4 text-muted mb-2"></i>
                      <p className="text-muted mb-0">No patients found matching "{searchQuery}"</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="alert alert-danger d-flex align-items-center" role="alert">
                <i className="bi bi-exclamation-triangle me-2"></i>
                {error}
              </div>
            )}

            {/* Selected Patient Info */}
            {selectedPatient && (
              <div className="mb-4">
                <div className="bg-light rounded-3 p-3">
                  <h5 className="fw-semibold mb-2">
                    <i className="bi bi-person-circle me-2"></i>
                    Selected Patient
                  </h5>
                  <div className="row">
                    <div className="col-md-6">
                      <p className="mb-1">
                        <strong>Name:</strong> {selectedPatient.first_name} {selectedPatient.last_name}
                        {selectedPatient.middle_name && ` ${selectedPatient.middle_name}`}
                      </p>
                      {selectedPatient.contact_number && (
                        <p className="mb-1">
                          <strong>Contact:</strong> {selectedPatient.contact_number}
                        </p>
                      )}
                    </div>
                    <div className="col-md-6">
                      {selectedPatient.birthdate && (
                        <p className="mb-1">
                          <strong>Birthdate:</strong> {new Date(selectedPatient.birthdate).toLocaleDateString()}
                        </p>
                      )}
                      {selectedPatient.sex && (
                        <p className="mb-1">
                          <strong>Sex:</strong> {selectedPatient.sex.charAt(0).toUpperCase() + selectedPatient.sex.slice(1)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Appointments List */}
            {selectedPatient && (
              <div>
                <div className="d-flex align-items-center mb-3">
                  <h5 className="fw-semibold mb-0">
                    <i className="bi bi-calendar-check me-2"></i>
                    Approved Appointments
                  </h5>
                  {loading && (
                    <div className="d-flex align-items-center text-muted ms-3">
                      <div className="spinner-border spinner-border-sm me-2" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                      <small>Loading appointments...</small>
                    </div>
                  )}
                </div>
                
                {appointments.length === 0 && !loading ? (
                  <div className="text-center py-5">
                    <i className="bi bi-calendar-x display-1 text-muted mb-3"></i>
                    <h4 className="fw-normal text-muted">No Approved Appointments</h4>
                    <p className="text-muted">
                      This patient has no approved appointments or all appointments are still pending.
                    </p>
                  </div>
                ) : (
                  <div className="row g-3">
                    {appointments.map((appointment) => (
                      <div key={appointment.id} className="col-12">
                        <div className="card border-0 shadow-sm">
                          <div className="card-body">
                            <div className="row align-items-center">
                              <div className="col-md-8">
                                <div className="d-flex align-items-center mb-2">
                                  <h6 className="fw-semibold mb-0 me-3">
                                    {appointment.service?.name || 'Service'}
                                  </h6>
                                  <span className={getStatusBadgeClass(appointment.status)}>
                                    {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                                  </span>
                                </div>
                                
                                <div className="row text-muted small">
                                  <div className="col-sm-6">
                                    <p className="mb-1">
                                      <i className="bi bi-calendar me-1"></i>
                                      <strong>Date:</strong> {formatDate(appointment.date)}
                                    </p>
                                    <p className="mb-1">
                                      <i className="bi bi-clock me-1"></i>
                                      <strong>Time:</strong> {formatTime(appointment.time_slot)}
                                    </p>
                                  </div>
                                  <div className="col-sm-6">
                                    <p className="mb-1">
                                      <i className="bi bi-currency-dollar me-1"></i>
                                      <strong>Payment:</strong> {appointment.payment_method.charAt(0).toUpperCase() + appointment.payment_method.slice(1)}
                                    </p>
                                    <p className="mb-1">
                                      <i className="bi bi-calendar-plus me-1"></i>
                                      <strong>Booked:</strong> {new Date(appointment.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="col-md-4 text-md-end">
                                <button
                                  type="button"
                                  className="w-100 btn btn-primary rounded-3 p-3 text-center"
                                  onClick={() => {
                                    const code = appointment.reference_code;
                                    if (!code) return;
                                    if (onSelectReferenceCode) {
                                      onSelectReferenceCode(code);
                                    } else {
                                      navigate(
                                        `/staff/visit-tracker?visitType=appointment&refCode=${encodeURIComponent(
                                          code
                                        )}`
                                      );
                                    }
                                  }}
                                  title="Use this reference code in Visit Tracker"
                                >
                                  <div className="small mb-1">Reference Code</div>
                                  <div className="h5 fw-bold mb-0 font-monospace">
                                    {appointment.reference_code || 'N/A'}
                                  </div>
                                </button>
                                
                                {appointment.teeth_count && (
                                  <div className="mt-2">
                                    <span className="badge bg-info">
                                      <i className="bi bi-tooth me-1"></i>
                                      {appointment.teeth_count} tooth{appointment.teeth_count > 1 ? 's' : ''}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Instructions */}
            {!selectedPatient && searchQuery.length === 0 && (
              <div className="text-center py-5">
                <i className="bi bi-search display-1 text-muted mb-3"></i>
                <h4 className="fw-normal text-muted">Find Patient Appointments</h4>
                <p className="text-muted">
                  Type a patient's name to search for their approved appointments and reference codes.
                </p>
                <div className="mt-4">
                  <div className="row justify-content-center">
                    <div className="col-md-8">
                      <div className="bg-light rounded-3 p-3">
                        <h6 className="fw-semibold mb-2">
                          <i className="bi bi-info-circle me-2"></i>
                          How it works:
                        </h6>
                        <ul className="list-unstyled mb-0 text-start">
                          <li className="mb-1">
                            <i className="bi bi-1-circle text-primary me-2"></i>
                            Type at least 2 letters of the patient's name
                          </li>
                          <li className="mb-1">
                            <i className="bi bi-2-circle text-primary me-2"></i>
                            Select the correct patient from the search results
                          </li>
                          <li className="mb-0">
                            <i className="bi bi-3-circle text-primary me-2"></i>
                            View their approved appointments and reference codes
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
