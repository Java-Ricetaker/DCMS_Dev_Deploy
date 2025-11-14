import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import ToothChart from "../../components/Dentist/ToothChart";
import MedicalHistoryView from "../../components/Dentist/MedicalHistoryView";
import toast from "react-hot-toast";

function DentistVisitManager() {
  const navigate = useNavigate();
  const { visitCode: urlVisitCode } = useParams();
  
  // Visit code state
  const [visitCode, setVisitCode] = useState(urlVisitCode || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visitData, setVisitData] = useState(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState("notes");
  
  // Notes state
  const [notes, setNotes] = useState({
    dentist_notes: "",
    findings: "",
    treatment_plan: "",
    teeth_treated: "",
  });
  const [saving, setSaving] = useState(false);
  const [showToothChart, setShowToothChart] = useState(false);
  
  // History state
  const [fetchingNotes, setFetchingNotes] = useState(null);
  const [fetchedNotes, setFetchedNotes] = useState(null);
  const [notesError, setNotesError] = useState("");

  // Auto-resolve visit code if provided via URL
  useEffect(() => {
    if (urlVisitCode && !visitData && !loading) {
      // Auto-submit the form with the visit code from URL
      const autoSubmit = async () => {
        setLoading(true);
        setError("");
        try {
          const response = await api.get(`/api/visits/resolve/${urlVisitCode.trim()}`);
          setVisitData(response.data);
          
          // Load existing notes if any
          if (response.data.has_existing_notes) {
            const notesResponse = await api.get(`/api/visits/${response.data.visit.id}/dentist-notes`);
            setNotes({
              dentist_notes: notesResponse.data.dentist_notes || "",
              findings: notesResponse.data.findings || "",
              treatment_plan: notesResponse.data.treatment_plan || "",
              teeth_treated: notesResponse.data.teeth_treated || "",
            });
          }
        } catch (err) {
          setError(err.response?.data?.message || "Failed to resolve visit code");
          setVisitData(null);
        } finally {
          setLoading(false);
        }
      };
      
      autoSubmit();
    }
  }, [urlVisitCode]);

  const TabButton = ({ id, icon, label }) => (
    <button
      className={`btn flex-fill flex-sm-grow-0 border-0 shadow-sm ${
        activeTab === id ? "" : "btn-outline-primary"
      }`}
      onClick={() => setActiveTab(id)}
      type="button"
      style={{
        background: activeTab === id 
          ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
          : 'transparent',
        color: activeTab === id ? 'white' : '#3b82f6',
        border: activeTab === id ? 'none' : '1px solid #3b82f6',
        borderRadius: '8px',
        padding: '12px 16px',
        fontWeight: '600',
        transition: 'all 0.3s ease',
        minWidth: '140px'
      }}
    >
      <i className={`bi bi-${icon === "📝" ? "pencil-square" : icon === "🏥" ? "file-medical" : "clock-history"} me-2`}></i>
      <span className="d-none d-sm-inline">{label}</span>
      <span className="d-sm-none">{label.split(' ')[0]}</span>
    </button>
  );

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    if (!visitCode.trim()) return;

    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/api/visits/resolve/${visitCode.trim()}`);
      setVisitData(response.data);
      
      // Load existing notes if any
      if (response.data.has_existing_notes) {
        const notesResponse = await api.get(`/api/visits/${response.data.visit.id}/dentist-notes`);
        setNotes({
          dentist_notes: notesResponse.data.dentist_notes || "",
          findings: notesResponse.data.findings || "",
          treatment_plan: notesResponse.data.treatment_plan || "",
          teeth_treated: notesResponse.data.teeth_treated || "",
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to resolve visit code");
      setVisitData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!visitData) return;

    setSaving(true);
    try {
      await api.post(`/api/visits/${visitData.visit.id}/save-dentist-notes`, notes);
      
      // Show popup asking if dentist wants to finish consultation
      const shouldFinish = confirm(
        "Notes saved successfully!\n\n" +
        "Do you want to finish this consultation and return to the main page?"
      );
      
      if (shouldFinish) {
        handleReset();
        navigate('/dentist/dashboard');
      }
    } catch (err) {
      toast.error("Failed to save notes: " + (err.response?.data?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleFetchNotes = async (visitId) => {
    setFetchingNotes(visitId);
    setNotesError("");
    
    try {
      const response = await api.get(`/api/visits/${visitId}/dentist-notes`);
      setFetchedNotes({
        visitId,
        ...response.data
      });
    } catch (err) {
      setNotesError(err.response?.data?.message || "Failed to fetch visit notes");
    } finally {
      setFetchingNotes(null);
    }
  };

  const handleCloseNotesModal = () => {
    setFetchedNotes(null);
    setNotesError("");
  };

  const handleReset = () => {
    setVisitCode("");
    setVisitData(null);
    setNotes({
      dentist_notes: "",
      findings: "",
      treatment_plan: "",
      teeth_treated: "",
    });
    setError("");
    setFetchedNotes(null);
    setNotesError("");
    setShowToothChart(false);
    setActiveTab("notes");
  };

  return (
    <div className="w-100">
      <div className="container-fluid px-4 py-4">
        <div className="row">
          <div className="col-12">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h2>🦷 Dentist Visit Manager</h2>
              <button
                className="btn btn-outline-secondary"
                onClick={() => navigate('/dentist/dashboard')}
              >
                <i className="bi bi-arrow-left me-2"></i>
                Back to Dashboard
              </button>
            </div>
            
            <div className="card border-0 shadow-lg" style={{ borderRadius: '16px' }}>
              <div className="card-header bg-primary text-white border-0" style={{ borderRadius: '16px 16px 0 0' }}>
                <h4 className="card-title mb-0 fw-bold">
                  <i className="bi bi-key me-2"></i>
                  Dentist Visit Code
                </h4>
                <p className="mb-0 mt-2 opacity-75">Enter visit code to access patient information and notes</p>
              </div>
              <div className="card-body p-4">
                {!visitData ? (
                  <>
                    <form onSubmit={handleCodeSubmit}>
                      <div className="mb-3">
                        <label htmlFor="visitCode" className="form-label">
                          Enter Visit Code
                        </label>
                        <input
                          type="text"
                          className="form-control form-control-lg text-center"
                          id="visitCode"
                          value={visitCode}
                          onChange={(e) => setVisitCode(e.target.value.toUpperCase())}
                          placeholder="Enter 6-character code"
                          maxLength="10"
                          disabled={loading}
                        />
                      </div>
                      <div className="d-grid">
                        <button
                          type="submit"
                          className="btn btn-primary btn-lg"
                          disabled={loading || !visitCode.trim()}
                        >
                          {loading ? <LoadingSpinner message="Resolving..." /> : "Start Consultation"}
                        </button>
                      </div>
                    </form>
                    
                    {error && (
                      <div className="alert alert-danger mt-3">
                        {error}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Patient Summary */}
                    <div className="alert alert-info">
                      <h5>Patient Information</h5>
                      <p><strong>Name:</strong> {visitData.patient.first_name} {visitData.patient.last_name}</p>
                      <p><strong>Contact:</strong> {visitData.patient.contact_number || "Not provided"}</p>
                      {visitData.service && (
                        <p><strong>Service:</strong> {visitData.service.name}</p>
                      )}
                      {visitData.appointment && visitData.appointment.teeth_count && (
                        <p><strong>Number of Teeth to be Treated:</strong> {visitData.appointment.teeth_count}</p>
                      )}
                      <p><strong>Visit Date:</strong> {new Date(visitData.visit.visit_date).toLocaleDateString()}</p>
                      <p><strong>Consultation Started:</strong> {new Date(visitData.visit.consultation_started_at).toLocaleString()}</p>
                    </div>

                    {/* Tab Navigation */}
                    <div className="d-flex flex-column flex-sm-row gap-2 mb-4" role="group" aria-label="Visit tabs">
                      <TabButton id="notes" icon="📝" label="Enter Notes" />
                      <TabButton id="medical-history" icon="🏥" label="Medical History" />
                      <TabButton id="history" icon="📋" label="Patient History" />
                    </div>

                    {/* Tab Content */}
                    <div className="tab-content">
                      {activeTab === "notes" && (
                        <div className="tab-pane fade show active">
                          <div className="mb-4">
                            <h6>Dentist Notes</h6>
                            <div className="mb-3">
                              <label htmlFor="dentistNotes" className="form-label">
                                Dentist Notes
                              </label>
                              <textarea
                                className="form-control"
                                id="dentistNotes"
                                rows="4"
                                value={notes.dentist_notes}
                                onChange={(e) => setNotes({...notes, dentist_notes: e.target.value})}
                                placeholder="Enter consultation notes..."
                              />
                            </div>
                            
                            <div className="mb-3">
                              <label htmlFor="findings" className="form-label">
                                Findings
                              </label>
                              <textarea
                                className="form-control"
                                id="findings"
                                rows="3"
                                value={notes.findings}
                                onChange={(e) => setNotes({...notes, findings: e.target.value})}
                                placeholder="Enter clinical findings..."
                              />
                            </div>
                            
                            <div className="mb-3">
                              <label htmlFor="treatmentPlan" className="form-label">
                                Treatment Plan
                              </label>
                              <textarea
                                className="form-control"
                                id="treatmentPlan"
                                rows="3"
                                value={notes.treatment_plan}
                                onChange={(e) => setNotes({...notes, treatment_plan: e.target.value})}
                                placeholder="Enter treatment plan..."
                              />
                            </div>
                            
                            <div className="mb-3">
                              <label htmlFor="teethTreated" className="form-label">
                                Teeth Treated
                              </label>
                              <input
                                type="text"
                                className="form-control"
                                id="teethTreated"
                                value={notes.teeth_treated}
                                onChange={(e) => setNotes({...notes, teeth_treated: e.target.value})}
                                placeholder="e.g., 1,2,3,4,5 or leave blank if not applicable"
                              />
                              <div className="form-text">
                                Enter tooth numbers separated by commas (e.g., 1,2,3,4,5) or use the interactive tooth chart below for visual selection.
                              </div>
                              
                              <ToothChart
                                selectedTeeth={notes.teeth_treated ? notes.teeth_treated.split(',').map(t => t.trim()) : []}
                                onTeethChange={(teeth) => setNotes({...notes, teeth_treated: teeth})}
                                showChart={showToothChart}
                                onToggleChart={() => setShowToothChart(!showToothChart)}
                                maxSelection={visitData.appointment?.teeth_count || null}
                              />
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-success"
                              onClick={handleSaveNotes}
                              disabled={saving}
                            >
                              {saving ? "Saving..." : "Save Notes"}
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={handleReset}
                            >
                              New Code
                            </button>
                          </div>
                        </div>
                        )}

  {activeTab === "medical-history" && (
    <div className="tab-pane fade show active">
      <div className="mb-4">
        <h6>Medical and Dental History</h6>
        <MedicalHistoryView medicalHistory={visitData.medical_history} />
      </div>
    </div>
  )}
  
  {activeTab === "history" && (
                        <div className="tab-pane fade show active">
                          {visitData.patient_history && visitData.patient_history.length > 0 ? (
                            <div className="mb-4">
                              <h6>Complete Visit History</h6>
                              <div className="table-responsive">
                                <table className="table table-hover">
                                  <thead className="table-light">
                                    <tr>
                                      <th>Date</th>
                                      <th>Service</th>
                                      <th>Status</th>
                                      <th>Teeth Treated</th>
                                      <th>Notes</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {visitData.patient_history.map((visit) => (
                                      <tr key={visit.id}>
                                        <td>
                                          <strong>{new Date(visit.visit_date).toLocaleDateString()}</strong>
                                          <br />
                                          <small className="text-muted">
                                            {new Date(visit.visit_date).toLocaleDateString('en-US', { 
                                              weekday: 'long' 
                                            })}
                                          </small>
                                        </td>
                                        <td>
                                          <span className="badge bg-primary">
                                            {visit.service_name || "Not specified"}
                                          </span>
                                        </td>
                                        <td>
                                          <span className={`badge ${
                                            visit.status === 'completed' ? 'bg-success' :
                                            visit.status === 'pending' ? 'bg-warning' :
                                            'bg-secondary'
                                          }`}>
                                            {visit.status}
                                          </span>
                                        </td>
                                        <td>
                                          {visit.teeth_treated ? (
                                            <div>
                                              <span className="badge bg-info">
                                                {visit.teeth_treated}
                                              </span>
                                              <br />
                                              <small className="text-muted">
                                                {visit.teeth_treated.split(',').length} tooth{visit.teeth_treated.split(',').length !== 1 ? 's' : ''}
                                              </small>
                                            </div>
                                          ) : (
                                            <span className="text-muted">-</span>
                                          )}
                                        </td>
                                        <td>
                                          {visit.has_notes ? (
                                            <div className="d-flex gap-2 align-items-center">
                                              <span className="badge bg-success">Has Notes</span>
                                              <button
                                                className="btn btn-sm btn-outline-primary"
                                                onClick={() => handleFetchNotes(visit.id)}
                                                disabled={fetchingNotes === visit.id}
                                              >
                                                {fetchingNotes === visit.id ? (
                                                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                                ) : (
                                                  <>
                                                    <i className="bi bi-eye me-1"></i>
                                                    View Notes
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                          ) : (
                                            <span className="badge bg-secondary">No Notes</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <div className="alert alert-warning">
                              <i className="bi bi-exclamation-triangle me-2"></i>
                              No previous visit history found for this patient.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Visit Notes Modal */}
      {fetchedNotes && (
        <div className="modal show d-block" tabIndex="-1" style={{ 
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
                  <i className="bi bi-file-text me-2"></i>
                  Visit Notes - {new Date(visitData.patient_history.find(v => v.id === fetchedNotes.visitId)?.visit_date).toLocaleDateString()}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={handleCloseNotesModal}
                ></button>
              </div>
              <div className="modal-body flex-grow-1" style={{
                overflowY: "auto",
                overflowX: "hidden",
                flex: "1 1 auto",
                minHeight: 0
              }}>
                {fetchedNotes.dentist_notes && (
                  <div className="mb-4">
                    <h6 className="text-primary">
                      <i className="bi bi-sticky me-2"></i>
                      Dentist Notes
                    </h6>
                    <div className="bg-light p-3 rounded border">
                      <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                        {fetchedNotes.dentist_notes}
                      </p>
                    </div>
                  </div>
                )}
                
                {fetchedNotes.findings && (
                  <div className="mb-4">
                    <h6 className="text-success">
                      <i className="bi bi-search me-2"></i>
                      Clinical Findings
                    </h6>
                    <div className="bg-light p-3 rounded border">
                      <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                        {fetchedNotes.findings}
                      </p>
                    </div>
                  </div>
                )}
                
                {fetchedNotes.treatment_plan && (
                  <div className="mb-4">
                    <h6 className="text-info">
                      <i className="bi bi-clipboard-check me-2"></i>
                      Treatment Plan
                    </h6>
                    <div className="bg-light p-3 rounded border">
                      <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                        {fetchedNotes.treatment_plan}
                      </p>
                    </div>
                  </div>
                )}
                
                {fetchedNotes.teeth_treated && (
                  <div className="mb-4">
                    <h6 className="text-warning">
                      <i className="bi bi-tooth me-2"></i>
                      Teeth Treated
                    </h6>
                    <div className="bg-light p-3 rounded border">
                      <p className="mb-0">
                        {fetchedNotes.teeth_treated}
                      </p>
                    </div>
                  </div>
                )}

                {fetchedNotes.created_by && (
                  <div className="text-muted small border-top pt-3">
                    <p className="mb-1">
                      <strong>Created by:</strong> {fetchedNotes.created_by}
                    </p>
                    <p className="mb-1">
                      <strong>Created at:</strong> {new Date(fetchedNotes.created_at).toLocaleString()}
                    </p>
                    {fetchedNotes.updated_by && (
                      <>
                        <p className="mb-1">
                          <strong>Last updated by:</strong> {fetchedNotes.updated_by}
                        </p>
                        <p className="mb-0">
                          <strong>Last updated at:</strong> {new Date(fetchedNotes.updated_at).toLocaleString()}
                        </p>
                      </>
                    )}
                  </div>
                )}

                {!fetchedNotes.dentist_notes && !fetchedNotes.findings && !fetchedNotes.treatment_plan && !fetchedNotes.teeth_treated && (
                  <div className="text-center py-4">
                    <i className="bi bi-file-text fs-1 text-muted"></i>
                    <p className="mt-2 text-muted">No detailed notes available for this visit.</p>
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
                  onClick={handleCloseNotesModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {notesError && (
        <div className="alert alert-danger mt-3" role="alert">
          <i className="bi bi-exclamation-triangle me-2"></i>
          {notesError}
        </div>
      )}
    </div>
  );
}

export default DentistVisitManager;
