import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

function SummaryCard({ label, value, helper, variant = "primary" }) {
  return (
    <div className="col-md-3">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body">
          <div className="text-muted text-uppercase small fw-semibold mb-1">
            {label}
          </div>
          <div className={`display-6 fw-bold text-${variant}`}>{value}</div>
          {helper && <div className="text-muted small mt-2">{helper}</div>}
        </div>
      </div>
    </div>
  );
}

function AdminDentistPerformance() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [selectedDentist, setSelectedDentist] = useState(null);
  const [feedbackRows, setFeedbackRows] = useState([]);
  const [feedbackMeta, setFeedbackMeta] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [expandedReviewId, setExpandedReviewId] = useState(null);
  const [commentFilter, setCommentFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");

  const performance = data?.dentist_performance_insights;

  const loadData = async (targetMonth = month) => {
    try {
      setLoading(true);
      const response = await api.get("/api/analytics/summary", {
        params: { period: targetMonth },
      });
      setData(response.data);
    } catch (err) {
      const message =
        err.response?.data?.message ||
        "Unable to load dentist performance data right now.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const dentists = useMemo(
    () => performance?.dentists || [],
    [performance?.dentists]
  );

  const sentimentBadge = (sentiment) => {
    switch (sentiment) {
      case "positive":
        return "bg-success";
      case "negative":
        return "bg-danger";
      default:
        return "bg-secondary";
    }
  };

  const sentimentLabel = (sentiment) => {
    switch (sentiment) {
      case "positive":
        return "Good";
      case "negative":
        return "Needs Attention";
      default:
        return "Neutral";
    }
  };

  const fetchDentistFeedback = async (dentist, page = 1, opts = {}) => {
    if (!dentist) return;
    const id = dentist.dentist_schedule_id ?? "unassigned";
    try {
      setFeedbackLoading(true);
      const params = {
        page,
        has_comment: opts.commentFilter ?? commentFilter,
        rating: opts.ratingFilter && opts.ratingFilter !== "all" ? opts.ratingFilter : undefined,
      };
      const response = await api.get(`/api/admin/dentists/${id}/feedback`, {
        params,
      });
      setFeedbackRows(response.data.data);
      setFeedbackMeta(response.data.meta);
    } catch (err) {
      const message =
        err.response?.data?.message ||
        "Unable to load feedback for this dentist right now.";
      toast.error(message);
      setFeedbackRows([]);
      setFeedbackMeta(null);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const openFeedbackModal = (dentist) => {
    if (!dentist || dentist.responses === 0) {
      return;
    }
    setSelectedDentist(dentist);
    setFeedbackModalOpen(true);
    setExpandedReviewId(null);
    fetchDentistFeedback(dentist, 1, {
      commentFilter,
      ratingFilter,
    });
  };

  const closeFeedbackModal = () => {
    setFeedbackModalOpen(false);
    setSelectedDentist(null);
    setFeedbackRows([]);
    setFeedbackMeta(null);
    setExpandedReviewId(null);
  };

  const handleFeedbackPageChange = (pageDelta) => {
    if (!feedbackMeta || !selectedDentist) return;
    const nextPage = feedbackMeta.current_page + pageDelta;
    if (nextPage < 1 || nextPage > feedbackMeta.last_page) return;
    fetchDentistFeedback(selectedDentist, nextPage);
  };
  const handleFilterChange = (type, value) => {
    if (type === "comment") {
      setCommentFilter(value);
    } else if (type === "rating") {
      setRatingFilter(value);
    }
    if (selectedDentist) {
      fetchDentistFeedback(selectedDentist, 1, {
        commentFilter: type === "comment" ? value : commentFilter,
        ratingFilter: type === "rating" ? value : ratingFilter,
      });
    }
  };


  const toggleReviewExpansion = (reviewId) => {
    setExpandedReviewId((prev) => (prev === reviewId ? null : reviewId));
  };

  return (
    <div className="container-fluid py-4">
      <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-3 mb-4">
        <div>
          <h2 className="h4 mb-1">Dentist Performance</h2>
          <p className="text-muted mb-0">
            Track satisfaction scores, feedback volume, and dentist-level follow-ups.
          </p>
        </div>
        <div className="d-flex gap-2">
          <input
            type="month"
            className="form-control"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button
            className="btn btn-outline-secondary"
            onClick={() => loadData(month)}
            disabled={loading}
          >
            {loading ? (
              <>
                <span
                  className="spinner-border spinner-border-sm me-1"
                  role="status"
                ></span>
                Refreshing
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

      {!performance ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center py-5">
            {loading ? (
              <>
                <div className="spinner-border text-primary mb-3" role="status"></div>
                <p className="text-muted mb-0">Loading dentist performance...</p>
              </>
            ) : (
              <>
                <div className="fs-1 mb-2">🦷</div>
                <p className="text-muted mb-0">
                  No dentist feedback recorded for this period.
                </p>
                <small className="text-muted">
                  Encourage patients to rate visits to populate this page.
                </small>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="row g-3 mb-4">
            <SummaryCard
              label="Average rating"
              value={
                performance.overall_avg_rating !== null
                  ? performance.overall_avg_rating.toFixed(2)
                  : "—"
              }
              helper="Across all submitted dentist ratings."
              variant="warning"
            />
            <SummaryCard
              label="Feedback received"
              value={performance.responses_count}
              helper="Number of completed ratings in this period."
            />
            <SummaryCard
              label="Issue reports"
              value={performance.issue_count}
              helper={`Issue rate: ${performance.issue_rate?.toFixed(2) ?? "0"}%`}
              variant="danger"
            />
            <SummaryCard
              label="Dentists rated"
              value={dentists.length}
              helper="Includes dentists with at least one rating."
              variant="info"
            />
          </div>

          <div className="card border-0 shadow-sm">
            <div className="card-header bg-transparent border-0 py-3">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0 fw-bold">Ratings by dentist</h5>
                <span className="badge bg-light text-dark">
                  Sorted by average rating
                </span>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Dentist</th>
                      <th className="text-center">Avg rating</th>
                      <th className="text-center">Responses</th>
                      <th className="text-center">Issues</th>
                      <th className="text-center">Low scores (1-2)</th>
                      <th className="text-center">Last feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dentists.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center py-4 text-muted">
                          No ratings found for this period.
                        </td>
                      </tr>
                    ) : (
                      dentists.map((dentist) => (
                        <tr
                          key={dentist.dentist_schedule_id ?? `dentist-${dentist.dentist_name}`}
                          className={dentist.responses > 0 ? "table-row-clickable" : ""}
                          style={{ cursor: dentist.responses > 0 ? "pointer" : "default" }}
                          onClick={() => openFeedbackModal(dentist)}
                        >
                          <td>
                            <div className="fw-semibold">{dentist.dentist_name}</div>
                            {dentist.dentist_schedule_id && (
                              <small className="text-muted">
                                ID: {dentist.dentist_schedule_id}
                              </small>
                            )}
                          </td>
                          <td className="text-center fw-bold">
                            {dentist.avg_rating !== null
                              ? dentist.avg_rating.toFixed(2)
                              : "—"}
                          </td>
                          <td className="text-center">{dentist.responses}</td>
                          <td className="text-center">
                            <span
                              className={`badge ${
                                dentist.issue_count > 0 ? "bg-danger" : "bg-success"
                              }`}
                            >
                              {dentist.issue_count}
                            </span>
                          </td>
                          <td className="text-center">{dentist.low_rating_count}</td>
                          <td className="text-center text-muted">
                            {dentist.last_feedback_at
                              ? new Date(dentist.last_feedback_at).toLocaleString()
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {feedbackModalOpen && (
            <div
              className="modal show d-block"
              style={{ backgroundColor: "rgba(0,0,0,0.35)", zIndex: 1060 }}
              tabIndex="-1"
            >
              <div className="modal-dialog modal-lg modal-dialog-scrollable">
                <div className="modal-content">
                  <div className="modal-header">
                    <div>
                      <h5 className="modal-title">
                        Feedback for {selectedDentist?.dentist_name}
                      </h5>
                      <small className="text-muted">
                        {selectedDentist?.responses} review
                        {selectedDentist?.responses === 1 ? "" : "s"} captured this period
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={closeFeedbackModal}
                      disabled={feedbackLoading}
                    ></button>
                  </div>
                  <div className="modal-body">
                    <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
                      <div>
                        <label className="form-label small text-muted mb-1">
                          Comment filter
                        </label>
                        <select
                          className="form-select form-select-sm"
                          value={commentFilter}
                          onChange={(e) => handleFilterChange("comment", e.target.value)}
                          disabled={feedbackLoading}
                        >
                          <option value="all">All</option>
                          <option value="with">With comments</option>
                          <option value="without">Without comments</option>
                        </select>
                      </div>
                      <div>
                        <label className="form-label small text-muted mb-1">
                          Rating
                        </label>
                        <select
                          className="form-select form-select-sm"
                          value={ratingFilter}
                          onChange={(e) => handleFilterChange("rating", e.target.value)}
                          disabled={feedbackLoading}
                        >
                          <option value="all">All ratings</option>
                          {[5, 4, 3, 2, 1].map((rating) => (
                            <option key={rating} value={rating}>
                              {rating} ★
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {feedbackLoading ? (
                      <div className="text-center py-5">
                        <div className="spinner-border text-primary mb-2" role="status" />
                        <p className="text-muted mb-0">Loading reviews...</p>
                      </div>
                    ) : feedbackRows.length === 0 ? (
                      <div className="text-center py-5 text-muted">
                        No reviews recorded yet.
                      </div>
                    ) : (
                      feedbackRows.map((review) => {
                        const expanded = expandedReviewId === review.id;
                        const label = sentimentLabel(review.sentiment);
                        return (
                          <div key={review.id} className="card border mb-3 shadow-sm">
                            <button
                              className="btn btn-link text-start text-decoration-none text-reset p-3 w-100"
                              onClick={() => toggleReviewExpansion(review.id)}
                            >
                              <div className="d-flex justify-content-between align-items-center">
                                <div>
                                  <div className="fw-semibold">{review.patient_name}</div>
                                  <small className="text-muted">
                                    {review.submitted_at
                                      ? new Date(review.submitted_at).toLocaleString()
                                      : "—"}
                                  </small>
                                </div>
                                <div className="text-end">
                                  <span className={`badge ${sentimentBadge(review.sentiment)} me-2`}>
                                    {label}
                                  </span>
                                  <span className="badge bg-light text-dark">
                                    Rating: {review.dentist_rating ?? "—"}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-2 text-muted small">
                                Service: {review.service_name || "—"}
                              </div>
                            </button>
                            {expanded && (
                              <div className="px-3 pb-3">
                                <p className="mb-1 fw-semibold">Comment</p>
                                <p className="mb-3">
                                  {review.dentist_issue_note?.trim()
                                    ? review.dentist_issue_note
                                    : "No additional comments provided."}
                                </p>
                                <div className="d-flex flex-wrap gap-2 small">
                                  <span className="badge bg-light text-dark">
                                    Retention score:{" "}
                                    {review.retention_score_avg
                                      ? Number(review.retention_score_avg).toFixed(2)
                                      : "—"}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="modal-footer d-flex justify-content-between">
                    <div>
                      {feedbackMeta && (
                        <small className="text-muted">
                          Page {feedbackMeta.current_page} of {feedbackMeta.last_page}
                        </small>
                      )}
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        disabled={
                          feedbackLoading ||
                          !feedbackMeta ||
                          feedbackMeta.current_page === 1
                        }
                        onClick={() => handleFeedbackPageChange(-1)}
                      >
                        Previous
                      </button>
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        disabled={
                          feedbackLoading ||
                          !feedbackMeta ||
                          feedbackMeta.current_page === feedbackMeta.last_page
                        }
                        onClick={() => handleFeedbackPageChange(1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AdminDentistPerformance;

