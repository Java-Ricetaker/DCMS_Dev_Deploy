import React, { useState, useEffect } from 'react';
import api from '../../api/api';
import './PatientManager.css';
import toast from 'react-hot-toast';

const PatientManager = () => {
  const [patients, setPatients] = useState([]);
  const [statistics, setStatistics] = useState({
    total_patients_with_no_shows: 0,
    patients_under_warning: 0,
    blocked_patients: 0,
    total_no_shows: 0,
    average_no_shows_per_patient: 0
  });
  const [loading, setLoading] = useState(true);
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [formData, setFormData] = useState({});
  const [loadingPatientDetails, setLoadingPatientDetails] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    min_no_shows: '',
    search: ''
  });
  const [searchTimeout, setSearchTimeout] = useState(null);

  useEffect(() => {
    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // For search, add debounce and minimum character requirement
    if (filters.search && filters.search.length >= 2) {
      const timeout = setTimeout(() => {
        fetchPatients();
        fetchStatistics();
      }, 300); // 300ms debounce
      setSearchTimeout(timeout);
    } else if (filters.search.length === 0 || filters.status || filters.min_no_shows) {
      // Immediate fetch for non-search filters or empty search
      fetchPatients();
      fetchStatistics();
    }

    // Cleanup function
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [filters]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.min_no_shows) params.append('min_no_shows', filters.min_no_shows);
      if (filters.search) params.append('search', filters.search);

      const response = await api.get(`/api/admin/patient-manager?${params.toString()}`);
      
      // Handle different response structures
      if (response.data && response.data.data) {
        // Paginated response
        const patientsData = response.data.data.data || response.data.data || [];
        setPatients(patientsData);
      } else if (Array.isArray(response.data)) {
        // Direct array response
        setPatients(response.data);
      } else {
        // Fallback
        setPatients([]);
      }
    } catch (err) {
      setError('Failed to fetch patients');
      setPatients([]);
      console.error('Error fetching patients:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      setStatisticsLoading(true);
      const response = await api.get('/api/admin/patient-manager/statistics');
      setStatistics(response.data.data || response.data || {});
    } catch (err) {
      console.error('Error fetching statistics:', err);
      setStatistics({});
    } finally {
      setStatisticsLoading(false);
    }
  };

  const handleCardClick = (filterType) => {
    if (filterType === 'warning') {
      setFilters({ ...filters, status: filters.status === 'warning' ? '' : 'warning' });
    } else if (filterType === 'blocked') {
      setFilters({ ...filters, status: filters.status === 'blocked' ? '' : 'blocked' });
    }
  };

  const handleAction = async (action, patientId, data = {}) => {
    try {
      console.log('handleAction called:', { action, patientId, data });
      let response;
      switch (action) {
        case 'send-warning':
          response = await api.post(`/api/admin/patient-manager/${patientId}/send-warning`, data);
          break;
        case 'block':
          console.log('Blocking patient with data:', data);
          response = await api.post(`/api/admin/patient-manager/${patientId}/block`, data);
          break;
        case 'unblock':
          response = await api.post(`/api/admin/patient-manager/${patientId}/unblock`, data);
          break;
        case 'add-note':
          response = await api.post(`/api/admin/patient-manager/${patientId}/add-note`, data);
          break;
        case 'reset-no-shows':
          response = await api.post(`/api/admin/patient-manager/${patientId}/reset-no-shows`, data);
          break;
        default:
          throw new Error('Unknown action');
      }

      if (response.data.success) {
        toast.success(response.data.message);
        fetchPatients();
        fetchStatistics();
        setShowModal(false);
      } else {
        toast.error(response.data.message || 'Action failed');
      }
    } catch (err) {
      // Show validation errors if available
      if (err.response?.data?.errors) {
        const errors = Object.values(err.response.data.errors).flat().join('\n');
        toast.error(`Validation failed:\n${errors}`);
      } else {
        toast.error(err.response?.data?.message || 'Action failed');
      }
      console.error('Error performing action:', err);
    }
  };

  const openModal = async (type, patient) => {
    setModalType(type);
    setSelectedPatient(patient);
    
    // Initialize form data with default values
    const initialFormData = {};
    if (type === 'block') {
      initialFormData.block_type = 'account'; // Default block type
    }
    setFormData(initialFormData);
    setShowModal(true);
    
    // If we need detailed patient data (for blocking with IPs), fetch it
    if (type === 'block' && patient.id) {
      setLoadingPatientDetails(true);
      try {
        const response = await api.get(`/api/admin/patient-manager/${patient.id}`);
        if (response.data.success) {
          setSelectedPatient(response.data.data);
          console.log('Loaded detailed patient data:', response.data.data);
          
          // Auto-fill the last login IP if available
          const lastLoginIp = response.data.data.patient?.last_login_ip;
          if (lastLoginIp) {
            setFormData(prev => ({ 
              ...prev, 
              block_type: prev.block_type || 'account',
              ip: lastLoginIp 
            }));
          }
          
          console.log('Form data after loading patient details:', formData);
        }
      } catch (err) {
        console.error('Error fetching detailed patient data:', err);
      } finally {
        setLoadingPatientDetails(false);
      }
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatient(null);
    setFormData({});
    setModalType('');
  };

  const getStatusBadge = (status) => {
    const badges = {
      active: { class: 'badge bg-success', text: 'Active' },
      warning: { class: 'badge bg-warning', text: 'Under Warning' },
      blocked: { class: 'badge bg-danger', text: 'Blocked' }
    };
    return badges[status] || { class: 'badge bg-secondary', text: 'Unknown' };
  };

  const renderModal = () => {
    if (!showModal || !selectedPatient) return null;

    return (
      <div className="modal fade show d-block" style={{ 
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
                {modalType === 'send-warning' && 'Send Warning'}
                {modalType === 'block' && 'Block Patient'}
                {modalType === 'unblock' && 'Unblock Patient'}
                {modalType === 'add-note' && 'Add Admin Note'}
                {modalType === 'reset-no-shows' && 'Reset No-Show Count'}
              </h5>
              <button type="button" className="btn-close" onClick={closeModal}></button>
            </div>
            <div className="modal-body flex-grow-1" style={{
              overflowY: "auto",
              overflowX: "hidden",
              flex: "1 1 auto",
              minHeight: 0
            }}>
              <div className="mb-3">
                <strong>Patient:</strong> {selectedPatient.patient?.first_name} {selectedPatient.patient?.last_name}
                <br />
                <strong>No-show Count:</strong> {selectedPatient.no_show_count}
                <br />
                <strong>Current Status:</strong> <span className={getStatusBadge(selectedPatient.block_status).class}>{getStatusBadge(selectedPatient.block_status).text}</span>
              </div>

              {modalType === 'send-warning' && (
                <div className="mb-3">
                  <label className="form-label">Warning Message</label>
                  <textarea
                    className="form-control"
                    rows="4"
                    value={formData.message || ''}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Enter custom warning message..."
                  />
                </div>
              )}

              {modalType === 'block' && (
                <>
                  <div className="alert alert-warning">
                    <strong>Note:</strong> This will block the patient from booking new appointments online. They can still walk in for services and access their account.
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Block Reason</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      value={formData.reason || ''}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Enter reason for blocking appointment booking..."
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Block Type</label>
                    <select
                      className="form-control"
                      value={formData.block_type || 'account'}
                      onChange={(e) => setFormData({ ...formData, block_type: e.target.value })}
                    >
                      <option value="account">Account Only</option>
                      <option value="ip">IP Address Only</option>
                      <option value="both">Account + IP Address</option>
                    </select>
                  </div>
                  {(formData.block_type === 'ip' || formData.block_type === 'both') && (
                    <div className="mb-3">
                      <label className="form-label">IP Address</label>
                      
                      {/* Show loading state */}
                      {loadingPatientDetails && (
                        <div className="mb-2">
                          <small className="text-muted">
                            <i className="bi bi-hourglass-split me-1"></i>
                            Loading recent IP addresses...
                          </small>
                        </div>
                      )}
                      
                      {/* Show recent IP addresses if available */}
                      {!loadingPatientDetails && selectedPatient?.patient?.recent_ip_addresses && selectedPatient.patient.recent_ip_addresses.length > 0 && (
                        <div className="mb-2">
                          <small className="text-muted">Recent IP addresses:</small>
                          <small className="text-muted ms-2">
                            <i className="bi bi-info-circle me-1"></i>
                            Multiple IPs may appear due to VPNs, mobile networks, or proxy usage
                          </small>
                          <div className="mt-1">
                            {selectedPatient.patient.recent_ip_addresses.slice(0, 3).map((ipData, index) => (
                              <button
                                key={index}
                                type="button"
                                className="btn btn-outline-secondary btn-sm me-2 mb-1"
                                onClick={() => setFormData({ ...formData, ip: ipData.ip })}
                                title={`Last seen: ${new Date(ipData.last_seen).toLocaleString()}`}
                              >
                                <i className="bi bi-ip-address me-1"></i>
                                {ipData.ip}
                                {index === 0 && <span className="badge bg-primary ms-1">Latest</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <input
                        type="text"
                        className="form-control"
                        value={formData.ip || ''}
                        onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                        placeholder="Enter IP address to block..."
                      />
                      
                      {/* Warning for invalid IPs */}
                      {formData.ip && (
                        <div className="mt-1">
                          {(formData.ip === '127.0.0.1' || formData.ip.startsWith('192.168.') || formData.ip.startsWith('10.') || formData.ip.startsWith('172.')) && (
                            <small className="text-warning">
                              <i className="bi bi-exclamation-triangle me-1"></i>
                              Warning: This appears to be a local/private IP address. Blocking this may affect multiple users.
                            </small>
                          )}
                          {formData.ip === '0.0.0.0' && (
                            <small className="text-danger">
                              <i className="bi bi-x-circle me-1"></i>
                              Invalid IP address. Please enter a valid public IP.
                            </small>
                          )}
                        </div>
                      )}
                      <small className="form-text text-muted">
                        {selectedPatient?.patient?.recent_ip_addresses && selectedPatient.patient.recent_ip_addresses.length > 0 
                          ? "Click on a recent IP above to auto-fill, or enter a custom public IP address."
                          : "Enter a valid public IP address to block. Private/local IPs (127.0.0.1, 192.168.x.x, etc.) are not recommended as they may affect multiple users."
                        }
                      </small>
                    </div>
                  )}
                </>
              )}

              {modalType === 'unblock' && (
                <div className="mb-3">
                  <label className="form-label">Unblock Reason (Optional)</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={formData.reason || ''}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="Enter reason for unblocking..."
                  />
                </div>
              )}

              {modalType === 'add-note' && (
                <div className="mb-3">
                  <label className="form-label">Admin Note</label>
                  <textarea
                    className="form-control"
                    rows="4"
                    value={formData.note || ''}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    placeholder="Enter admin note..."
                    required
                  />
                </div>
              )}

              {modalType === 'reset-no-shows' && (
                <div className="mb-3">
                  <label className="form-label">Reset Reason</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={formData.reason || ''}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="Enter reason for resetting no-show count..."
                    required
                  />
                  <div className="form-text text-warning">
                    <strong>Warning:</strong> This will reset the patient's no-show count to 0 and remove all warnings/blocks.
                  </div>
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
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleAction(modalType, selectedPatient.id, formData)}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="patient-manager">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Patient Manager</h2>
        <div className="d-flex gap-2">
          {(filters.status || filters.min_no_shows || filters.search) && (
            <button 
              className="btn btn-outline-secondary" 
              onClick={() => setFilters({ status: '', min_no_shows: '', search: '' })}
              title="Clear all filters"
            >
              <i className="bi bi-funnel"></i> Clear Filters
            </button>
          )}
          <button className="btn btn-outline-primary" onClick={fetchPatients}>
            <i className="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="row mb-4">
        <div className="col-md-3">
          <div className="card bg-primary text-white">
            <div className="card-body">
              <h5 className="card-title">Total with No-shows</h5>
              <h3>{statisticsLoading ? '...' : (statistics?.total_patients_with_no_shows || 0)}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div 
            className={`card bg-warning text-white ${filters.status === 'warning' ? 'border border-3 border-light' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => handleCardClick('warning')}
            title="Click to filter patients under warning"
          >
            <div className="card-body">
              <h5 className="card-title">Under Warning</h5>
              <h3>{statisticsLoading ? '...' : (statistics?.patients_under_warning || 0)}</h3>
              {filters.status === 'warning' && (
                <small><i className="bi bi-funnel-fill"></i> Filter Active</small>
              )}
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div 
            className={`card bg-danger text-white ${filters.status === 'blocked' ? 'border border-3 border-light' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => handleCardClick('blocked')}
            title="Click to filter blocked patients"
          >
            <div className="card-body">
              <h5 className="card-title">Blocked</h5>
              <h3>{statisticsLoading ? '...' : (statistics?.blocked_patients || 0)}</h3>
              {filters.status === 'blocked' && (
                <small><i className="bi bi-funnel-fill"></i> Filter Active</small>
              )}
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-info text-white">
            <div className="card-body">
              <h5 className="card-title">Total No-shows</h5>
              <h3>{statisticsLoading ? '...' : (statistics?.total_no_shows || 0)}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Status</label>
              <select
                className="form-control"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="warning">Under Warning</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Min No-shows</label>
              <input
                type="number"
                className="form-control"
                value={filters.min_no_shows}
                onChange={(e) => setFilters({ ...filters, min_no_shows: e.target.value })}
                placeholder="Minimum no-shows"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Search</label>
              <input
                type="text"
                className="form-control"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Search by name or contact number... (min 2 characters)"
              />
              {filters.search.length > 0 && filters.search.length < 2 && (
                <div className="form-text text-warning">
                  <i className="bi bi-info-circle me-1"></i>
                  Please enter at least 2 characters to search
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Patients Table */}
      <div className="card">
        <div className="card-body position-relative">
          {/* Loading Overlay - only shows over the table */}
          {loading && (
            <div 
              className="position-absolute top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center" 
              style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.8)', 
                zIndex: 10,
                minHeight: '200px'
              }}
            >
              <div className="text-center">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mt-2 mb-0">Updating table...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Contact</th>
                  <th>No-shows</th>
                  <th>Warnings</th>
                  <th>Status</th>
                  <th>Last No-show</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients && patients.length > 0 ? patients.map((patient) => (
                  <tr key={patient.id}>
                    <td>
                      <strong>{patient.patient?.first_name} {patient.patient?.last_name}</strong>
                      {patient.patient?.user?.email && (
                        <div className="text-muted small">{patient.patient.user.email}</div>
                      )}
                    </td>
                    <td>{patient.patient?.contact_number}</td>
                    <td>
                      <span className="badge bg-danger">{patient.no_show_count}</span>
                    </td>
                    <td>
                      <span className="badge bg-warning">{patient.warning_count}</span>
                    </td>
                    <td>
                      <span className={getStatusBadge(patient.block_status).class}>
                        {getStatusBadge(patient.block_status).text}
                      </span>
                    </td>
                    <td>
                      {patient.last_no_show_at ? new Date(patient.last_no_show_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button
                          className="btn btn-outline-warning"
                          onClick={() => openModal('send-warning', patient)}
                          title="Send Warning"
                        >
                          <i className="bi bi-exclamation-triangle"></i>
                        </button>
                        {patient.block_status !== 'blocked' ? (
                          <button
                            className="btn btn-outline-danger"
                            onClick={() => openModal('block', patient)}
                            title="Block Appointment Booking"
                          >
                            <i className="bi bi-ban"></i>
                          </button>
                        ) : (
                          <button
                            className="btn btn-outline-success"
                            onClick={() => openModal('unblock', patient)}
                            title="Unblock Appointment Booking"
                          >
                            <i className="bi bi-check-circle"></i>
                          </button>
                        )}
                        <button
                          className="btn btn-outline-info"
                          onClick={() => openModal('add-note', patient)}
                          title="Add Note"
                        >
                          <i className="bi bi-sticky"></i>
                        </button>
                        <button
                          className="btn btn-outline-secondary"
                          onClick={() => openModal('reset-no-shows', patient)}
                          title="Reset No-shows"
                        >
                          <i className="bi bi-arrow-clockwise"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="7" className="text-center py-4">
                      <div className="text-muted">
                        <i className="bi bi-inbox fs-1 d-block mb-2"></i>
                        {loading ? 'Loading patients...' : 'No patients found'}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {patients && patients.length === 0 && !loading && (
            <div className="text-center py-4">
              <p className="text-muted">No patients found matching the criteria.</p>
            </div>
          )}
        </div>
      </div>

      {renderModal()}
    </div>
  );
};

export default PatientManager;
