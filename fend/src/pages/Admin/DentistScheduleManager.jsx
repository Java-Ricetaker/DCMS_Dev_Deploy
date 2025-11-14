import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

const EMP_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "locum", label: "Locum" },
];

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const WEEKDAYS = [
  { key: "sun", label: "Sun" },
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
];

export default function DentistScheduleManager() {
  const emptyForm = {
    id: null,
    dentist_code: "",
    dentist_name: "",
    is_pseudonymous: true, // default true (no real names needed)
    employment_type: "full_time",
    status: "active",
    contract_end_date: "",
    email: "",
    temporary_password: "",
    email_verified: false,
    password_changed: false,
    sun: false, mon: true, tue: true, wed: true, thu: true, fri: true, sat: false,
  };

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [selectedDentist, setSelectedDentist] = useState(null);
  const [accountForm, setAccountForm] = useState({ email: "", name: "" });
  const [accountLoading, setAccountLoading] = useState(false);

  useEffect(() => { fetchRows(); }, []);

  const fetchRows = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/dentists");
      setRows(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load dentists. Check admin auth and routes.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.dentist_code || "").toLowerCase().includes(q) ||
      (r.dentist_name || "").toLowerCase().includes(q) ||
      (r.employment_type || "").toLowerCase().includes(q) ||
      (r.status || "").toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const openCreate = () => {
    setForm(emptyForm);
    setErrors({});
    setEditMode(false);
    setShowModal(true);
  };

  const openEdit = (row) => {
    setForm({
      id: row.id,
      dentist_code: row.dentist_code || "",
      dentist_name: row.dentist_name || "",
      is_pseudonymous: !!row.is_pseudonymous,
      employment_type: row.employment_type || "full_time",
      status: row.status || "active",
      contract_end_date: row.contract_end_date || "",
      email: row.email || "",
      temporary_password: row.temporary_password || "",
      email_verified: !!row.email_verified,
      password_changed: !!row.password_changed,
      sun: !!row.sun, mon: !!row.mon, tue: !!row.tue, wed: !!row.wed,
      thu: !!row.thu, fri: !!row.fri, sat: !!row.sat,
    });
    setErrors({});
    setEditMode(true);
    setShowModal(true);
  };

  const validate = () => {
    const e = {};
    if (!form.dentist_code.trim()) e.dentist_code = "Dentist code is required.";
    if (!EMP_TYPES.find(t => t.value === form.employment_type)) e.employment_type = "Invalid employment type.";
    if (!STATUSES.find(s => s.value === form.status)) e.status = "Invalid status.";
    const anyDay = WEEKDAYS.some(d => !!form[d.key]);
    if (!anyDay) e.weekdays = "Select at least one working day.";
    if (form.contract_end_date && !/^\d{4}-\d{2}-\d{2}$/.test(form.contract_end_date)) {
      e.contract_end_date = "Use YYYY-MM-DD format.";
    }
    if (!form.email || !form.email.trim()) {
      e.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = "Please enter a valid email address.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        dentist_code: form.dentist_code.trim(),
        dentist_name: form.dentist_name?.trim() || null, // optional
        is_pseudonymous: !!form.is_pseudonymous,
        employment_type: form.employment_type,
        status: form.status,
        contract_end_date: form.contract_end_date || null,
        email: form.email?.trim(), // required
        sun: !!form.sun, mon: !!form.mon, tue: !!form.tue, wed: !!form.wed,
        thu: !!form.thu, fri: !!form.fri, sat: !!form.sat,
      };

      if (editMode && form.id) {
        await api.put(`/api/dentists/${form.id}`, payload);
        toast.success("Dentist updated.");
      } else {
        await api.post("/api/dentists", payload);
        toast.success("Dentist created.");
      }
      setShowModal(false);
      fetchRows();
    } catch (err) {
      const data = err?.response?.data;
      if (data?.errors) setErrors(data.errors);
      else toast.error(data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row) => {
    if (!confirm(`Delete dentist ${row.dentist_code}? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/dentists/${row.id}`);
      toast.success("Deleted.");
      fetchRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Delete failed.");
    }
  };

  const openAccountModal = (row) => {
    setSelectedDentist(row);
    setAccountForm({
      email: row.email || "",
      name: row.dentist_name || "",
    });
    setShowAccountModal(true);
  };

  const createAccount = async () => {
    if (!selectedDentist) return;
    
    // Validate form
    if (!accountForm.email || !accountForm.email.trim()) {
      toast.error("Email address is required.");
      return;
    }
    
    if (!accountForm.name || !accountForm.name.trim()) {
      toast.error("Full name is required.");
      return;
    }
    
    setAccountLoading(true);
    try {
      const res = await api.post("/api/dentist/create-account", {
        dentist_schedule_id: selectedDentist.id,
        email: accountForm.email.trim(),
        name: accountForm.name.trim(),
      });
      
      toast.success(`Account created successfully! Temporary password: ${res.data.temporary_password}`);
      setShowAccountModal(false);
      fetchRows();
    } catch (err) {
      const errorMessage = err?.response?.data?.message || "Failed to create account.";
      const validationErrors = err?.response?.data?.errors;
      
      if (validationErrors) {
        const errorList = Object.values(validationErrors).flat().join('\n');
        toast.error(`Validation errors:\n${errorList}`);
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setAccountLoading(false);
    }
  };

  const createDentistAccount = async (row) => {
    if (!row.email) {
      toast.error(`Please add an email address for ${row.dentist_code} first.`);
      return;
    }
    
    if (!confirm(`Create account for ${row.dentist_code}? This will send a temporary password to ${row.email}.`)) return;
    
    try {
      const res = await api.post("/api/dentist/create-account", {
        dentist_schedule_id: row.id,
        email: row.email,
        name: row.dentist_name || row.dentist_code,
      });
      
      toast.success(`Account created successfully! Temporary password: ${res.data.temporary_password}`);
      fetchRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to create account.");
    }
  };

  // Email verification no longer needed for dentists

  const DayBadge = ({ on, label }) => (
    <span className={`badge ${on ? "bg-success" : "bg-light text-muted"}`} style={{ fontSize: '0.7rem' }}>
      {label}
    </span>
  );

  return (
    <div 
      className="dentist-schedule-manager-page"
      style={{
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        minHeight: '100vh',
        width: '100%',
        padding: '1.5rem',
        boxSizing: 'border-box'
      }}
    >
      {/* Header Section */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
        <div>
          <h2 className="m-0 fw-bold" style={{ color: '#1e293b' }}>
            <i className="bi bi-person-badge me-2"></i>
            Dentist Schedule Management
          </h2>
          <p className="text-muted mb-0 mt-1">Manage dentist schedules, employment types, and account creation</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button 
            className="btn border-0 shadow-sm" 
            onClick={openCreate}
            style={{
              background: 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)',
              color: 'white',
              borderRadius: '12px',
              padding: '12px 24px',
              fontWeight: '600',
              transition: 'all 0.3s ease'
            }}
          >
            <i className="bi bi-plus-circle me-2"></i>
            Add New Dentist
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm" style={{ borderRadius: '16px' }}>
        <div className="card-body p-4">
          {/* Search Section */}
          <div className="mb-4">
            <div className="input-group" style={{ maxWidth: '400px' }}>
              <span className="input-group-text bg-white border-end-0" style={{ borderRadius: '12px 0 0 12px' }}>
                <i className="bi bi-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control border-start-0"
                style={{ borderRadius: '0 12px 12px 0' }}
                placeholder="Search by code, name, type, or status..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-2 text-muted">Loading dentists...</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead className="table-light">
                  <tr>
                    <th scope="col" className="fw-semibold">Code</th>
                    <th scope="col" className="fw-semibold">Name</th>
                    <th scope="col" className="fw-semibold">Email</th>
                    <th scope="col" className="fw-semibold">Account Status</th>
                    <th scope="col" className="fw-semibold">Pseudonymous</th>
                    <th scope="col" className="fw-semibold">Employment</th>
                    <th scope="col" className="fw-semibold">Status</th>
                    <th scope="col" className="fw-semibold">Weekdays</th>
                    <th scope="col" className="fw-semibold">Contract End</th>
                    <th scope="col" className="fw-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td className="fw-medium">{r.dentist_code}</td>
                      <td>{r.dentist_name || <span className="text-muted">—</span>}</td>
                      <td>
                        {r.email ? (
                          <div>
                            <div className="text-sm">{r.email}</div>
                            {r.temporary_password && (
                              <div className="text-xs text-muted">Temp: {r.temporary_password}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="d-flex flex-column gap-1">
                          {r.email ? (
                            <span className={`badge ${r.password_changed ? 'bg-success' : 'bg-warning'}`}>
                              {r.password_changed ? '✓ Password Changed' : '⚠ Temp Password'}
                            </span>
                          ) : (
                            <span className="text-muted text-xs">No Account</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${r.is_pseudonymous ? 'bg-info' : 'bg-secondary'}`}>
                          {r.is_pseudonymous ? "Yes" : "No"}
                        </span>
                      </td>
                      <td>
                        <span className="badge bg-primary">{r.employment_type}</span>
                      </td>
                      <td>
                        <span className={`badge ${r.status === 'active' ? 'bg-success' : 'bg-danger'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        <div className="d-flex flex-wrap gap-1">
                          {WEEKDAYS.map((d) => (
                            <DayBadge key={d.key} on={!!r[d.key]} label={d.label} />
                          ))}
                        </div>
                      </td>
                      <td>{r.contract_end_date || <span className="text-muted">—</span>}</td>
                      <td>
                        <div className="d-flex flex-column gap-1">
                          <div className="btn-group btn-group-sm" role="group">
                            <button 
                              className="btn btn-outline-primary btn-sm" 
                              onClick={() => openEdit(r)}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              <i className="bi bi-pencil"></i> Edit
                            </button>
                            <button 
                              className="btn btn-outline-danger btn-sm" 
                              onClick={() => onDelete(r)}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              <i className="bi bi-trash"></i> Delete
                            </button>
                          </div>
                          {!r.email ? (
                            <button 
                              className="btn btn-primary btn-sm" 
                              onClick={() => openEdit(r)}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              <i className="bi bi-envelope-plus"></i> Add Email
                            </button>
                          ) : !r.temporary_password ? (
                            <button 
                              className="btn btn-success btn-sm" 
                              onClick={() => createDentistAccount(r)}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              <i className="bi bi-person-plus"></i> Create Account
                            </button>
                          ) : (
                            <span className="text-muted text-xs">Account Created</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td className="text-center text-muted py-4" colSpan={10}>
                        <i className="bi bi-search display-6 d-block mb-2"></i>
                        No dentists found matching your search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px' }}>
              <div className="modal-header border-0 pb-0" style={{ 
                background: 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)',
                borderRadius: '16px 16px 0 0'
              }}>
                <h5 className="modal-title text-white fw-bold">
                  <i className="bi bi-person-badge me-2"></i>
                  {editMode ? "Edit Dentist" : "Add New Dentist"}
                </h5>
                <button 
                  type="button" 
                  className="btn-close btn-close-white" 
                  onClick={() => setShowModal(false)}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body">
                <form id="dentist-form" onSubmit={onSubmit}>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">
                        Dentist Code <span className="text-danger">*</span>
                      </label>
                      <input 
                        type="text"
                        className={`form-control ${errors.dentist_code ? 'is-invalid' : ''}`}
                        value={form.dentist_code}
                        onChange={(e) => setForm({ ...form, dentist_code: e.target.value })}
                        placeholder="e.g., D001"
                      />
                      {errors.dentist_code && <div className="invalid-feedback">{String(errors.dentist_code)}</div>}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Dentist Name (optional)</label>
                      <input 
                        type="text"
                        className="form-control"
                        value={form.dentist_name}
                        onChange={(e) => setForm({ ...form, dentist_name: e.target.value })}
                        placeholder="Dr. John Doe"
                      />
                    </div>

                    <div className="col-12">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="isPseudo"
                          checked={!!form.is_pseudonymous}
                          onChange={(e) => setForm({ ...form, is_pseudonymous: e.target.checked })}
                        />
                        <label className="form-check-label" htmlFor="isPseudo">
                          Use pseudonymous identity (hide real names)
                        </label>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold">
                        Employment Type <span className="text-danger">*</span>
                      </label>
                      <select 
                        className={`form-select ${errors.employment_type ? 'is-invalid' : ''}`}
                        value={form.employment_type}
                        onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                      >
                        {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      {errors.employment_type && <div className="invalid-feedback">{String(errors.employment_type)}</div>}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold">
                        Status <span className="text-danger">*</span>
                      </label>
                      <select 
                        className={`form-select ${errors.status ? 'is-invalid' : ''}`}
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                      >
                        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      {errors.status && <div className="invalid-feedback">{String(errors.status)}</div>}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Contract End Date (optional)</label>
                      <input 
                        type="date" 
                        className={`form-control ${errors.contract_end_date ? 'is-invalid' : ''}`}
                        value={form.contract_end_date || ""}
                        onChange={(e) => setForm({ ...form, contract_end_date: e.target.value })} 
                      />
                      {errors.contract_end_date && <div className="invalid-feedback">{String(errors.contract_end_date)}</div>}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold">
                        Email Address <span className="text-danger">*</span>
                      </label>
                      <input 
                        type="email" 
                        className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                        value={form.email || ""}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="dentist@example.com"
                        required
                      />
                      {errors.email && <div className="invalid-feedback">{String(errors.email)}</div>}
                    </div>

                    {editMode && form.temporary_password && (
                      <div className="col-12">
                        <label className="form-label fw-semibold">Temporary Password</label>
                        <div className="form-control-plaintext bg-light border rounded p-2">
                          <code>{form.temporary_password}</code>
                          <small className="text-muted ms-2">(Auto-generated)</small>
                        </div>
                      </div>
                    )}

                    <div className="col-12">
                      <label className="form-label fw-semibold">
                        Working Days <span className="text-danger">*</span>
                      </label>
                      <div className="row g-2">
                        {WEEKDAYS.map(d => (
                          <div key={d.key} className="col-6 col-md-4 col-lg-3">
                            <div className="form-check">
                              <input 
                                className="form-check-input"
                                type="checkbox"
                                id={`day-${d.key}`}
                                checked={!!form[d.key]}
                                onChange={(e) => setForm({ ...form, [d.key]: e.target.checked })} 
                              />
                              <label className="form-check-label" htmlFor={`day-${d.key}`}>
                                {d.label}
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                      {errors.weekdays && <div className="text-danger small mt-1">{String(errors.weekdays)}</div>}
                    </div>
                  </div>
                </form>
              </div>

              <div className="modal-footer border-0 pt-0">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button 
                  disabled={saving} 
                  type="submit" 
                  form="dentist-form"
                  className="btn btn-primary"
                  style={{
                    background: 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)',
                    border: 'none'
                  }}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check-circle me-2"></i>
                      {editMode ? "Save Changes" : "Create Dentist"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Creation Modal */}
      {showAccountModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px' }}>
              <div className="modal-header border-0 pb-0" style={{ 
                background: 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)',
                borderRadius: '16px 16px 0 0'
              }}>
                <h5 className="modal-title text-white fw-bold">
                  <i className="bi bi-person-plus me-2"></i>
                  Create Dentist Account
                </h5>
                <button 
                  type="button" 
                  className="btn-close btn-close-white" 
                  onClick={() => setShowAccountModal(false)}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-semibold">Selected Dentist</label>
                  <div className="form-control-plaintext bg-light border rounded p-3">
                    <div className="d-flex align-items-center">
                      <i className="bi bi-person-badge text-primary me-2"></i>
                      <div>
                        <strong>{selectedDentist?.dentist_code}</strong>
                        {selectedDentist?.dentist_name && (
                          <span className="text-muted ms-2">- {selectedDentist.dentist_name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">Email Address</label>
                  <input
                    type="email"
                    className="form-control"
                    value={accountForm.email}
                    onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                    placeholder="dentist@example.com"
                    required
                  />
                  {selectedDentist?.email && accountForm.email !== selectedDentist.email && (
                    <div className="alert alert-warning mt-2 py-2">
                      <i className="bi bi-exclamation-triangle me-2"></i>
                      <small>
                        Email differs from schedule email ({selectedDentist.email}) - this will be logged as an email change
                      </small>
                    </div>
                  )}
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">Full Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={accountForm.name}
                    onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                    placeholder="Dr. John Doe"
                    required
                  />
                </div>

                <div className="alert alert-info">
                  <i className="bi bi-info-circle me-2"></i>
                  <strong>Note:</strong> A temporary password will be generated and sent to the email address. 
                  The dentist will need to verify their email and change their password on first login.
                </div>
              </div>

              <div className="modal-footer border-0">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAccountModal(false)}
                >
                  Cancel
                </button>
                <button
                  disabled={accountLoading}
                  onClick={createAccount}
                  className="btn btn-primary"
                  style={{
                    background: 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)',
                    border: 'none'
                  }}
                >
                  {accountLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Creating...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-person-plus me-2"></i>
                      Create Account
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}