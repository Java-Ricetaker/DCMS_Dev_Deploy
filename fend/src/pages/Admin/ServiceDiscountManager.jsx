import { useEffect, useState, useMemo, useCallback } from "react";
import api from "../../api/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import { ServiceSelectModal, EditPromoModal } from "../../components/ServiceDiscountModals";
import "./ServiceDiscountManager.css";
import toast from "react-hot-toast";

export default function ServiceDiscountManager() {
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [form, setForm] = useState({
    start_date: "",
    end_date: "",
    discounted_price: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [overviewPromos, setOverviewPromos] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [actionPromo, setActionPromo] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [servicesRes, overviewRes] = await Promise.all([
          api.get("/api/services"),
          api.get("/api/discounts-overview")
        ]);
        setServices(servicesRes.data);
        setOverviewPromos(overviewRes.data);
      } catch (err) {
        console.error("Failed to load initial data", err);
      }
    };
    
    loadData();
  }, []);

  // Cleanup effect to restore body scroll when component unmounts
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const loadOverviewPromos = async () => {
    setOverviewLoading(true);
    try {
      const { data } = await api.get("/api/discounts-overview");
      setOverviewPromos(data || []);
    } catch (err) {
      console.error("Failed to load overview promos", err);
      setOverviewPromos([]);
    } finally {
      setOverviewLoading(false);
    }
  };


  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const savePromo = async (formData = null) => {
    const dataToSave = formData || form;
    setLoading(true);
    setErrors({});
    try {
      if (isCreatingNew) {
        // Creating new promo
        const res = await api.post(
          `/api/services/${selectedService}/discounts`,
          dataToSave
        );

        if (res.data.warning) {
          toast(`⚠ Promo saved, but some dates are clinic closed:\n${res.data.warning}`, { icon: "⚠️" });
        }
        setShowEditModal(false);
        setIsCreatingNew(false);
      } else if (editingPromoId) {
        // Editing existing promo
        await api.put(`/api/discounts/${editingPromoId}`, dataToSave);
        setShowEditModal(false);
        setEditingPromo(null);
        setEditingPromoId(null);
      }

      // Reset form and reload overview only
      setForm({ start_date: "", end_date: "", discounted_price: "" });
      setEditMode(false);
      setSelectedService(null); // Clear selected service
      await loadOverviewPromos(); // Only reload overview
    } catch (err) {
      if (err.response?.status === 422) {
        const message = err.response.data.message;
        const fieldErrors = err.response.data.errors;

        if (message?.includes("clinic closed")) {
          toast.error(`❌ Cannot save promo: ${message}`);
          return; // stop here, don't reset form
        }

        setErrors(fieldErrors || { message });
        // Re-throw error for modal to handle
        throw err;
      } else {
        console.error("Unknown error", err);
        throw err;
      }
    } finally {
      setLoading(false);
    }
  };


  const selected = useMemo(() => 
    services.find((s) => s.id === Number(selectedService)), 
    [services, selectedService]
  );
  
  const openPromoCreation = useCallback(() => {
    setShowServiceModal(true);
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }, []);

  const selectService = useCallback(async (serviceId) => {
    setShowServiceModal(false);
    setSelectedService(serviceId);
    setIsCreatingNew(true);
    setEditingPromo(null);
    setEditingPromoId(null);
    setShowEditModal(true);
    // Don't change table view - keep showing overview
  }, []);

  const openEditModal = useCallback((promo) => {
    setEditingPromo(promo);
    setEditingPromoId(promo.id);
    setIsCreatingNew(false);
    setShowEditModal(true);
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }, []);

  const closeEditModal = useCallback(() => {
    setShowEditModal(false);
    setEditingPromo(null);
    setEditingPromoId(null);
    setIsCreatingNew(false);
    setSelectedService(null); // Clear selected service when closing modal
    // Restore body scroll
    document.body.style.overflow = '';
  }, []);

  const openLaunchConfirm = (promo) => {
    setActionPromo(promo);
    setShowLaunchConfirm(true);
    document.body.style.overflow = 'hidden';
  };

  const confirmLaunchPromo = async () => {
    if (!actionPromo) return;
    
    try {
      await api.post(`/api/discounts/${actionPromo.id}/launch`);
      await loadOverviewPromos();
      setShowLaunchConfirm(false);
      setActionPromo(null);
    } catch (err) {
      console.error("Failed to launch promo", err);
      toast.error("Failed to launch promo: " + (err.response?.data?.message || "Unknown error"));
    } finally {
      document.body.style.overflow = '';
    }
  };

  const cancelLaunchConfirm = () => {
    setShowLaunchConfirm(false);
    setActionPromo(null);
    document.body.style.overflow = '';
  };

  const openCancelConfirm = (promo) => {
    setActionPromo(promo);
    setShowCancelConfirm(true);
    document.body.style.overflow = 'hidden';
  };

  const confirmCancelPromo = async () => {
    if (!actionPromo) return;
    
    try {
      await api.post(`/api/discounts/${actionPromo.id}/cancel`);
      await loadOverviewPromos();
      setShowCancelConfirm(false);
      setActionPromo(null);
    } catch (err) {
      console.error("Failed to cancel promo", err);
      toast.error("Failed to cancel promo: " + (err.response?.data?.message || "Unknown error"));
    } finally {
      document.body.style.overflow = '';
    }
  };

  const cancelCancelConfirm = () => {
    setShowCancelConfirm(false);
    setActionPromo(null);
    document.body.style.overflow = '';
  };

  const editOverviewPromo = (promo) => {
    // Find the service for this promo
    const service = services.find(s => s.id === promo.service_id);
    if (service) {
      setSelectedService(service.id);
      setEditingPromo(promo);
      setEditingPromoId(promo.id);
      setIsCreatingNew(false);
      setShowEditModal(true);
    }
  };

  const isCancelable = (promo) => {
    if (promo.status !== "launched" || !promo.activated_at) return false;
    const activated = new Date(promo.activated_at);
    const now = new Date();
    const diff = (now - activated) / (1000 * 60 * 60 * 24); // in days
    return diff <= 1;
  };

  const renderStatusBadge = useCallback((status) => {
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
  }, []);

  const filteredServices = useMemo(() => 
    services.filter((s) => !s.is_special), 
    [services]
  );

  return (
    <div 
      className="service-discounts-page"
      style={{
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        minHeight: '100vh',
        width: '100vw',
        position: 'relative',
        left: 0,
        right: 0,
        padding: '1.5rem 2rem',
        boxSizing: 'border-box'
      }}
    >
      {/* Header Section */}
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center mb-4 gap-3">
        <div>
          <h2 className="m-0 fw-bold" style={{ color: '#1e293b' }}>
             Service Promo Discounts
          </h2>
          <p className="text-muted mb-0 mt-1">Create and manage promotional discounts for services</p>
        </div>
        <button 
          className="btn border-0 shadow-sm"
          onClick={openPromoCreation}
          style={{
            background: 'linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%)',
            color: 'white',
            borderRadius: '12px',
            padding: '12px 24px',
            fontWeight: '600',
            transition: 'all 0.3s ease'
          }}
        >
          <i className="bi bi-plus-circle me-2"></i>
          Create New Promo
        </button>
      </div>

      <div className="card border-0 shadow-sm" style={{ borderRadius: '16px' }}>
        <div className="card-body p-4">

      {cleanupMessage && (
        <div className="alert alert-success border-0 shadow-sm mb-4" style={{ borderRadius: '12px' }}>
          <i className="bi bi-check-circle me-2"></i>
          {cleanupMessage}
        </div>
      )}

      <div className="row mb-4">
        <div className="col-12 col-md-6">
          <div className="d-flex align-items-center p-3 bg-light rounded" style={{ borderRadius: '12px' }}>
            <div className="bg-info rounded-circle me-3 d-flex align-items-center justify-content-center" 
                 style={{ width: '50px', height: '50px', fontSize: '1.5rem' }}>
              <i className="bi bi-info-circle text-white"></i>
            </div>
            <div>
              <div className="fw-semibold text-dark">Promo Management</div>
              <small className="text-muted">Create and manage service discounts</small>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-6 mt-3 mt-md-0">
          <div className="d-flex align-items-center p-3 bg-light rounded" style={{ borderRadius: '12px' }}>
            <div className="bg-warning rounded-circle me-3 d-flex align-items-center justify-content-center" 
                 style={{ width: '50px', height: '50px', fontSize: '1.5rem' }}>
              <i className="bi bi-exclamation-triangle text-white"></i>
            </div>
            <div>
              <div className="fw-semibold text-dark">Restrictions</div>
              <small className="text-muted">Specials/Packages cannot be discounted</small>
            </div>
          </div>
        </div>
      </div>

      {/* Promos Overview Table */}
      <div className="mt-4">
        <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center mb-4 gap-3">
          <h5 className="mb-0">
            <i className="bi bi-list-ul me-2 text-primary"></i>
            Active and Planned Promos
          </h5>
          <div className="flex-grow-1"></div>
          <span className="badge bg-primary fs-6">
            {overviewPromos.length} promo{overviewPromos.length !== 1 ? 's' : ''}
          </span>
        </div>
        {overviewLoading ? (
          <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="text-muted">Loading promos...</p>
            </div>
          </div>
        ) : overviewPromos.length > 0 ? (
          <div className="table-responsive" style={{ width: '100%' }}>
            <table className="table table-hover mb-0" style={{ width: '100%' }}>
              <thead className="table-primary">
                <tr>
                  <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                    <i className="bi bi-tag me-2"></i>Service Name
                  </th>
                  <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                    <i className="bi bi-calendar-event me-2"></i>Start Date
                  </th>
                  <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                    <i className="bi bi-calendar-x me-2"></i>End Date
                  </th>
                  
                  <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                    <i className="bi  me-2"></i>Discounted Price
                  </th>
                  <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                    <i className="bi bi-activity me-2"></i>Status
                  </th>
                  <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                    <i className="bi bi-clock-history me-2"></i>Activated Date
                  </th>
                  <th className="fw-semibold px-4 py-3 border-0 text-center" style={{ fontSize: '1.1rem' }}>
                    <i className="bi bi-gear me-2"></i>Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {overviewPromos.map((promo) => (
                  <tr key={promo.id} className="align-middle" style={{ height: '60px' }}>
                    <td className="px-4 py-3 fw-medium border-0" style={{ fontSize: '1rem' }}>
                      <div className="d-flex align-items-center">
                        <div className="bg-primary rounded-circle me-3 d-flex align-items-center justify-content-center" 
                             style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}>
                          🦷
                        </div>
                        <div>
                          <div className="fw-bold text-dark">{promo.service?.name || "-"}</div>
                          <small className="text-muted">Dental Service</small>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                      <div className="d-flex flex-column">
                        <span className="fw-semibold text-dark">{promo.start_date}</span>
                        <small className="text-muted">Campaign Start</small>
                      </div>
                    </td>
                    <td className="px-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                      <div className="d-flex flex-column">
                        <span className="fw-semibold text-dark">{promo.end_date}</span>
                        <small className="text-muted">Campaign End</small>
                      </div>
                    </td>
                    <td className="px-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                      <div className="d-flex flex-column">
                        <span className="fw-bold text-success fs-5">₱{Number(promo.discounted_price).toFixed(2)}</span>
                        <small className="text-muted">Promotional Price</small>
                      </div>
                    </td>
                    <td className="px-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                      <div className="d-flex flex-column align-items-start">
                        {renderStatusBadge(promo.status)}
                        <small className="text-muted mt-1">Current State</small>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted border-0" style={{ fontSize: '1rem' }}>
                      <div className="d-flex flex-column">
                        <span className="fw-semibold text-dark">{promo.activated_at?.split("T")[0] || "-"}</span>
                        <small className="text-muted">
                          {promo.activated_at ? "Launch Date" : "Not Activated"}
                        </small>
                      </div>
                    </td>
                    <td className="px-4 py-3 border-0 text-center" style={{ fontSize: '1rem' }}>
                      {promo.status === "planned" && (
                        <div className="btn-group" role="group">
                          <button
                            className="btn btn-sm btn-success me-1"
                            onClick={() => openLaunchConfirm(promo)}
                            title="Launch this promo"
                            style={{ borderRadius: '8px' }}
                          >
                            <i className="bi bi-play-fill"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-warning me-1"
                            onClick={() => openCancelConfirm(promo)}
                            title="Cancel this promo"
                            style={{ borderRadius: '8px' }}
                          >
                            <i className="bi bi-x-circle"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-info"
                            onClick={() => editOverviewPromo(promo)}
                            title="Edit this promo"
                            style={{ borderRadius: '8px' }}
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                        </div>
                      )}
                      {promo.status === "launched" && isCancelable(promo) && (
                        <button
                          className="btn btn-sm btn-warning"
                          onClick={() => openCancelConfirm(promo)}
                          title="Cancel this promo"
                          style={{ borderRadius: '8px' }}
                        >
                          <i className="bi bi-x-circle me-1"></i>
                          Cancel
                        </button>
                      )}
                      {promo.status === "launched" && !isCancelable(promo) && (
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
          <div className="text-center text-muted" style={{ height: '400px' }}>
            <div className="d-flex flex-column align-items-center justify-content-center py-5">
              <div className="bg-light rounded-circle mb-4 d-flex align-items-center justify-content-center" 
                   style={{ width: '120px', height: '120px', fontSize: '3rem' }}>
                💰
              </div>
              <h3 className="text-muted mb-3">No active or planned promos</h3>
              <p className="text-muted mb-4 fs-5">Create your first promotional discount to get started.</p>
              <button 
                className="btn border-0 shadow-sm"
                onClick={openPromoCreation}
                style={{
                  background: 'linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%)',
                  color: 'white',
                  borderRadius: '12px',
                  padding: '12px 24px',
                  fontWeight: '600',
                  transition: 'all 0.3s ease'
                }}
              >
                <i className="bi bi-plus-circle me-2"></i>
                Create First Promo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals from shared component */}
      <ServiceSelectModal
        show={showServiceModal}
        services={filteredServices}
        onSelect={selectService}
        onClose={() => {
          setShowServiceModal(false);
          document.body.style.overflow = '';
        }}
      />

      <EditPromoModal
        show={showEditModal}
        promo={editingPromo}
        service={selected}
        onSave={savePromo}
        onCancel={closeEditModal}
        loading={loading}
        isCreatingNew={isCreatingNew}
      />

      {/* Launch Confirmation Modal */}
      {showLaunchConfirm && actionPromo && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ 
          backgroundColor: "rgba(0,0,0,0.5)", 
          zIndex: 1055,
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflowY: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem"
        }}>
          <div className="modal-dialog modal-dialog-centered" style={{
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
              <div className="modal-header bg-success text-white flex-shrink-0" style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                borderBottom: "1px solid #dee2e6"
              }}>
                <h5 className="modal-title">
                  <i className="bi bi-play-circle me-2"></i>
                  Launch Promo
                </h5>
                <button type="button" className="btn-close" onClick={cancelLaunchConfirm}></button>
              </div>
              <div className="modal-body flex-grow-1" style={{
                overflowY: "auto",
                overflowX: "hidden",
                flex: "1 1 auto",
                minHeight: 0
              }}>
                <div className="alert alert-warning">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  <strong>Warning:</strong> This action cannot be undone easily.
                </div>
                <p>Are you sure you want to launch this promo?</p>
                <div className="card">
                  <div className="card-body">
                    <h6 className="card-title">{actionPromo.service?.name}</h6>
                    <p className="card-text mb-1">
                      <strong>Start Date:</strong> {actionPromo.start_date}<br />
                      <strong>End Date:</strong> {actionPromo.end_date}<br />
                      <strong>Discounted Price:</strong> ₱{Number(actionPromo.discounted_price).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="modal-footer flex-shrink-0" style={{
                position: "sticky",
                bottom: 0,
                zIndex: 1,
                backgroundColor: "#fff",
                borderTop: "1px solid #dee2e6"
              }}>
                <button type="button" className="btn btn-secondary" onClick={cancelLaunchConfirm}>
                  Cancel
                </button>
                <button type="button" className="btn btn-success" onClick={confirmLaunchPromo}>
                  <i className="bi bi-play-fill me-1"></i>
                  Launch Promo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && actionPromo && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ 
          backgroundColor: "rgba(0,0,0,0.5)", 
          zIndex: 1055,
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflowY: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem"
        }}>
          <div className="modal-dialog modal-dialog-centered" style={{
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
              <div className="modal-header bg-warning text-dark flex-shrink-0" style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                borderBottom: "1px solid #dee2e6"
              }}>
                <h5 className="modal-title">
                  <i className="bi bi-x-circle me-2"></i>
                  Cancel Promo
                </h5>
                <button type="button" className="btn-close" onClick={cancelCancelConfirm}></button>
              </div>
              <div className="modal-body flex-grow-1" style={{
                overflowY: "auto",
                overflowX: "hidden",
                flex: "1 1 auto",
                minHeight: 0
              }}>
                <div className="alert alert-danger">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  <strong>Warning:</strong> This action cannot be undone.
                </div>
                <p>Are you sure you want to cancel this promo?</p>
                <div className="card">
                  <div className="card-body">
                    <h6 className="card-title">{actionPromo.service?.name}</h6>
                    <p className="card-text mb-1">
                      <strong>Start Date:</strong> {actionPromo.start_date}<br />
                      <strong>End Date:</strong> {actionPromo.end_date}<br />
                      <strong>Discounted Price:</strong> ₱{Number(actionPromo.discounted_price).toFixed(2)}<br />
                      <strong>Status:</strong> {renderStatusBadge(actionPromo.status)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="modal-footer flex-shrink-0" style={{
                position: "sticky",
                bottom: 0,
                zIndex: 1,
                backgroundColor: "#fff",
                borderTop: "1px solid #dee2e6"
              }}>
                <button type="button" className="btn btn-secondary" onClick={cancelCancelConfirm}>
                  Cancel
                </button>
                <button type="button" className="btn btn-warning" onClick={confirmCancelPromo}>
                  <i className="bi bi-x-circle me-1"></i>
                  Cancel Promo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && <LoadingSpinner message="Saving promo..." />}
        </div>
      </div>
    </div>
  );
}
