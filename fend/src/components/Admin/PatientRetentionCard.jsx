import React from "react";

const TrendChip = ({ value, label }) => {
  if (value === null || value === undefined) {
    return <span className="badge bg-secondary">{label}: —</span>;
  }

  const positive = value >= 0;
  const variant = positive ? "bg-success" : "bg-danger";
  const sign = positive ? "+" : "";

  return (
    <span className={`badge ${variant}`}>
      {label}: {sign}
      {value} pts
    </span>
  );
};

const formatNumber = (value, suffix = "") => {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(2)}${suffix}`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(2)}%`;
};

function PatientRetentionCard({ insights }) {
  if (!insights) return null;

  const hasResponses = insights.responses_count > 0;

  return (
    <div
      className="card border-0 shadow-sm"
      style={{
        background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
        borderRadius: "16px",
      }}
    >
      <div className="card-header border-0 bg-transparent py-4">
        <h5 className="mb-1 fw-bold d-flex align-items-center" style={{ color: "#1e293b" }}>
          <span className="me-2">🦷</span>
          Patient Retention Feedback
        </h5>
        <p className="text-muted small mb-0">
          Aggregated survey insights from the Patient Retention card (period {insights.period.start} to {insights.period.end})
        </p>
      </div>
      <div className="card-body pt-0">
        {!hasResponses ? (
          <div className="text-center py-4">
            <div className="fs-1 mb-2">📭</div>
            <p className="text-muted mb-0">No feedback submissions for this period.</p>
            <small className="text-muted">
              Encourage patients to submit ratings within 7 days of their visits to populate this card.
            </small>
          </div>
        ) : (
          <>
            <div className="row g-3">
              <div className="col-md-4">
                <div className="p-3 border rounded h-100">
                  <div className="text-muted text-uppercase small fw-semibold mb-1">
                    Overall experience
                  </div>
                  <div className="display-6 fw-bold text-primary">
                    {formatNumber(insights.overall_score)}
                  </div>
                  <TrendChip value={insights.overall_score_change} label="Δ vs prev" />
                  <div className="mt-2 text-muted small">
                    Previous: {formatNumber(insights.overall_score_prev)}
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-3 border rounded h-100">
                  <div className="text-muted text-uppercase small fw-semibold mb-1">
                    Completion rate
                  </div>
                  <div className="display-6 fw-bold text-success">
                    {formatPercent(insights.completion_rate)}
                  </div>
                  <TrendChip value={insights.completion_rate_change} label="Δ vs prev" />
                  <div className="mt-2 text-muted small">
                    Previous: {formatPercent(insights.completion_rate_prev)}
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-3 border rounded h-100">
                  <div className="text-muted text-uppercase small fw-semibold mb-1">
                    Responses captured
                  </div>
                  <div className="display-6 fw-bold text-info">
                    {insights.responses_count}
                  </div>
                  <div className="mt-2 text-muted small">
                    Previous period: {insights.responses_count_prev}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <h6 className="fw-semibold mb-3" style={{ color: "#374151" }}>
                Question-level sentiment
              </h6>
              <div className="table-responsive">
                <table className="table table-sm table-borderless align-middle">
                  <thead>
                    <tr className="text-muted small text-uppercase">
                      <th>Question</th>
                      <th className="text-center">Avg score</th>
                      <th className="text-center">Trend</th>
                      <th className="text-center">Responses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(insights.questions || []).map((question) => (
                      <tr key={question.key} className="bg-white">
                        <td style={{ maxWidth: "360px" }}>
                          <div className="fw-semibold">{question.label}</div>
                        </td>
                        <td className="text-center fw-bold">
                          {formatNumber(question.avg_score)}
                        </td>
                        <td className="text-center">
                          <TrendChip value={question.change} label="Δ" />
                        </td>
                        <td className="text-center text-muted">
                          {question.responses}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PatientRetentionCard;

