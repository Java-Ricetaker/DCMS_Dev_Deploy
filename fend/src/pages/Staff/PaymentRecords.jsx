import { useState, useEffect } from 'react';
import api from '../../api/api';
import ReceiptModal from '../../components/Admin/ReceiptModal';
import toast from 'react-hot-toast';

const PaymentRecords = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0
  });

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    appointment_date: '',
    visit_date: ''
  });

  // Modal state
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  // Debounce timer for search
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [initialLoad, setInitialLoad] = useState(true);

  // Initial load
  useEffect(() => {
    fetchPayments(1);
    setInitialLoad(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle filter changes (skip on initial load to prevent duplicate fetch)
  useEffect(() => {
    if (initialLoad) return;

    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    const hasValidSearch = filters.search && filters.search.length >= 2;
    const hasDateFilters = filters.appointment_date || filters.visit_date;

    // Only fetch if we have valid filters OR all filters are cleared
    if (hasValidSearch) {
      // Search with debounce (with or without date filters)
      const timeout = setTimeout(() => {
        fetchPayments(1);
      }, 300); // 300ms debounce
      setSearchTimeout(timeout);
    } else if (hasDateFilters || filters.search.length === 0) {
      // Date filters only, OR search cleared (including when all filters cleared)
      fetchPayments(1);
    }
    // If search is < 2 chars and no date filters, don't fetch (invalid search)

    // Cleanup function
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [filters.search, filters.appointment_date, filters.visit_date]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPayments = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page,
        ...filters
      };

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });

      const response = await api.get('/api/staff/payment-records', { params });
      
      if (response.data && response.data.data) {
        setPayments(response.data.data);
        setPagination(response.data.pagination || {
          current_page: 1,
          last_page: 1,
          per_page: 20,
          total: 0
        });
      } else {
        setPayments([]);
        setPagination({
          current_page: 1,
          last_page: 1,
          per_page: 20,
          total: 0
        });
      }
    } catch (err) {
      console.error('Failed to fetch payment records:', err);
      setError('Failed to load payment records. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      appointment_date: '',
      visit_date: ''
    });
  };

  const handleShowReceipt = async (payment) => {
    try {
      setLoadingReceipt(true);
      const response = await api.get(`/api/staff/payment-records/${payment.id}/receipt-data`);
      setSelectedReceipt(response.data.data);
      setShowReceiptModal(true);
    } catch (err) {
      console.error('Failed to fetch receipt data:', err);
      toast.error('Failed to load receipt. Please try again.');
    } finally {
      setLoadingReceipt(false);
    }
  };

  const handleCloseReceipt = () => {
    setShowReceiptModal(false);
    setSelectedReceipt(null);
  };

  const handlePageChange = (newPage) => {
    fetchPayments(newPage);
  };

  return (
    <div className="container-fluid py-4">
      <div className="row">
        <div className="col-12">
          {/* Page Header */}
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div>
              <h2 className="mb-1" style={{ color: '#0077be', fontWeight: 'bold' }}>
                <i className="bi bi-receipt me-2"></i>
                Payment Records
              </h2>
              <p className="text-muted mb-0">Search and view payment receipts</p>
            </div>
            {pagination.total > 0 && (
              <div className="badge bg-primary" style={{ fontSize: '14px', padding: '10px 15px' }}>
                <i className="bi bi-check-circle me-1"></i>
                {pagination.total} Paid {pagination.total === 1 ? 'Payment' : 'Payments'}
              </div>
            )}
          </div>

          {/* Filters Card */}
          <div className="card shadow-sm mb-4">
            <div className="card-body">
              <h5 className="card-title mb-3">
                <i className="bi bi-funnel me-2"></i>
                Filters
              </h5>
              <div className="row g-3">
                {/* Search by Patient Name */}
                <div className="col-md-4">
                  <label className="form-label fw-bold">
                    <i className="bi bi-person-search me-1"></i>
                    Search Patient Name
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    name="search"
                    value={filters.search}
                    onChange={handleFilterChange}
                    placeholder="Enter patient name..."
                  />
                  <small className="text-muted">Minimum 2 characters</small>
                </div>

                {/* Filter by Appointment Date */}
                <div className="col-md-3">
                  <label className="form-label fw-bold">
                    <i className="bi bi-calendar-event me-1"></i>
                    Appointment Date
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    name="appointment_date"
                    value={filters.appointment_date}
                    onChange={handleFilterChange}
                  />
                </div>

                {/* Filter by Visit Date */}
                <div className="col-md-3">
                  <label className="form-label fw-bold">
                    <i className="bi bi-calendar-check me-1"></i>
                    Visit Date
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    name="visit_date"
                    value={filters.visit_date}
                    onChange={handleFilterChange}
                  />
                </div>

                {/* Clear Filters Button */}
                <div className="col-md-2 d-flex align-items-end">
                  <button
                    className="btn btn-outline-secondary w-100"
                    onClick={handleClearFilters}
                    disabled={!filters.search && !filters.appointment_date && !filters.visit_date}
                  >
                    <i className="bi bi-x-circle me-1"></i>
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Records Table */}
          <div className="card shadow-sm">
            <div className="card-body">
              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="mt-3 text-muted">Loading payment records...</p>
                </div>
              ) : error ? (
                <div className="alert alert-danger" role="alert">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {error}
                </div>
              ) : payments.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-inbox" style={{ fontSize: '48px', color: '#ccc' }}></i>
                  <p className="mt-3 text-muted">No payment records found</p>
                  {(filters.search || filters.appointment_date || filters.visit_date) && (
                    <button className="btn btn-sm btn-outline-primary" onClick={handleClearFilters}>
                      Clear Filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="table-responsive">
                    <table className="table table-hover align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>Receipt #</th>
                          <th>Patient Name</th>
                          <th>Service</th>
                          <th>Appointment Date</th>
                          <th>Visit Date</th>
                          <th>Amount Paid</th>
                          <th>Payment Method</th>
                          <th>Date Paid</th>
                          <th>Type</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment) => (
                          <tr key={payment.id}>
                            <td>
                              <span className="badge bg-info text-dark">
                                {payment.receipt_number}
                              </span>
                            </td>
                            <td className="fw-bold">{payment.patient_name}</td>
                            <td>{payment.service_name}</td>
                            <td>
                              {payment.appointment_date ? (
                                <span className="text-muted">
                                  <i className="bi bi-calendar-event me-1"></i>
                                  {new Date(payment.appointment_date).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </span>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                            <td>
                              {payment.visit_date ? (
                                <span className="text-muted">
                                  <i className="bi bi-calendar-check me-1"></i>
                                  {new Date(payment.visit_date).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </span>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                            <td className="fw-bold text-success">
                              ₱{parseFloat(payment.amount_paid).toFixed(2)}
                            </td>
                            <td>
                              <span className="badge bg-secondary">
                                {payment.payment_method}
                              </span>
                            </td>
                            <td className="text-muted" style={{ fontSize: '13px' }}>
                              {payment.paid_at}
                            </td>
                            <td>
                              <span className={`badge ${payment.type === 'visit' ? 'bg-primary' : 'bg-success'}`}>
                                {payment.type === 'visit' ? 'Visit' : 'Appointment'}
                              </span>
                            </td>
                            <td>
                              <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => handleShowReceipt(payment)}
                                disabled={loadingReceipt}
                              >
                                <i className="bi bi-receipt me-1"></i>
                                View Receipt
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {pagination.last_page > 1 && (
                    <div className="d-flex justify-content-between align-items-center mt-3">
                      <div className="text-muted">
                        Showing {((pagination.current_page - 1) * pagination.per_page) + 1} to{' '}
                        {Math.min(pagination.current_page * pagination.per_page, pagination.total)} of{' '}
                        {pagination.total} records
                      </div>
                      <nav>
                        <ul className="pagination mb-0">
                          <li className={`page-item ${pagination.current_page === 1 ? 'disabled' : ''}`}>
                            <button
                              className="page-link"
                              onClick={() => handlePageChange(pagination.current_page - 1)}
                              disabled={pagination.current_page === 1}
                            >
                              Previous
                            </button>
                          </li>
                          {[...Array(pagination.last_page)].map((_, index) => {
                            const page = index + 1;
                            // Show first, last, current, and adjacent pages
                            if (
                              page === 1 ||
                              page === pagination.last_page ||
                              (page >= pagination.current_page - 1 && page <= pagination.current_page + 1)
                            ) {
                              return (
                                <li
                                  key={page}
                                  className={`page-item ${pagination.current_page === page ? 'active' : ''}`}
                                >
                                  <button
                                    className="page-link"
                                    onClick={() => handlePageChange(page)}
                                  >
                                    {page}
                                  </button>
                                </li>
                              );
                            } else if (
                              page === pagination.current_page - 2 ||
                              page === pagination.current_page + 2
                            ) {
                              return <li key={page} className="page-item disabled"><span className="page-link">...</span></li>;
                            }
                            return null;
                          })}
                          <li className={`page-item ${pagination.current_page === pagination.last_page ? 'disabled' : ''}`}>
                            <button
                              className="page-link"
                              onClick={() => handlePageChange(pagination.current_page + 1)}
                              disabled={pagination.current_page === pagination.last_page}
                            >
                              Next
                            </button>
                          </li>
                        </ul>
                      </nav>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      <ReceiptModal
        show={showReceiptModal}
        onHide={handleCloseReceipt}
        receiptData={selectedReceipt}
      />
    </div>
  );
};

export default PaymentRecords;

