import { useEffect, useState } from "react";
import api from "../../api/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import toast from "react-hot-toast";

export default function PromoOverview() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPromos();
  }, []);

  const loadPromos = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/discounts-overview");
      setPromos(data);
    } catch (err) {
      console.error("Failed to load overview promos", err);
    } finally {
      setLoading(false);
    }
  };

  const launchPromo = async (id) => {
    if (window.confirm("Are you sure you want to launch this promo? This action cannot be undone easily.")) {
      try {
        await api.post(`/api/discounts/${id}/launch`);
        await loadPromos();
      } catch (err) {
        console.error("Failed to launch promo", err);
        toast.error("Failed to launch promo: " + (err.response?.data?.message || "Unknown error"));
      }
    }
  };

  const cancelPromo = async (id) => {
    if (window.confirm("Are you sure you want to cancel this promo? This action cannot be undone.")) {
      try {
        await api.post(`/api/discounts/${id}/cancel`);
        await loadPromos();
      } catch (err) {
        console.error("Failed to cancel promo", err);
        toast.error("Failed to cancel promo: " + (err.response?.data?.message || "Unknown error"));
      }
    }
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case "planned":
        return <span className="badge bg-secondary">Planned</span>;
      case "launched":
        return <span className="badge bg-success">Launched</span>;
      case "canceled":
        return <span className="badge bg-warning text-dark">Canceled</span>;
      default:
        return <span className="badge bg-light text-dark">Unknown</span>;
    }
  };

  return (
    <div className="mt-4">
      <h5 className="text-muted mb-3">📋 Active and Planned Promos</h5>
      {loading ? (
        <LoadingSpinner message="Loading promos..." />
      ) : promos.length > 0 ? (
        <div className="table-responsive">
          <table className="table table-bordered">
            <thead className="table-light">
              <tr>
                <th>Service</th>
                <th>Start</th>
                <th>End</th>
                <th>Price</th>
                <th>Status</th>
                <th>Activated</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((promo) => (
                <tr key={promo.id}>
                  <td>{promo.service?.name || "-"}</td>
                  <td>{promo.start_date}</td>
                  <td>{promo.end_date}</td>
                  <td>₱{Number(promo.discounted_price).toFixed(2)}</td>
                  <td>{renderStatusBadge(promo.status)}</td>
                  <td>{promo.activated_at?.split("T")[0] || "-"}</td>
                  <td className="text-center">
                    {promo.status === "planned" && (
                      <div className="btn-group" role="group">
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => launchPromo(promo.id)}
                          title="Launch this promo"
                        >
                          <i className="bi bi-play-fill"></i>
                        </button>
                        <button
                          className="btn btn-sm btn-warning"
                          onClick={() => cancelPromo(promo.id)}
                          title="Cancel this promo"
                        >
                          <i className="bi bi-x-circle"></i>
                        </button>
                        <button
                          className="btn btn-sm btn-info"
                          onClick={() => {
                            // Navigate to the service discount manager for editing
                            window.location.href = `/admin/service-discounts?service=${promo.service_id}`;
                          }}
                          title="Edit this promo"
                        >
                          <i className="bi bi-pencil"></i>
                        </button>
                      </div>
                    )}
                    {promo.status === "launched" && (
                      <span className="text-muted small">
                        <i className="bi bi-check-circle text-success"></i> Active
                      </span>
                    )}
                    {promo.status === "canceled" && (
                      <span className="text-muted small">
                        <i className="bi bi-x-circle text-warning"></i> Canceled
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted">No active or planned promos.</p>
      )}
    </div>
  );
}
