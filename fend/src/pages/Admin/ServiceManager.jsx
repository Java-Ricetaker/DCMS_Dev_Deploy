import { useRef } from "react";
import { useEffect, useState } from "react";
import api from "../../api/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import AddCategoryModal from "../../components/AddCategoryModal";

export default function ServiceManager() {
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    service_category_id: "",
    is_excluded_from_analytics: false,
    estimated_minutes: "",
    is_special: false,
    per_teeth_service: false,
    per_tooth_minutes: "",
    special_start_date: "",
    special_end_date: "",
    bundled_service_ids: [],
    is_follow_up: false,
    follow_up_parent_service_id: "",
    follow_up_max_gap_weeks: "",
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const confirmModalRef = useRef(null);
  const [showPermanentConfirm, setShowPermanentConfirm] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(null);

  useEffect(() => {
    fetchServices();
    fetchCategories();
  }, []);

  const fetchServices = async () => {
    try {
      const res = await api.get("/api/services");
      setServices(res.data);
    } catch (err) {
      console.error("Failed to fetch services", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await api.get("/api/service-categories");
      setCategories(res.data);
    } catch (err) {
      console.error("Failed to fetch categories", err);
    }
  };

  const handleCategoryAdded = (newCategory) => {
    setCategories(prev => [...prev, newCategory]);
    // Auto-select the newly added category
    setFormData(prev => ({
      ...prev,
      service_category_id: newCategory.id.toString()
    }));
  };

  // Filter services based on selected category
  const filteredServices = categoryFilter 
    ? services.filter(service => 
        service.category?.id?.toString() === categoryFilter || 
        service.service_category_id?.toString() === categoryFilter
      )
    : services;

  const handleCategoryFilterChange = (e) => {
    setCategoryFilter(e.target.value);
  };

  const clearCategoryFilter = () => {
    setCategoryFilter("");
  };

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    
    // Handle special checkbox logic
    if (name === "is_special" && checked) {
      // If marking as special, disable per_teeth_service
      setFormData({
        ...formData,
        [name]: checked,
        per_teeth_service: false,
      });
    } else if (name === "is_follow_up") {
      setFormData((prev) => ({
        ...prev,
        is_follow_up: checked,
        follow_up_parent_service_id: checked ? prev.follow_up_parent_service_id : "",
        follow_up_max_gap_weeks: checked ? prev.follow_up_max_gap_weeks : "",
      }));
    } else {
      setFormData({
        ...formData,
        [name]: type === "checkbox" ? checked : value,
      });
    }
  };

  const handleDelete = (service) => {
    setServiceToDelete(service);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/api/services/${serviceToDelete.id}`);
      setShowDeleteModal(false);
      setServiceToDelete(null);
      fetchServices();
    } catch (err) {
      console.error("Failed to delete service", err);
    }
  };

  const handleSubmit = async () => {
    const isSpecial = formData.is_special;
    const hasNoDates =
      !formData.special_start_date && !formData.special_end_date;

    if (isSpecial && hasNoDates) {
      setShowPermanentConfirm(true);
      setPendingSubmit(() => () => saveService());
      return;
    }

    saveService();
  };

  const saveService = async () => {
    try {
      const payload = {
        ...formData,
        follow_up_parent_service_id:
          formData.is_follow_up && formData.follow_up_parent_service_id
            ? Number(formData.follow_up_parent_service_id)
            : null,
        follow_up_max_gap_weeks:
          formData.follow_up_max_gap_weeks === ""
            ? null
            : Number(formData.follow_up_max_gap_weeks),
      };

      if (isEditMode) {
        await api.put(`/api/services/${editingId}`, payload);
      } else {
        await api.post("/api/services", payload);
      }
      setShowModal(false);
      fetchServices();
      resetForm();
      setFormErrors({});
    } catch (err) {
      if (err.response && err.response.status === 422) {
        setFormErrors(err.response.data.errors || {});
      } else {
        console.error("Failed to save service", err);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      price: "",
      category: "",
      is_excluded_from_analytics: false,
      estimated_minutes: "",
      is_special: false,
      per_teeth_service: false,
      per_tooth_minutes: "",
      special_start_date: "",
      special_end_date: "",
      bundled_service_ids: [],
      is_follow_up: false,
      follow_up_parent_service_id: "",
      follow_up_max_gap_weeks: "",
    });
    setIsEditMode(false);
    setEditingId(null);
  };

  const handleEdit = (service) => {
    setFormData({
      name: service.name,
      description: service.description,
      price: service.price,
      service_category_id: service.category?.id?.toString() || service.service_category_id?.toString() || "",
      is_excluded_from_analytics: service.is_excluded_from_analytics || false,
      estimated_minutes: service.estimated_minutes || "",
      is_special: service.is_special || false,
      per_teeth_service: service.per_teeth_service || false,
      per_tooth_minutes: service.per_tooth_minutes || "",
      special_start_date: service.special_start_date || "",
      special_end_date: service.special_end_date || "",
      bundled_service_ids: service.bundled_services?.map((s) => s.id) || [],
      is_follow_up: service.is_follow_up || false,
      follow_up_parent_service_id: service.follow_up_parent_service_id
        ? service.follow_up_parent_service_id.toString()
        : "",
      follow_up_max_gap_weeks:
        service.follow_up_max_gap_weeks !== null &&
        service.follow_up_max_gap_weeks !== undefined
          ? service.follow_up_max_gap_weeks.toString()
          : "",
    });
    setEditingId(service.id);
    setIsEditMode(true);
    setShowModal(true);
  };

  return (
    <div 
      className="service-manager-page"
      style={{
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        minHeight: '100vh',
        width: '100%',
        padding: '1.5rem 1rem',
        boxSizing: 'border-box'
      }}
    >
      {/* Header Section */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
        <div>
          <h2 className="m-0 fw-bold" style={{ color: '#1e293b' }}>
            <i className="bi bi-gear me-2"></i>
            Service Management
          </h2>
          <p className="text-muted mb-0 mt-1">Manage your clinic's services and packages</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button 
            className="btn border-0 shadow-sm" 
            onClick={() => setShowModal(true)}
            style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
              color: '#1e293b',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 24px',
              fontWeight: '600',
              transition: 'all 0.3s ease'
            }}
          >
            <i className="bi bi-plus-circle me-2"></i>
            Add New Service
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: '16px' }}>
        <div className="card-body p-4">
          <div className="row align-items-center">
            <div className="col-md-6">
              <h6 className="mb-0 fw-semibold" style={{ color: '#1e293b' }}>
                <i className="bi bi-funnel me-2"></i>
                Filter Services by Category
              </h6>
              <small className="text-muted">Show services from a specific category</small>
            </div>
            <div className="col-md-6">
              <div className="d-flex gap-2 align-items-center">
                <select
                  className="form-select border-0 shadow-sm"
                  style={{ borderRadius: '12px', padding: '12px 16px' }}
                  value={categoryFilter}
                  onChange={handleCategoryFilterChange}
                >
                  <option value="">All Categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {categoryFilter && (
                  <button
                    className="btn btn-outline-secondary border-0 shadow-sm"
                    style={{ borderRadius: '12px', padding: '12px 16px' }}
                    onClick={clearCategoryFilter}
                    title="Clear filter"
                  >
                    <i className="bi bi-x-lg"></i>
                  </button>
                )}
              </div>
            </div>
          </div>
          {categoryFilter && (
            <div className="mt-3">
              <div className="alert alert-info mb-0" style={{ borderRadius: '12px' }}>
                <i className="bi bi-info-circle me-2"></i>
                Showing {filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''} from category: <strong>{categories.find(c => c.id.toString() === categoryFilter)?.name}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card border-0 shadow-sm" style={{ borderRadius: '16px' }}>
        <div className="card-body p-4">

      {loading ? (
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
          <div className="text-center">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="text-muted">Fetching services...</p>
          </div>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover mb-0 w-100">
            <thead className="table-primary">
              <tr>
                <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                  <i className="bi bi-tag me-2"></i>Service Name
                </th>
                <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                  <i className="bi bi-file-text me-2"></i>Description
                </th>
                <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                  <i className="bi bi-currency-dollar me-2"></i>Price
                </th>
                <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                  <i className="bi bi-grid me-2"></i>Category
                </th>
                <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                  <i className="bi bi-clock me-2"></i>Time
                </th>
                <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                  <i className="bi bi-star me-2"></i>Special
                </th>
                <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                  <i className="bi bi-graph-up me-2"></i>Analytics
                </th>
                <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                  <i className="bi bi-tooth me-2"></i>Per Teeth
                </th>
                <th className="fw-semibold px-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                  <i className="bi bi-arrow-return-right me-2"></i>Follow-up
                </th>
                <th className="fw-semibold px-4 py-3 border-0 text-center" style={{ fontSize: '1.1rem' }}>
                  <i className="bi bi-gear me-2"></i>Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center py-5">
                    <div className="text-muted">
                      <i className="bi bi-inbox display-4 d-block mb-3"></i>
                      <h5>No services found</h5>
                      <p className="mb-0">
                        {categoryFilter 
                          ? `No services found in the selected category.`
                          : "No services available. Add your first service to get started."
                        }
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredServices.map((service) => (
                <tr key={service.id} className="align-middle" style={{ height: '60px' }}>
                  <td className="px-4 py-3 fw-medium border-0" style={{ fontSize: '1rem' }}>
                    <div className="d-flex align-items-center">
                      <div className="bg-primary rounded-circle me-3 d-flex align-items-center justify-content-center" 
                           style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}>
                        🦷
                      </div>
                      <div>
                        <div className="fw-bold text-dark">{service.name}</div>
                        {service.bundled_services?.length > 0 && (
                          <small className="text-muted">
                            ({service.bundled_services.map((s) => s.name).join(", ")})
                          </small>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                    <div className="text-truncate" style={{ maxWidth: '200px' }} title={service.description}>
                      {service.description || "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                    <div className="fw-bold text-success fs-5">
                      {service.per_teeth_service 
                        ? `₱${Number(service.price).toFixed(2)} per tooth`
                        : `₱${Number(service.price).toFixed(2)}`
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                    <span className="badge bg-light text-dark">{service.category?.name || "-"}</span>
                  </td>
                  <td className="px-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                    <div className="d-flex flex-column">
                      <span className="fw-semibold text-dark">{service.estimated_minutes} mins</span>
                      <small className="text-muted">Estimated</small>
                    </div>
                  </td>
                  <td className="px-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                    <div className="d-flex flex-column align-items-start">
                      {service.is_special ? (
                        <>
                          <span className="badge bg-warning text-dark mb-1">Special</span>
                          <small className="text-muted">
                            {service.special_start_date && service.special_end_date
                              ? `${service.special_start_date} → ${service.special_end_date}`
                              : "(Permanent)"}
                          </small>
                        </>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                    <span className={`badge ${service.is_excluded_from_analytics ? 'bg-danger' : 'bg-success'}`}>
                      {service.is_excluded_from_analytics ? "Excluded" : "Included"}
                    </span>
                  </td>
                  <td className="px-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                    <span className={`badge ${service.per_teeth_service ? 'bg-info' : 'bg-secondary'}`}>
                      {service.per_teeth_service ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                    {service.is_follow_up ? (
                      <div className="d-flex flex-column">
                        <span className="badge bg-primary text-white align-self-start mb-1">Follow-up</span>
                        <small className="text-muted">
                          Parent: {service.follow_up_parent?.name || "—"}
                        </small>
                        <small className="text-muted">
                          Gap: {service.follow_up_max_gap_weeks ?? "No limit"}
                          {(service.follow_up_max_gap_weeks !== null && service.follow_up_max_gap_weeks !== undefined) &&
                            ` wk${service.follow_up_max_gap_weeks === 1 ? '' : 's'}`}
                        </small>
                      </div>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center border-0">
                    <div className="btn-group" role="group">
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => handleEdit(service)}
                        title="Edit service"
                      >
                        <i className="bi bi-pencil"></i>
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(service)}
                        title="Delete service"
                      >
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
        </div>
      </div>

      {showModal && (
        <div
          className="modal d-block"
          tabIndex="-1"
          role="dialog"
          style={{ 
            backgroundColor: "rgba(0,0,0,0.5)",
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
        >
          <div className="modal-dialog" style={{
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
                  {isEditMode ? "Edit Service" : "Add Service"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                ></button>
              </div>
              <div className="modal-body flex-grow-1" style={{
                overflowY: "auto",
                overflowX: "hidden",
                flex: "1 1 auto",
                minHeight: 0
              }}>
                <div className="mb-3">
                  <label className="form-label">
                    Service Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    className={`form-control ${
                      formErrors.name ? "is-invalid" : ""
                    }`}
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                  {formErrors.name && (
                    <div className="invalid-feedback">{formErrors.name[0]}</div>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">Description</label>
                  <textarea
                    name="description"
                    className={`form-control ${
                      formErrors.description ? "is-invalid" : ""
                    }`}
                    value={formData.description}
                    onChange={handleChange}
                  />
                  {formErrors.description && (
                    <div className="invalid-feedback">
                      {formErrors.description[0]}
                    </div>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">
                    Price (₱) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    name="price"
                    className={`form-control ${
                      formErrors.price ? "is-invalid" : ""
                    }`}
                    value={formData.price}
                    onChange={handleChange}
                    required
                  />
                  {formData.per_teeth_service && (
                    <small className="text-info">
                      <i className="bi bi-info-circle me-1"></i>
                      This will be the price per tooth. Total cost will be calculated based on number of teeth treated.
                    </small>
                  )}
                  {formErrors.price && (
                    <div className="invalid-feedback">
                      {formErrors.price[0]}
                    </div>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">
                    Category <span className="text-danger">*</span>
                  </label>
                  <div className="input-group">
                    <select
                      name="service_category_id"
                      className={`form-select ${
                        formErrors.service_category_id ? "is-invalid" : ""
                      }`}
                      value={formData.service_category_id}
                      onChange={handleChange}
                      required
                    >
                      <option value="">-- Select Category --</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setShowAddCategoryModal(true)}
                      title="Add new category"
                    >
                      <i className="bi bi-plus"></i>
                    </button>
                  </div>
                  {formErrors.service_category_id && (
                    <div className="invalid-feedback">
                      {formErrors.service_category_id[0]}
                    </div>
                  )}
                </div>
                <div className="form-check mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="excludeAnalytics"
                    name="is_excluded_from_analytics"
                    checked={formData.is_excluded_from_analytics}
                    onChange={handleChange}
                  />
                  <label
                    className="form-check-label"
                    htmlFor="excludeAnalytics"
                  >
                    Exclude from analytics
                    <br />
                    <small className="text-muted">
                      Used to hide situational services like dentures from
                      charts and usage-based reports.
                    </small>
                  </label>
                </div>
                <div className="mb-3">
                  <label className="form-label">
                    Estimated Procedure Time (minutes){" "}
                    <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    name="estimated_minutes"
                    className={`form-control ${
                      formErrors.estimated_minutes ? "is-invalid" : ""
                    }`}
                    value={formData.estimated_minutes}
                    onChange={handleChange}
                    required
                  />
                  <small className="text-muted">
                    This will be automatically rounded up to the nearest 30
                    minutes.
                  </small>
                  {formErrors.estimated_minutes && (
                    <div className="invalid-feedback">
                      {formErrors.estimated_minutes[0]}
                    </div>
                  )}
                </div>
                <div className="form-check mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="isSpecial"
                    name="is_special"
                    checked={formData.is_special}
                    onChange={handleChange}
                  />
                  <label className="form-check-label" htmlFor="isSpecial">
                    Mark as Special / Package
                    <br />
                    <small className="text-muted">
                      Special services require a start and end date and cannot
                      be used with promo discounts.
                    </small>
                  </label>
                </div>
                <div className="form-check mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="perTeethService"
                    name="per_teeth_service"
                    checked={formData.per_teeth_service}
                    onChange={handleChange}
                    disabled={formData.is_special}
                  />
                  <label className="form-check-label" htmlFor="perTeethService">
                    Per Teeth Service
                    <br />
                    <small className="text-muted">
                      Track which specific tooth was serviced and what procedure was done.
                      Examples: Tooth Extraction, Tooth Filling, Root Canal Treatment.
                    </small>
                  </label>
                </div>
                {formData.per_teeth_service && (
                  <div className="mb-3">
                    <label className="form-label">
                      Minutes per Tooth <span className="text-danger">*</span>
                    </label>
                    <input
                      type="number"
                      name="per_tooth_minutes"
                      className={`form-control ${
                        formErrors.per_tooth_minutes ? "is-invalid" : ""
                      }`}
                      value={formData.per_tooth_minutes}
                      onChange={handleChange}
                      min="1"
                      max="60"
                      required
                    />
                    <small className="text-info">
                      <i className="bi bi-info-circle me-1"></i>
                      Time per tooth. Total appointment time will be calculated as: (minutes per tooth × number of teeth) rounded up to 30-minute blocks.
                    </small>
                    {formErrors.per_tooth_minutes && (
                      <div className="invalid-feedback">
                        {formErrors.per_tooth_minutes[0]}
                      </div>
                    )}
                  </div>
                )}
                {formData.is_special && formData.per_teeth_service && (
                  <div className="alert alert-warning mb-3" role="alert">
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    <strong>Warning:</strong> Per Teeth Service is only available for solo services. 
                    Since this service is marked as Special/Package, the Per Teeth option has been turned off.
                  </div>
                )}
                <div className="form-check mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="isFollowUp"
                    name="is_follow_up"
                    checked={formData.is_follow_up}
                    onChange={handleChange}
                  />
                  <label className="form-check-label" htmlFor="isFollowUp">
                    Mark as Follow-up Service
                    <br />
                    <small className="text-muted">
                      Limits availability to patients who recently completed a chosen parent service.
                    </small>
                  </label>
                </div>
                {formData.is_follow_up && (
                  <>
                    <div className="mb-3">
                      <label className="form-label">
                        Parent Service <span className="text-danger">*</span>
                      </label>
                      <select
                        name="follow_up_parent_service_id"
                        className={`form-select ${
                          formErrors.follow_up_parent_service_id ? "is-invalid" : ""
                        }`}
                        value={formData.follow_up_parent_service_id}
                        onChange={handleChange}
                      >
                        <option value="">-- Select Parent Service --</option>
                        {services
                          .filter((service) => {
                            const isSelf = isEditMode && service.id === editingId;
                            const isActive = service.is_active !== false;
                            return !isSelf && isActive;
                          })
                          .map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}
                            </option>
                          ))}
                      </select>
                      {formErrors.follow_up_parent_service_id && (
                        <div className="invalid-feedback">
                          {formErrors.follow_up_parent_service_id[0]}
                        </div>
                      )}
                    </div>
                    <div className="mb-3">
                      <label className="form-label">
                        Maximum Allowable Gap (weeks){" "}
                        <small className="text-muted">(optional)</small>
                      </label>
                      <input
                        type="number"
                        name="follow_up_max_gap_weeks"
                        className={`form-control ${
                          formErrors.follow_up_max_gap_weeks ? "is-invalid" : ""
                        }`}
                        value={formData.follow_up_max_gap_weeks}
                        onChange={handleChange}
                        min="0"
                      />
                      <div className="form-text">
                        Leave blank to allow follow-ups regardless of elapsed time.
                      </div>
                      {formErrors.follow_up_max_gap_weeks && (
                        <div className="invalid-feedback d-block">
                          {formErrors.follow_up_max_gap_weeks[0]}
                        </div>
                      )}
                    </div>
                    <div className="alert alert-info" role="alert">
                      <i className="bi bi-info-circle me-2"></i>
                      Patients must complete the parent service before they can see or book this follow-up online.
                      Staff can always override this requirement for walk-ins.
                    </div>
                  </>
                )}
                {formData.is_special && (
                  <div className="mb-3">
                    <label className="form-label">
                      Start Date{" "}
                      <small className="text-muted">(optional)</small>
                    </label>
                    <input
                      type="date"
                      name="special_start_date"
                      className={`form-control ${
                        formErrors.special_start_date ? "is-invalid" : ""
                      }`}
                      value={formData.special_start_date}
                      onChange={handleChange}
                    />
                    {formErrors.special_start_date && (
                      <div className="invalid-feedback">
                        {formErrors.special_start_date[0]}
                      </div>
                    )}

                    <label className="form-label mt-2">
                      End Date <small className="text-muted">(optional)</small>
                    </label>
                    <input
                      type="date"
                      name="special_end_date"
                      className={`form-control ${
                        formErrors.special_end_date ? "is-invalid" : ""
                      }`}
                      value={formData.special_end_date}
                      onChange={handleChange}
                    />
                    {formErrors.special_end_date && (
                      <div className="invalid-feedback">
                        {formErrors.special_end_date[0]}
                      </div>
                    )}
                    <label className="form-label">Bundled Services</label>
                    <div
                      className="border rounded p-2"
                      style={{ maxHeight: 200, overflowY: "auto" }}
                    >
                      {services
                        .filter((s) => s.id !== editingId) // avoid self-bundle
                        .map((service) => (
                          <div key={service.id} className="form-check">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id={`bundle-${service.id}`}
                              checked={formData.bundled_service_ids.includes(
                                service.id
                              )}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setFormData((prev) => {
                                  const updatedIds = checked
                                    ? [...prev.bundled_service_ids, service.id]
                                    : prev.bundled_service_ids.filter(
                                        (id) => id !== service.id
                                      );
                                  return {
                                    ...prev,
                                    bundled_service_ids: updatedIds,
                                  };
                                });
                              }}
                            />
                            <label
                              className="form-check-label"
                              htmlFor={`bundle-${service.id}`}
                            >
                              {service.name}
                            </label>
                          </div>
                        ))}
                    </div>
                    <small className="text-muted">
                      Tick services to include in this package.
                    </small>
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
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSubmit}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div
          className="modal d-block"
          tabIndex="-1"
          role="dialog"
          style={{ 
            backgroundColor: "rgba(0,0,0,0.5)",
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
        >
          <div className="modal-dialog" style={{
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
              <div className="modal-header bg-danger text-white flex-shrink-0" style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                borderBottom: "1px solid #dee2e6"
              }}>
                <h5 className="modal-title">⚠️ Confirm Deletion</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowDeleteModal(false)}
                ></button>
              </div>
              <div className="modal-body flex-grow-1" style={{
                overflowY: "auto",
                overflowX: "hidden",
                flex: "1 1 auto",
                minHeight: 0
              }}>
                <p>
                  Are you sure you want to delete{" "}
                  <strong>{serviceToDelete?.name}</strong>?<br />
                  <span className="text-danger">
                    This action cannot be undone.
                  </span>
                </p>
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
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={confirmDelete}>
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showPermanentConfirm && (
        <div
          className="modal d-block"
          tabIndex="-1"
          role="dialog"
          style={{ 
            backgroundColor: "rgba(0,0,0,0.5)",
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
        >
          <div className="modal-dialog" style={{
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
                <h5 className="modal-title">Confirm Permanent Special</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowPermanentConfirm(false)}
                ></button>
              </div>
              <div className="modal-body flex-grow-1" style={{
                overflowY: "auto",
                overflowX: "hidden",
                flex: "1 1 auto",
                minHeight: 0
              }}>
                <p>
                  This special service has no start or end date.
                  <br />
                  Do you want to save it as a <strong>permanent package</strong>
                  ?
                </p>
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
                  onClick={() => setShowPermanentConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setShowPermanentConfirm(false);
                    if (pendingSubmit) pendingSubmit();
                  }}
                >
                  Yes, Save as Permanent
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Add Category Modal */}
      <AddCategoryModal
        show={showAddCategoryModal}
        onClose={() => setShowAddCategoryModal(false)}
        onCategoryAdded={handleCategoryAdded}
      />
    </div>
  );
}
