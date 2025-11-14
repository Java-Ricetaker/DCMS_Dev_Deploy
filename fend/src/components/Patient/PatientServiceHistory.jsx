import { useState, useEffect } from "react";
import api from "../../api/api";
import teethChartImage from "../../pages/Dentist/Teeth_Chart.png";
import primaryTeethChartImage from "../../pages/Dentist/Primary_Teeth_Chart.png";
import toast from "react-hot-toast";

const PatientServiceHistory = () => {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [meta, setMeta] = useState({});
  const [showToothChart, setShowToothChart] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState("adult");
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState(null);
  
  // Date filter states for service history
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    fetchVisitHistory(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const fetchVisitHistory = async (page = 1) => {
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
      
      const res = await api.get(`/api/user-visit-history?${params.toString()}`, {
        skip401Handler: true,
      });
      
      setVisits(res.data.data);
      setMeta({
        current_page: res.data.meta.current_page,
        last_page: res.data.meta.last_page,
        per_page: res.data.meta.per_page,
        total: res.data.meta.total,
      });
    } catch (err) {
      console.error("Failed to fetch visit history", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyDateFilter = () => {
    setCurrentPage(1);
    fetchVisitHistory(1);
  };

  const handleClearDateFilter = () => {
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
    fetchVisitHistoryWithoutFilters(1);
  };

  const fetchVisitHistoryWithoutFilters = async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.get(`/api/user-visit-history?page=${page}`, {
        skip401Handler: true,
      });
      
      setVisits(res.data.data);
      setMeta({
        current_page: res.data.meta.current_page,
        last_page: res.data.meta.last_page,
        per_page: res.data.meta.per_page,
        total: res.data.meta.total,
      });
    } catch (err) {
      console.error("Failed to fetch visit history", err);
    } finally {
      setLoading(false);
    }
  };

  const formatTeethTreated = (teethString) => {
    if (!teethString) return "—";
    
    const teethArray = teethString.split(',').map(t => t.trim()).filter(t => t);
    if (teethArray.length === 0) return "—";
    
    return teethArray.join(', ');
  };

  const getTeethCount = (teethString) => {
    if (!teethString) return 0;
    const teethArray = teethString.split(',').map(t => t.trim()).filter(t => t);
    return teethArray.length;
  };

  const handleOpenNotes = (visit) => {
    setSelectedVisit(visit);
    setShowNotesModal(true);
  };

  const handleCloseNotes = () => {
    setShowNotesModal(false);
    setSelectedVisit(null);
  };

  const handleDownloadReceipt = async (visitId) => {
    try {
      setDownloadingReceipt(visitId);
      const response = await api.get(`/api/receipts/visit/${visitId}`, {
        responseType: 'blob',
        skip401Handler: true,
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `visit-receipt-${visitId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download receipt", err);
      const serverMsg = err.response?.data?.message || "Failed to download receipt. Please try again.";
      toast.error(serverMsg);
    } finally {
      setDownloadingReceipt(null);
    }
  };

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-primary text-white">
        <div className="d-flex justify-content-between align-items-center">
          <h6 className="card-title mb-0">
            <i className="bi bi-clock-history me-2"></i>
            Service History
          </h6>
          <div className="d-flex gap-2">
            <button 
              className="btn btn-sm btn-outline-light"
              onClick={() => {
                setShowToothChart((prev) => {
                  const next = !prev;
                  if (next) {
                    setActiveChartTab("adult");
                  }
                  return next;
                });
              }}
              title="Tooth Chart Reference"
            >
              <i className="bi bi-tooth me-1"></i>
              Chart
            </button>
            <button 
              className="btn btn-sm btn-outline-light"
              onClick={() => fetchVisitHistory(currentPage)}
              disabled={loading}
            >
              {loading ? (
                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
              ) : (
                <i className="bi bi-arrow-clockwise me-1"></i>
              )}
              Refresh
            </button>
          </div>
        </div>
      </div>
      
      {/* Date Filter for Service History */}
      <div className="card-body border-bottom bg-light">
        <div className="row g-3 align-items-end">
          <div className="col-md-4">
            <label htmlFor="historyStartDate" className="form-label fw-semibold">
              <i className="bi bi-calendar-check me-2 text-primary"></i>
              Start Date
            </label>
            <input
              id="historyStartDate"
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
            <label htmlFor="historyEndDate" className="form-label fw-semibold">
              <i className="bi bi-calendar-x me-2 text-primary"></i>
              End Date
            </label>
            <input
              id="historyEndDate"
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
                disabled={(!startDate && !endDate) || loading}
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
                {startDate && !endDate && `Showing visits on ${startDate}`}
                {startDate && endDate && `Showing visits from ${startDate} to ${endDate}`}
              </span>
            </div>
          </div>
        )}
      </div>
      
      {/* Tooth Chart Reference Panel */}
      {showToothChart && (() => {
        const adultUpperTeeth = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16];
        const adultLowerTeeth = [32,31,30,29,28,27,26,25,24,23,22,21,20,19,18,17];
        const primaryUpperTeeth = ["A","B","C","D","E","F","G","H","I","J"];
        const primaryLowerTeeth = ["K","L","M","N","O","P","Q","R","S","T"];

        return (
          <div 
            className="border-bottom"
            style={{
              backgroundColor: 'rgba(248, 249, 250, 0.95)',
              opacity: 0.95,
              padding: '15px',
              border: '1px solid #e5e7eb',
              borderRadius: '0'
            }}
          >
            <div className="row align-items-center">
              <div className="col-md-5 mb-3 mb-md-0">
                <div className="text-center">
                  <img 
                    src={activeChartTab === "adult" ? teethChartImage : primaryTeethChartImage} 
                    alt={activeChartTab === "adult" ? "Adult Teeth Chart Reference" : "Primary Teeth Chart Reference"} 
                    className="img-fluid"
                    style={{ 
                      maxWidth: '250px', 
                      height: 'auto',
                      border: '1px solid #dee2e6',
                      borderRadius: '8px',
                      backgroundColor: '#f8f9fa'
                    }}
                  />
                  <small className="text-muted d-block mt-2">
                    {activeChartTab === "adult" ? "Adult Teeth Reference Chart" : "Primary Teeth Reference Chart"}
                  </small>
                </div>
              </div>
              <div className="col-md-7">
                <div className="text-center mb-3">
                  <div className="btn-group" role="group" aria-label="Tooth chart tabs">
                    <button
                      type="button"
                      className={`btn btn-sm ${activeChartTab === "adult" ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => setActiveChartTab("adult")}
                    >
                      <i className="bi bi-person me-1"></i>
                      Adult Teeth (1-32)
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${activeChartTab === "primary" ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => setActiveChartTab("primary")}
                    >
                      <i className="bi bi-person-heart me-1"></i>
                      Primary Teeth (A-T)
                    </button>
                  </div>
                </div>

                <div className="text-center">
                  <h6 className="text-primary mb-3">
                    Universal Numbering System
                  </h6>

                  {activeChartTab === "adult" ? (
                    <>
                      <div className="mb-3">
                        <small className="text-muted d-block mb-2">UPPER TEETH (1-16)</small>
                        <div className="d-flex justify-content-center flex-wrap gap-1">
                          {adultUpperTeeth.map((toothNumber) => (
                            <span
                              key={toothNumber}
                              className="badge bg-light text-dark border"
                              style={{ 
                                width: '20px', 
                                height: '20px',
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {toothNumber}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="mb-2">
                        <small className="text-muted d-block mb-2">LOWER TEETH (32-17)</small>
                        <div className="d-flex justify-content-center flex-wrap gap-1">
                          {adultLowerTeeth.map((toothNumber) => (
                            <span
                              key={toothNumber}
                              className="badge bg-light text-dark border"
                              style={{ 
                                width: '20px', 
                                height: '20px',
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {toothNumber}
                            </span>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mb-3">
                        <small className="text-muted d-block mb-2">UPPER TEETH (A-J)</small>
                        <div className="d-flex justify-content-center flex-wrap gap-1">
                          {primaryUpperTeeth.map((letter) => (
                            <span
                              key={letter}
                              className="badge bg-light text-dark border"
                              style={{ 
                                width: '20px', 
                                height: '20px',
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {letter}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="mb-2">
                        <small className="text-muted d-block mb-2">LOWER TEETH (T-K)</small>
                        <div className="d-flex justify-content-center flex-wrap gap-1">
                          {primaryLowerTeeth.map((letter) => (
                            <span
                              key={letter}
                              className="badge bg-light text-dark border"
                              style={{ 
                                width: '20px', 
                                height: '20px',
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {letter}
                            </span>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="alert alert-info py-2 mb-0" style={{ fontSize: '11px' }}>
                    <i className="bi bi-info-circle me-1"></i>
                    Use this chart to understand which teeth were treated
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Date</th>
                <th>Service</th>
                <th>Teeth Done</th>
                <th>Notes</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                    <p className="text-muted mt-2 mb-0">Loading service history...</p>
                  </td>
                </tr>
              ) : visits.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-5">
                    <i className="bi bi-calendar-x display-4 text-muted"></i>
                    <h6 className="mt-3 text-muted">No completed visits yet</h6>
                    <p className="text-muted mb-0">Your completed dental visits will appear here.</p>
                  </td>
                </tr>
              ) : (
                visits.map((visit) => (
                  <tr key={visit.id}>
                    <td>
                      <div className="fw-medium">
                        {new Date(visit.visit_date).toLocaleDateString()}
                      </div>
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
                      {visit.teeth_treated ? (
                        <div>
                          <span className="badge bg-info">
                            {formatTeethTreated(visit.teeth_treated)}
                          </span>
                          <br />
                          <small className="text-muted">
                            {getTeethCount(visit.teeth_treated)} tooth{getTeethCount(visit.teeth_treated) !== 1 ? 's' : ''}
                          </small>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => handleOpenNotes(visit)}
                      >
                        <i className="bi bi-journal-text me-1"></i>
                        View Notes
                      </button>
                    </td>
                    <td>
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleDownloadReceipt(visit.id)}
                        disabled={!visit.receipt_available || downloadingReceipt === visit.id}
                      >
                        {downloadingReceipt === visit.id ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                            Downloading...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-receipt me-1"></i>
                            Receipt
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Pagination */}
      {meta.last_page > 1 && (
        <div className="card-footer bg-light">
          <div className="d-flex justify-content-between align-items-center">
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
        </div>
      )}
      {showNotesModal && (
        <div
          className="modal show d-block"
          style={{
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
          }}
          tabIndex="-1"
        >
          <div
            className="modal-dialog modal-dialog-centered"
            style={{
              margin: "0 auto",
              maxHeight: "calc(100vh - 2rem)",
              width: "100%",
              maxWidth: "600px"
            }}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-journal-text me-2"></i>
                  Dentist Notes
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={handleCloseNotes}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <small className="text-muted d-block">Service</small>
                  <div className="fw-semibold">{selectedVisit?.service_name || 'Not specified'}</div>
                </div>
                <div className="mb-3">
                  <small className="text-muted d-block">Visit Date</small>
                  <div className="fw-semibold">
                    {selectedVisit
                      ? new Date(selectedVisit.visit_date).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : '—'}
                  </div>
                </div>

                <div className="mb-3">
                  <small className="text-muted text-uppercase d-block fw-semibold mb-1">
                    Dentist Notes
                  </small>
                  <div className="p-3 bg-light border rounded" style={{ whiteSpace: 'pre-wrap', minHeight: '80px' }}>
                    {selectedVisit?.dentist_notes?.trim()
                      ? selectedVisit.dentist_notes
                      : 'No dentist notes recorded for this visit.'}
                  </div>
                </div>

                <div className="mb-3">
                  <small className="text-muted text-uppercase d-block fw-semibold mb-1">
                    Findings
                  </small>
                  <div className="p-3 bg-light border rounded" style={{ whiteSpace: 'pre-wrap', minHeight: '80px' }}>
                    {selectedVisit?.findings?.trim()
                      ? selectedVisit.findings
                      : 'No findings documented for this visit.'}
                  </div>
                </div>

                <div>
                  <small className="text-muted text-uppercase d-block fw-semibold mb-1">
                    Treatment Plan
                  </small>
                  <div className="p-3 bg-light border rounded" style={{ whiteSpace: 'pre-wrap', minHeight: '80px' }}>
                    {selectedVisit?.treatment_plan?.trim()
                      ? selectedVisit.treatment_plan
                      : 'No treatment plan provided for this visit.'}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCloseNotes}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientServiceHistory;
