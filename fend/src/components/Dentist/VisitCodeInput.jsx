import { useState } from "react";
import api from "../../api/api";
import LoadingSpinner from "../LoadingSpinner";
import ToothChart from "./ToothChart";
import toast from "react-hot-toast";

function VisitCodeInput() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visitData, setVisitData] = useState(null);
  const [notes, setNotes] = useState({
    dentist_notes: "",
    findings: "",
    treatment_plan: "",
    teeth_treated: "",
  });
  const [saving, setSaving] = useState(false);
  const [fetchingNotes, setFetchingNotes] = useState(null);
  const [fetchedNotes, setFetchedNotes] = useState(null);
  const [notesError, setNotesError] = useState("");
  const [showToothChart, setShowToothChart] = useState(false);

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/api/visits/resolve/${code.trim()}`);
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
        "Do you want to finish this consultation and return to the visit codes page?"
      );
      
      if (shouldFinish) {
        handleReset();
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
    setCode("");
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
  };

  return (
    <div className="container mt-4">
      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">
              <h4>🦷 Dentist Visit Code</h4>
            </div>
            <div className="card-body">
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
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="Enter 6-character code"
                        maxLength="10"
                        disabled={loading}
                      />
                    </div>
                    <div className="d-grid">
                      <button
                        type="submit"
                        className="btn btn-primary btn-lg"
                        disabled={loading || !code.trim()}
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
                    <p><strong>Visit Date:</strong> {new Date(visitData.visit.visit_date).toLocaleDateString()}</p>
                    <p><strong>Consultation Started:</strong> {new Date(visitData.visit.consultation_started_at).toLocaleString()}</p>
                  </div>

                  {/* Patient History */}
                  {visitData.patient_history && visitData.patient_history.length > 0 && (
                    <div className="mb-4">
                      <h6>Recent Visit History</h6>
                      <div className="table-responsive">
                        <table className="table table-sm">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Service</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visitData.patient_history.map((visit) => (
                              <tr key={visit.id}>
                                <td>{new Date(visit.visit_date).toLocaleDateString()}</td>
                                <td>{visit.service_name || "Not specified"}</td>
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
                                            Fetch Notes
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
                  )}

                  {/* Notes Form */}
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
                        Enter tooth numbers separated by commas (e.g., 1,2,3,4,5). Use the tooth numbering chart as reference.
                      </div>
                      
                      <ToothChart
                        selectedTeeth={notes.teeth_treated ? notes.teeth_treated.split(',').map(t => t.trim()) : []}
                        onTeethChange={(teeth) => setNotes({...notes, teeth_treated: teeth})}
                        showChart={showToothChart}
                        onToggleChart={() => setShowToothChart(!showToothChart)}
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
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Visit Notes Modal */}
      {fetchedNotes && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-file-text me-2"></i>
                  Visit Notes Reference
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={handleCloseNotesModal}
                ></button>
              </div>
              <div className="modal-body">
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
              <div className="modal-footer">
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

export default VisitCodeInput;
