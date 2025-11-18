import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

const RETENTION_QUESTIONS = [
  {
    key: "scheduling_convenience",
    label: "I felt the appointment scheduling process was convenient.",
  },
  {
    key: "staff_communication",
    label: "The clinic staff communicated clearly before and after my visit.",
  },
  {
    key: "wait_time_reasonable",
    label: "My wait time was reasonable.",
  },
  {
    key: "comfort_and_care",
    label: "I felt comfortable and cared for throughout my visit.",
  },
  {
    key: "treatment_clarity",
    label: "I understand the next steps in my treatment plan.",
  },
  {
    key: "return_likelihood",
    label: "I am likely to return to this clinic for future dental needs.",
  },
  {
    key: "recommendation_likelihood",
    label: "I would recommend this clinic to friends or family.",
  },
];

const LIKERT_OPTIONS = [
  { value: 1, label: "Strongly disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Neutral" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly agree" },
];

const createDefaultResponses = () =>
  RETENTION_QUESTIONS.reduce((acc, q) => {
    acc[q.key] = 3;
    return acc;
  }, {});

function VisitRatingModal({
  show,
  onClose,
  visit,
  modalData,
  mode = "create",
  loading = false,
  onSaved,
}) {
  const [responses, setResponses] = useState(createDefaultResponses());
  const [dentistRating, setDentistRating] = useState(5);
  const [issueNote, setIssueNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const readOnly = mode === "view" || (mode === "edit" && !modalData?.feedback?.is_editable);

  useEffect(() => {
    if (!modalData) return;

    if (modalData.feedback) {
      setResponses({
        ...createDefaultResponses(),
        ...(modalData.feedback.retention_responses || {}),
      });
      setDentistRating(modalData.feedback.dentist_rating ?? 5);
      setIssueNote(modalData.feedback.dentist_issue_note ?? "");
    } else {
      setResponses(createDefaultResponses());
      setDentistRating(5);
      setIssueNote("");
    }
  }, [modalData, visit?.id]);

  useEffect(() => {
    if (!show) {
      setResponses(createDefaultResponses());
      setDentistRating(5);
      setIssueNote("");
      setSubmitting(false);
    }
  }, [show]);

  if (!show) return null;

  const handleResponseChange = (key, value) => {
    setResponses((prev) => ({
      ...prev,
      [key]: Number(value),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (readOnly || !visit) return;

    setSubmitting(true);
    try {
      await api.get("/sanctum/csrf-cookie");

      const payload = {
        retention_responses: responses,
        dentist_rating: Number(dentistRating),
        dentist_issue_note: issueNote?.trim() || null,
      };

      if (mode === "edit" && modalData?.feedback?.id) {
        await api.put(`/api/patient-feedback/${modalData.feedback.id}`, payload);
        toast.success("Feedback updated.");
      } else {
        await api.post("/api/patient-feedback", {
          ...payload,
          patient_visit_id: visit.id,
        });
        toast.success("Thanks for rating your visit!");
      }

      if (onSaved) {
        await onSaved();
      } else {
        onClose?.();
      }
    } catch (err) {
      const message =
        err.response?.data?.message ||
        "Unable to save your feedback right now. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === "view"
      ? "Your Visit Feedback"
      : mode === "edit"
      ? "Update Visit Feedback"
      : "Rate Your Visit";

  const ratingWindowInfo = modalData?.eligibility?.rating_window_expires_at
    ? new Date(modalData.eligibility.rating_window_expires_at).toLocaleString()
    : null;

  return (
    <div
      className="modal show d-block"
      style={{
        backgroundColor: "rgba(0,0,0,0.45)",
        zIndex: 1060,
      }}
      tabIndex="-1"
    >
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={submitting}></button>
          </div>

          <div className="modal-body">
            {!modalData || loading ? (
              <div className="d-flex flex-column align-items-center py-5">
                <div className="spinner-border text-primary mb-3" role="status" />
                <p className="text-muted mb-0">Loading feedback form...</p>
              </div>
            ) : (
              <>
                <div className="mb-3">
                  <div className="small text-muted mb-1">Service</div>
                  <div className="fw-semibold">{visit?.service_name || "Not specified"}</div>
                </div>
                {ratingWindowInfo && mode !== "view" && (
                  <div className="alert alert-info py-2">
                    You can submit feedback for this visit until{" "}
                    <strong>{ratingWindowInfo}</strong>.
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <h6 className="fw-semibold text-primary mb-3">
                      Patient Retention Survey
                    </h6>
                    {RETENTION_QUESTIONS.map((question) => (
                      <div
                        key={question.key}
                        className="mb-3 p-3 border rounded bg-light"
                      >
                        <label className="form-label fw-semibold d-block">
                          {question.label}
                        </label>
                        <div className="d-flex flex-wrap gap-2">
                          {LIKERT_OPTIONS.map((option) => (
                            <label
                              key={option.value}
                              className={`btn btn-sm ${
                                responses[question.key] === option.value
                                  ? "btn-primary"
                                  : "btn-outline-primary"
                              }`}
                            >
                              <input
                                type="radio"
                                name={question.key}
                                value={option.value}
                                checked={responses[question.key] === option.value}
                                onChange={(e) =>
                                  handleResponseChange(
                                    question.key,
                                    Number(e.target.value)
                                  )
                                }
                                disabled={readOnly || submitting}
                                className="visually-hidden"
                              />
                              {option.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mb-4">
                    <label className="form-label fw-semibold">
                      Rate your dentist
                    </label>
                    <div className="d-flex gap-2 flex-wrap">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`btn ${
                            dentistRating === value
                              ? "btn-warning text-dark"
                              : "btn-outline-secondary"
                          }`}
                          onClick={() => setDentistRating(value)}
                          disabled={readOnly || submitting}
                        >
                          {value} ★
                        </button>
                      ))}
                    </div>
                    <small className="text-muted">
                      1 = needs improvement, 5 = excellent care
                    </small>
                  </div>

                  <div className="mb-4">
                    <label className="form-label fw-semibold">
                      Specific issue with the dentist (optional)
                    </label>
                    <textarea
                      className="form-control"
                      rows="3"
                      placeholder="Share any concerns or issues so the clinic can follow up."
                      value={issueNote}
                      onChange={(e) => setIssueNote(e.target.value)}
                      disabled={readOnly || submitting}
                    />
                  </div>

                  {readOnly ? (
                    <div className="alert alert-secondary mb-0">
                      <i className="bi bi-lock-fill me-2"></i>
                      Feedback is locked and cannot be edited.
                    </div>
                  ) : (
                    <div className="d-flex justify-content-end">
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting}
                      >
                        {submitting ? (
                          <>
                            <span
                              className="spinner-border spinner-border-sm me-2"
                              role="status"
                              aria-hidden="true"
                            />
                            Saving...
                          </>
                        ) : mode === "edit" ? (
                          "Update feedback"
                        ) : (
                          "Submit feedback"
                        )}
                      </button>
                    </div>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default VisitRatingModal;

