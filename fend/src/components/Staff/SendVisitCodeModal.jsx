import { useState, useEffect } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

export default function SendVisitCodeModal({ visit, onClose, onSuccess }) {
  const [dentists, setDentists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDentist, setSelectedDentist] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [appointments, setAppointments] = useState(null);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [preferredDentist, setPreferredDentist] = useState(null);
  const [loadingPreferredDentist, setLoadingPreferredDentist] = useState(false);
  const [preferredDentistError, setPreferredDentistError] = useState("");
  const [appointmentHonorPreferred, setAppointmentHonorPreferred] = useState(null);
  const [appointmentPreferredDentistName, setAppointmentPreferredDentistName] = useState(null);
  const [loadingAppointmentPreference, setLoadingAppointmentPreference] = useState(false);

  useEffect(() => {
    fetchAvailableDentists();
  }, []);

  const resolveVisitDate = (visitData) => {
    if (!visitData) return null;

    if (typeof visitData.visit_date === "string" && visitData.visit_date.length >= 10) {
      return visitData.visit_date.slice(0, 10);
    }

    if (typeof visitData.start_time === "string" && visitData.start_time.length >= 10) {
      // Try ISO parse first
      const isoCandidate = visitData.start_time.includes(" ")
        ? visitData.start_time.replace(" ", "T")
        : visitData.start_time;
      const parsed = new Date(isoCandidate);
      if (!Number.isNaN(parsed.getTime())) {
        try {
          return parsed.toISOString().slice(0, 10);
        } catch (_) {
          // fall back to manual parsing
        }
      }

      const manual = visitData.start_time.split(" ")[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(manual)) {
        return manual;
      }
    }

    return null;
  };

  useEffect(() => {
    const fallbackPreferred = visit?.assigned_dentist
      ? {
          id: visit.assigned_dentist.id ?? null,
          name:
            visit.assigned_dentist.dentist_name ||
            visit.assigned_dentist.dentist_code ||
            null,
          code: visit.assigned_dentist.dentist_code ?? null,
        }
      : null;

    const rawVisitDate = resolveVisitDate(visit);
    const visitDate = rawVisitDate
      ? (() => {
          const parsed = new Date(rawVisitDate);
          if (!Number.isNaN(parsed.getTime())) {
            try {
              return parsed.toISOString().slice(0, 10);
            } catch (_) {
              /** swallow */
            }
          }
          return rawVisitDate;
        })()
      : null;
    const todayDate = new Date();
    const todayDateStr = new Date(todayDate.getTime() - todayDate.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
    const metadataDate = visitDate || todayDateStr;
    const hasPatient = Boolean(visit?.patient?.id);

    if (!hasPatient) {
      setPreferredDentist(fallbackPreferred);
      setPreferredDentistError(fallbackPreferred ? "" : "Recent dentist: —");
      return;
    }

    const fetchPreferredDentist = async () => {
      setLoadingPreferredDentist(true);
      setPreferredDentistError("");
      try {
        let resolvedPreferred = null;

        try {
          const res = await api.get(
            `/api/patients/${visit.patient.id}/preferred-dentist`,
            metadataDate
              ? {
                  params: {
                    reference_date: metadataDate,
                  },
                }
              : undefined
          );
          resolvedPreferred = res.data?.preferred_dentist ?? null;
        } catch (apiErr) {
          console.error("Preferred dentist endpoint failed:", apiErr);
        }

        if (!resolvedPreferred && metadataDate) {
          try {
            const params = new URLSearchParams({
              date: metadataDate,
              with_meta: "1",
              patient_id: String(visit.patient.id),
            });
            const metaRes = await api.get(
              `/api/appointment/available-services?${params.toString()}`
            );
            const metadataPreferred = metaRes.data?.metadata?.preferred_dentist ?? null;
            if (metadataPreferred) {
              resolvedPreferred = {
                id: metadataPreferred.id ?? null,
                name:
                  metadataPreferred.name ||
                  metadataPreferred.dentist_name ||
                  metadataPreferred.code ||
                  metadataPreferred.dentist_code ||
                  null,
                code: metadataPreferred.code || metadataPreferred.dentist_code || null,
              };
            }
          } catch (metaErr) {
            console.error("Available services metadata lookup failed:", metaErr);
          }
        }

        if (!resolvedPreferred && fallbackPreferred) {
          resolvedPreferred = fallbackPreferred;
        }

        setPreferredDentist(resolvedPreferred);
        if (!resolvedPreferred) {
          setPreferredDentistError("Recent dentist: —");
        }
      } catch (err) {
        console.error("Failed to resolve preferred dentist:", err);
        if (fallbackPreferred) {
          setPreferredDentist(fallbackPreferred);
          setPreferredDentistError("");
        } else {
          setPreferredDentist(null);
          setPreferredDentistError("Recent dentist: —");
        }
      } finally {
        setLoadingPreferredDentist(false);
      }
    };

    fetchPreferredDentist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit]);

  useEffect(() => {
    let cancelled = false;

    const setupAppointmentPreference = async () => {
      if (!visit?.appointment_id) {
        setAppointmentHonorPreferred(null);
        setAppointmentPreferredDentistName(null);
        return;
      }

      setLoadingAppointmentPreference(true);
      try {
        const appts = await loadAppointments();
        if (cancelled) return;

        const appointment = appts?.find((appt) => appt.id === visit.appointment_id);
        if (!appointment) {
          setAppointmentHonorPreferred(null);
          setAppointmentPreferredDentistName(null);
          return;
        }

        const honorFlag = Boolean(appointment.honor_preferred_dentist);
        setAppointmentHonorPreferred(honorFlag);

        if (!honorFlag) {
          setAppointmentPreferredDentistName(null);
          return;
        }

        const scheduleId = appointment.dentist_schedule_id;
        let resolvedName = preferredDentist?.name || preferredDentist?.code || null;

        if (!resolvedName && scheduleId) {
          const dentistFromList = dentists.find((d) => d.id === scheduleId);
          if (dentistFromList) {
            resolvedName = dentistFromList.dentist_name || dentistFromList.dentist_code || null;
          }
        }

        if (!resolvedName && visit?.assigned_dentist && scheduleId) {
          if (visit.assigned_dentist.id === scheduleId) {
            resolvedName =
              visit.assigned_dentist.dentist_name || visit.assigned_dentist.dentist_code || null;
          }
        }

        setAppointmentPreferredDentistName(resolvedName);
      } catch (err) {
        console.error("Failed to determine appointment preference:", err);
        if (!cancelled) {
          setAppointmentHonorPreferred(null);
          setAppointmentPreferredDentistName(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingAppointmentPreference(false);
        }
      }
    };

    setupAppointmentPreference();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit?.appointment_id, dentists, preferredDentist]);

  const fetchAvailableDentists = async () => {
    setLoading(true);
    setError("");
    try {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const todayName = dayNames[dayOfWeek];
      
      // Get all active dentists and filter by today's schedule
      const response = await api.get('/api/dentists', {
        params: { status: 'active' }
      });
      
      // Filter dentists who are working today
      const availableDentists = response.data.filter(dentist => {
        return dentist[todayName] === true && 
               dentist.status === 'active' &&
               (!dentist.contract_end_date || new Date(dentist.contract_end_date) >= today);
      });

      console.log('Available dentists:', availableDentists);
      setDentists(availableDentists);
    } catch (err) {
      console.error("Failed to fetch dentists:", err);
      setError("Failed to load available dentists. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadAppointments = async () => {
    if (appointments) return appointments;

    setLoadingAppointments(true);
    try {
      const res = await api.get('/api/appointments');
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setAppointments(data);
      return data;
    } catch (err) {
      console.error("Failed to load appointments:", err);
      return [];
    } finally {
      setLoadingAppointments(false);
    }
  };

  const parseAppointmentStart = (appointment) => {
    if (!appointment?.date || !appointment?.time_slot) return null;
    const [start] = appointment.time_slot.split('-');
    if (!start) return null;
    const normalized = start.length === 5 ? `${start}:00` : start;
    const dateTimeString = `${appointment.date}T${normalized}`;
    const date = new Date(dateTimeString);
    return isNaN(date.getTime()) ? null : date;
  };

  const ensureWarnings = async () => {
    try {
      const list = await loadAppointments();
      if (!selectedDentist) return true;

      const now = new Date();
      const upcomingConflict = list
        .filter(
          (appt) =>
            appt &&
            appt.dentist_schedule_id === selectedDentist.id &&
            ['pending', 'approved'].includes(appt.status)
        )
        .map((appt) => ({
          appt,
          start: parseAppointmentStart(appt),
        }))
        .find(({ start }) => {
          if (!start) return false;
          const diffMinutes = (start.getTime() - now.getTime()) / 60000;
          return diffMinutes >= 0 && diffMinutes <= 60;
        });

      if (upcomingConflict?.start) {
        const formattedTime = upcomingConflict.start.toLocaleString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        });
        const confirmConflict = window.confirm(
          `Dr. ${selectedDentist.dentist_name || selectedDentist.dentist_code} already has a dentist-specific appointment at ${formattedTime}. Do you still want to send this visit code?`
        );
        if (!confirmConflict) {
          return false;
        }
      }

      if (visit?.appointment_id) {
        const appointment = list.find((appt) => appt.id === visit.appointment_id);
        if (
          appointment &&
          appointment.honor_preferred_dentist &&
          appointment.dentist_schedule_id &&
          appointment.dentist_schedule_id !== selectedDentist.id
        ) {
          const preferredDentist = dentists.find((d) => d.id === appointment.dentist_schedule_id);
          const confirmBypass = window.confirm(
            `This appointment is set to prefer ${preferredDentist?.dentist_name || preferredDentist?.dentist_code || 'another dentist'}. Send the visit code to Dr. ${selectedDentist.dentist_name || selectedDentist.dentist_code} anyway?`
          );
          if (!confirmBypass) {
            return false;
          }
        }
      }

      return true;
    } catch (err) {
      console.error("Warning checks failed:", err);
      return true;
    }
  };

  const handleSendCode = async () => {
    if (!selectedDentist) {
      setError("Please select a dentist to send the visit code to.");
      return;
    }

    // Check if dentist has email
    if (!selectedDentist.email) {
      setError("Selected dentist does not have an email address configured.");
      return;
    }

    const proceed = await ensureWarnings();
    if (!proceed) {
      return;
    }

    setSending(true);
    setError("");

    try {
      console.log('Sending visit code to dentist:', selectedDentist);
      
      // Send visit code notification to the selected dentist
      const response = await api.post('/api/visits/send-visit-code', {
        visit_id: visit.id,
        dentist_id: selectedDentist.id,
        dentist_email: selectedDentist.email
      });
      
      // Show success message
      toast.success(`Visit code sent successfully to Dr. ${selectedDentist.dentist_name || selectedDentist.dentist_code}!`);
      
      if (onSuccess) {
        onSuccess(response.data, selectedDentist);
      }
      
      onClose();
    } catch (err) {
      console.error("Failed to send visit code:", err);
      
      // Extract error message from response
      let errorMessage = "Failed to send visit code. Please try again.";
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal show d-block" tabIndex="-1" style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      zIndex: 1050,
      overflowY: "auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem"
    }}>
      <div className="modal-dialog modal-lg" style={{
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
              <i className="bi bi-send me-2"></i>
              Send Visit Code to Dentist
            </h5>
            <button
              className="btn-close"
              onClick={onClose}
              disabled={sending}
            ></button>
          </div>
          
          <div className="modal-body flex-grow-1" style={{
            overflowY: "auto",
            overflowX: "hidden",
            flex: "1 1 auto",
            minHeight: 0
          }}>
            {/* Visit Information */}
            <div className="alert alert-info mb-4">
              <h6 className="alert-heading">
                <i className="bi bi-info-circle me-2"></i>
                Visit Information
              </h6>
              <div className="row">
                <div className="col-md-6">
                  <strong>Patient:</strong> {visit.patient?.first_name} {visit.patient?.last_name}
                </div>
                <div className="col-md-6">
                  <strong>Visit Code:</strong> 
                  <span className="badge bg-primary ms-2 fs-6">{visit.visit_code}</span>
                </div>
                <div className="col-md-6 mt-2">
                  <strong>Service:</strong> {visit.service?.name || 'Not specified'}
                </div>
                <div className="col-md-6 mt-2">
                  <strong>Started:</strong> {new Date(visit.start_time).toLocaleString()}
                </div>
                {loadingPreferredDentist ? (
                  <div className="col-12 mt-2">
                    <small className="text-muted">
                      <i className="bi bi-hourglass-split me-1"></i>
                      Checking recent dentist…
                    </small>
                  </div>
                ) : preferredDentist ? (
                  <div className="col-md-6 mt-2">
                    <strong>Recent Dentist:</strong>{" "}
                    {preferredDentist.name || preferredDentist.code}
                  </div>
                ) : null}
                {loadingAppointmentPreference ? (
                  <div className="col-12 mt-2">
                    <small className="text-muted">
                      <i className="bi bi-hourglass me-1"></i>
                      Checking appointment preference…
                    </small>
                  </div>
                ) : appointmentHonorPreferred !== null ? (
                  <div className="col-md-6 mt-2">
                    <strong>Appointment preference:</strong>{" "}
                    {appointmentHonorPreferred
                      ? "Honor recent dentist"
                      : "Any available dentist"}
                    {appointmentHonorPreferred && appointmentPreferredDentistName && (
                      <div className="small text-muted">
                        Preferred: {appointmentPreferredDentistName}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Dentist Selection */}
            <div className="mb-4">
              <label className="form-label fw-semibold">
                <i className="bi bi-person-badge me-2"></i>
                Select Available Dentist Today
              </label>
              
              {loading ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <div className="mt-2 text-muted">Loading available dentists...</div>
                </div>
              ) : error && !dentists.length ? (
                <div className="alert alert-danger">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {error}
                </div>
              ) : dentists.length === 0 ? (
                <div className="alert alert-warning">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  No dentists are scheduled to work today. Please check the dentist schedule.
                </div>
              ) : (
                <div className="row">
                  {dentists.map((dentist) => (
                    <div key={dentist.id} className="col-md-6 mb-3">
                      <div 
                        className={`card h-100 cursor-pointer border-2 ${
                          selectedDentist?.id === dentist.id 
                            ? 'border-primary bg-light' 
                            : 'border-light'
                        }`}
                        style={{ 
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => setSelectedDentist(dentist)}
                        onMouseEnter={(e) => {
                          if (selectedDentist?.id !== dentist.id) {
                            e.target.style.borderColor = '#0d6efd';
                            e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedDentist?.id !== dentist.id) {
                            e.target.style.borderColor = '#e9ecef';
                            e.target.style.boxShadow = 'none';
                          }
                        }}
                      >
                        <div className="card-body p-3">
                          <div className="d-flex align-items-center">
                            <div className="me-3">
                              <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" 
                                   style={{ width: '40px', height: '40px' }}>
                                <i className="bi bi-person-fill"></i>
                              </div>
                            </div>
                            <div className="flex-grow-1">
                              <h6 className="card-title mb-1">
                                Dr. {dentist.dentist_name || dentist.dentist_code}
                              </h6>
                              <small className="text-muted">
                                {dentist.dentist_code && (
                                  <span className="badge bg-secondary me-2">{dentist.dentist_code}</span>
                                )}
                                {dentist.employment_type && (
                                  <span className="text-capitalize">{dentist.employment_type.replace('_', ' ')}</span>
                                )}
                              </small>
                              {dentist.email && (
                                <div className="mt-1">
                                  <small className="text-muted">
                                    <i className="bi bi-envelope me-1"></i>
                                    {dentist.email}
                                  </small>
                                </div>
                              )}
                            </div>
                            {selectedDentist?.id === dentist.id && (
                              <div className="text-primary">
                                <i className="bi bi-check-circle-fill fs-5"></i>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="alert alert-danger">
                <i className="bi bi-exclamation-triangle me-2"></i>
                {error}
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
              className="btn btn-secondary"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSendCode}
              disabled={sending || loadingAppointments || !selectedDentist || dentists.length === 0}
            >
              {sending ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Sending...
                </>
              ) : (
                <>
                  <i className="bi bi-send me-2"></i>
                  Send Visit Code
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
