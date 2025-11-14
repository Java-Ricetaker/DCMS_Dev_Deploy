import { useEffect, useState } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

// Local helpers
function onlyDate(v) {
  if (!v) return "";
  const s = String(v);
  return s.includes("T") ? s.split("T")[0] : s;
}

export default function StaffAppointmentManager() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null); // for rejection modal
  const [note, setNote] = useState("");
  const [cancellationReason, setCancellationReason] = useState("health_safety_concern");
  const [treatmentAdjustmentNotes, setTreatmentAdjustmentNotes] = useState("");
  const [processingId, setProcessingId] = useState(null); // holds appointment ID being processed
  const [verifyId, setVerifyId] = useState(null);
  const [verifyAppt, setVerifyAppt] = useState(null);
  const [verifyPwd, setVerifyPwd] = useState("");
  const [revealed, setRevealed] = useState(null);
  const [coverage, setCoverage] = useState("");

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/appointments?status=pending");
      setAppointments(res.data);
    } catch (err) {
      console.error("Failed to load appointments", err);
    } finally {
      setLoading(false);
    }
  };

  const approve = async (id) => {
    setProcessingId(id);
    try {
      await api.post(`/api/appointments/${id}/approve`);
      fetchAppointments();
    } catch (err) {
      console.error("Approve error:", err.response?.data || err.message);
      toast.error(
        err.response?.data?.message ||
        err.response?.data?.error ||
        "Approval failed"
      );
    } finally {
      setProcessingId(null);
    }
  };

  const openVerify = (appt) => {
    if (appt.payment_method !== "hmo") return toast.error("Only for HMO payments");
    setVerifyId(appt.id);
    setVerifyAppt(appt);
    setVerifyPwd("");
    setRevealed(null);
    setCoverage("");
    setNote("");
  };

  const revealHmo = async () => {
    try {
      const { data } = await api.post(`/api/appointments/${verifyId}/hmo/reveal`, { password: verifyPwd });
      setRevealed(data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Invalid password or error");
    }
  };

  const notifyCoverage = async () => {
    if (!note.trim()) return toast.error("Please enter a note to send to the patient.");
    try {
      await api.post(`/api/appointments/${verifyId}/hmo/notify`, {
        message: note,
        coverage_amount: coverage ? Number(coverage) : undefined,
        approve: true,
      });
      setVerifyId(null);
      setVerifyAppt(null);
      setRevealed(null);
      setCoverage("");
      setNote("");
      fetchAppointments();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to send coverage update");
    }
  };

  const reject = async () => {
    if (!note.trim()) return toast.error("Note is required");

    setProcessingId(selected.id);
    try {
      await api.post(`/api/appointments/${selected.id}/reject`, { 
        note,
        cancellation_reason: cancellationReason,
        treatment_adjustment_notes: treatmentAdjustmentNotes || null
      });
      setSelected(null);
      setNote("");
      setCancellationReason("health_safety_concern");
      setTreatmentAdjustmentNotes("");
      fetchAppointments();
    } catch (err) {
      console.error("Reject error:", err.response?.data || err.message);
      toast.error(err.response?.data?.error || "Rejection failed");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="w-100" style={{ padding: 0, margin: 0 }}>
      <div className="container-fluid px-0 py-0">
        <div className="row g-0">
          <div className="col-12">
            <div className="bg-white p-4" style={{ minHeight: '100vh' }}>
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h1 className="h3 fw-bold mb-0" style={{ color: '#1e293b' }}>Pending Appointments</h1>
                {loading && (
                  <div className="d-flex align-items-center text-muted">
                    <div className="spinner-border spinner-border-sm me-2" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                    <small>Loading appointments...</small>
                  </div>
                )}
              </div>
              {appointments.length === 0 ? (
                <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
                  <i className="bi bi-calendar-x display-1 d-block mb-3 text-muted"></i>
                  <h4 className="fw-normal text-muted">No pending appointments</h4>
                  <p className="text-muted">All appointments have been processed.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0" style={{ borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
                    <thead style={{ background: 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)', color: 'white' }}>
                      <tr>
                        <th className="border-0 py-3 px-4 fw-semibold">#</th>
                        <th className="border-0 py-3 px-4 fw-semibold">Service</th>
                        <th className="border-0 py-3 px-4 fw-semibold">Date</th>
                        <th className="border-0 py-3 px-4 fw-semibold">Time</th>
                        <th className="border-0 py-3 px-4 fw-semibold">Payment</th>
                        <th className="border-0 py-3 px-4 fw-semibold">Status</th>
                        <th className="border-0 py-3 px-4 fw-semibold text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointments.map((appt, i) => (
                        <tr key={appt.id} style={{ 
                          borderBottom: '1px solid #f1f3f4',
                          transition: 'background-color 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.backgroundColor = '#f8f9fa';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.backgroundColor = 'transparent';
                        }}
                        >
                          <td className="py-3 px-4 fw-semibold" style={{ color: '#6c757d' }}>{i + 1}</td>
                          <td className="py-3 px-4 fw-semibold" style={{ color: '#1e293b' }}>{appt.service?.name}</td>
                          <td className="py-3 px-4" style={{ color: '#495057' }}>{appt.date}</td>
                          <td className="py-3 px-4" style={{ color: '#495057' }}>{appt.time_slot}</td>
                          <td className="py-3 px-4">
                            <span className="badge" style={{
                              backgroundColor: appt.payment_method === 'hmo' ? '#6366f1' : '#00b4d8',
                              color: 'white',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              padding: '0.4rem 0.8rem',
                              borderRadius: '20px'
                            }}>
                              {appt.payment_method?.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="badge" style={{
                              backgroundColor: '#ffc107',
                              color: '#000',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              padding: '0.4rem 0.8rem',
                              borderRadius: '20px'
                            }}>
                              {appt.status?.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="d-flex justify-content-center gap-2 flex-wrap">
                              <button
                                onClick={() => approve(appt.id)}
                                disabled={processingId === appt.id}
                                className="btn btn-sm text-white rounded-pill disabled:opacity-50"
                                style={{
                                  background: 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)',
                                  border: 'none',
                                  fontWeight: '600',
                                  transition: 'all 0.3s ease',
                                  padding: '0.5rem 1rem',
                                  fontSize: '0.8rem'
                                }}
                                onMouseEnter={(e) => {
                                  if (!e.target.disabled) {
                                    e.target.style.background = 'linear-gradient(135deg, #0096c7 0%, #0056b3 100%)';
                                    e.target.style.transform = 'translateY(-1px)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!e.target.disabled) {
                                    e.target.style.background = 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)';
                                    e.target.style.transform = 'translateY(0)';
                                  }
                                }}
                              >
                                <i className="bi bi-check-circle me-1"></i>
                                {processingId === appt.id ? "Approving..." : "Approve"}
                              </button>

                              {appt.payment_method === "hmo" && (
                                <button
                                  onClick={() => openVerify(appt)}
                                  className="btn btn-sm text-white rounded-pill"
                                  style={{
                                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                    border: 'none',
                                    fontWeight: '600',
                                    transition: 'all 0.3s ease',
                                    padding: '0.5rem 1rem',
                                    fontSize: '0.8rem'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.target.style.background = 'linear-gradient(135deg, #5b5bd6 0%, #4338ca 100%)';
                                    e.target.style.transform = 'translateY(-1px)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.target.style.background = 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)';
                                    e.target.style.transform = 'translateY(0)';
                                  }}
                                >
                                  <i className="bi bi-shield-check me-1"></i>
                                  Verify HMO
                                </button>
                              )}

                              <button
                                onClick={() => setSelected(appt)}
                                disabled={processingId === appt.id}
                                className="btn btn-sm text-white rounded-pill disabled:opacity-50"
                                style={{
                                  background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                                  border: 'none',
                                  fontWeight: '600',
                                  transition: 'all 0.3s ease',
                                  padding: '0.5rem 1rem',
                                  fontSize: '0.8rem'
                                }}
                                onMouseEnter={(e) => {
                                  if (!e.target.disabled) {
                                    e.target.style.background = 'linear-gradient(135deg, #c82333 0%, #a71e2a 100%)';
                                    e.target.style.transform = 'translateY(-1px)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!e.target.disabled) {
                                    e.target.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
                                    e.target.style.transform = 'translateY(0)';
                                  }
                                }}
                              >
                                <i className="bi bi-x-circle me-1"></i>
                                {processingId === appt.id ? "Rejecting..." : "Reject"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    {/* Reject Modal */}
    {selected && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          zIndex: 1050 
        }}>
          <div className="bg-white rounded-3 shadow-lg" style={{ width: '500px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="p-4">
              <h2 className="h4 fw-bold mb-3" style={{ color: '#1e293b' }}>Reject Appointment</h2>
              <p className="text-muted mb-3">
                Enter reason for rejecting appointment on <strong>{selected.date}</strong> at{" "}
                <strong>{selected.time_slot}</strong>
              </p>
              
              <div className="mb-3">
                <label className="form-label fw-semibold">Cancellation Reason</label>
                <select
                  className="form-select"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  style={{ borderRadius: '8px', border: '2px solid #e9ecef' }}
                >
                  <option value="health_safety_concern">Health/Safety Concern</option>
                  <option value="medical_contraindication">Medical Contraindication</option>
                  <option value="clinic_cancellation">Clinic Cancellation</option>
                  <option value="admin_cancellation">Admin Cancellation</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold">Rejection Note (Required)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="form-control"
                  rows={3}
                  placeholder="Enter rejection reason..."
                  style={{ borderRadius: '8px', border: '2px solid #e9ecef' }}
                />
              </div>

              {(cancellationReason === 'health_safety_concern' || 
                cancellationReason === 'medical_contraindication' || 
                cancellationReason === 'other') && (
                <div className="mb-3">
                  <label className="form-label fw-semibold">Treatment Adjustment Notes</label>
                  <textarea
                    value={treatmentAdjustmentNotes}
                    onChange={(e) => setTreatmentAdjustmentNotes(e.target.value)}
                    className="form-control"
                    rows={3}
                    placeholder="Provide detailed notes about the treatment adjustment..."
                    style={{ borderRadius: '8px', border: '2px solid #e9ecef' }}
                  />
                  <small className="text-muted">Optional: Add detailed notes about health/safety concerns or medical contraindications</small>
                </div>
              )}

              <div className="d-flex justify-content-end gap-2">
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setSelected(null);
                    setCancellationReason("health_safety_concern");
                    setTreatmentAdjustmentNotes("");
                  }}
                  style={{ borderRadius: '8px', fontWeight: '600' }}
                >
                  Cancel
                </button>
                <button
                  className="btn text-white"
                  onClick={reject}
                  style={{
                    background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'linear-gradient(135deg, #c82333 0%, #a71e2a 100%)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
                  }}
                >
                  <i className="bi bi-x-circle me-1"></i>
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HMO Verify Modal */}
      {verifyId && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          zIndex: 1060 
        }}>
          <div className="bg-white rounded-3 shadow-lg" style={{ width: '520px', maxWidth: '90vw' }}>
            <div className="p-4">
              <h2 className="h4 fw-bold mb-3" style={{ color: '#1e293b' }}>HMO Verification</h2>
              {verifyAppt && (
                <div className="mb-3 p-3 rounded" style={{ backgroundColor: '#f8f9fa' }}>
                  <div className="row">
                    <div className="col-6"><strong>Service:</strong> {verifyAppt.service?.name || '—'}</div>
                    <div className="col-6"><strong>Price:</strong> ₱{Number(verifyAppt.service?.price ?? 0).toLocaleString()}</div>
                    <div className="col-12 mt-2"><strong>Date:</strong> {onlyDate(verifyAppt.date)}</div>
                  </div>
                </div>
              )}
              {!revealed ? (
                <>
                  <p className="text-muted mb-3">Enter your password to reveal patient HMO details.</p>
                  <input
                    type="password"
                    className="form-control mb-3"
                    value={verifyPwd}
                    onChange={(e) => setVerifyPwd(e.target.value)}
                    placeholder="Your password"
                    style={{ borderRadius: '8px', border: '2px solid #e9ecef' }}
                  />
                  <div className="d-flex justify-content-end gap-2">
                    <button 
                      className="btn btn-outline-secondary" 
                      onClick={() => setVerifyId(null)}
                      style={{ borderRadius: '8px', fontWeight: '600' }}
                    >
                      Cancel
                    </button>
                    <button 
                      className="btn text-white" 
                      onClick={revealHmo}
                      style={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: '600'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = 'linear-gradient(135deg, #5b5bd6 0%, #4338ca 100%)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)';
                      }}
                    >
                      <i className="bi bi-eye me-1"></i>
                      Reveal
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-3 p-3 rounded" style={{ backgroundColor: '#f8f9fa' }}>
                    <div className="row">
                      <div className="col-6"><strong>Provider:</strong> {revealed.provider_name}</div>
                      <div className="col-6"><strong>HMO Number:</strong> {revealed.hmo_number || '—'}</div>
                      <div className="col-12 mt-2"><strong>Name on Card:</strong> {revealed.patient_fullname_on_card || '—'}</div>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Coverage Amount (₱)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      value={coverage}
                      onChange={(e) => setCoverage(e.target.value)}
                      style={{ borderRadius: '8px', border: '2px solid #e9ecef' }}
                    />
                    {verifyAppt && coverage && (
                      <div className="text-muted mt-1 small">
                        Estimated balance: ₱{Math.max(0, Number(verifyAppt.service?.price ?? 0) - Number(coverage || 0)).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Note to patient</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What coverage means, balance, etc."
                      style={{ borderRadius: '8px', border: '2px solid #e9ecef' }}
                    />
                  </div>
                  <div className="d-flex justify-content-end gap-2">
                    <button 
                      className="btn btn-outline-secondary" 
                      onClick={() => { setVerifyId(null); setVerifyAppt(null); }}
                      style={{ borderRadius: '8px', fontWeight: '600' }}
                    >
                      Close
                    </button>
                    <button 
                      className="btn text-white" 
                      onClick={notifyCoverage}
                      style={{
                        background: 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: '600'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = 'linear-gradient(135deg, #0096c7 0%, #0056b3 100%)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)';
                      }}
                    >
                      <i className="bi bi-send me-1"></i>
                      Send & Approve
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
