import Modal from "./Modal";
import LoadingSpinner from "./LoadingSpinner";
import { useState, useMemo } from "react";

function ServiceSelectionModal({ 
  isOpen, 
  onClose, 
  services, 
  loading, 
  error, 
  onServiceSelect,
  selectedDate,
  selectedService 
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // "grid" or "single"
  const [searchTimeout, setSearchTimeout] = useState(null);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const filteredServices = useMemo(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) return services;
    return services.filter(service => 
      service.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [services, searchTerm]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Only search if we have at least 2 characters or empty string
    if (value.length === 0 || value.length >= 2) {
      // For immediate visual feedback, we don't need debounce here since it's local filtering
      // The filtering is handled by the useMemo above
    }
  };

  const clearSearch = () => {
    setSearchTerm("");
  };

  const handleServiceClick = (service) => {
    if (selectedService && selectedService.id === service.id) {
      // If clicking on already selected service, go back to grid view
      setViewMode("grid");
    } else {
      // Select the service and show single view
      onServiceSelect(service);
      setViewMode("single");
    }
  };

  const handleBackToGrid = () => {
    setViewMode("grid");
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={
        <div className="d-flex flex-column">
          <span className="h3 mb-1 fw-bold">Available Services</span>
          <small className="text-muted fs-6">{formatDate(selectedDate)}</small>
        </div>
      }
      maxWidth="xl"
    >
      <div className="container-fluid px-0">
        {loading && (
          <div className="text-center py-5">
            <LoadingSpinner message="Loading available services..." />
          </div>
        )}

        {error && (
          <div className="alert alert-danger border-0 rounded-3 shadow-sm" role="alert">
            <div className="d-flex align-items-center">
              <i className="bi bi-exclamation-triangle-fill me-3 fs-5"></i>
              <div>
                <h6 className="alert-heading mb-1">Error Loading Services</h6>
                <p className="mb-0">{error}</p>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && services.length === 0 && (
          <div className="text-center py-5">
            <div className="text-muted">
              <i className="bi bi-calendar-x display-1 d-block mb-3 text-muted"></i>
              <h4 className="fw-normal">No services available</h4>
              <p className="lead">There are no available services for the selected date.</p>
            </div>
          </div>
        )}

        {!loading && !error && services.length > 0 && (
          <>
            {viewMode === "single" && selectedService ? (
              /* Single Service View */
              <div className="single-service-view">
                <div className="row mb-4">
                  <div className="col-12">
                    <div className="alert border-0 rounded-3 shadow-sm mb-0" style={{
                      background: 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)',
                      border: '1px solid #b8dacc'
                    }}>
                      <div className="d-flex align-items-center">
                        <i className="bi bi-check-circle-fill text-success me-3" style={{fontSize: '1.5rem'}}></i>
                        <div>
                          <h5 className="alert-heading mb-1 text-success fw-bold">
                            Selected Service
                          </h5>
                          <p className="mb-0" style={{color: '#155724'}}>
                            Click to change or confirm selection
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="row justify-content-center">
                  <div className="col-12 col-md-10 col-lg-8 col-xl-6">
                    <div className="card border-0 selected-service-card" style={{
                      borderRadius: '16px',
                      background: '#ffffff',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                    }}>
                      <div className="card-body p-4 p-md-5 text-center">
                        <div className="mb-4">
                          <h2 className="card-title fw-bold text-dark mb-4" style={{
                            fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
                            lineHeight: '1.3',
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word'
                          }}>
                            {selectedService.name}
                          </h2>

                          {selectedService.type === "promo" && (
                            <div className="pricing-section-large">
                              <div className="d-flex justify-content-center align-items-center mb-3">
                                <span className="text-muted text-decoration-line-through me-3 fs-5">
                                  ₱{Number(selectedService.original_price).toLocaleString()}{selectedService.per_teeth_service ? ' per tooth' : ''}
                                </span>
                                <span className="badge bg-danger fs-6">
                                  {selectedService.discount_percent}% OFF
                                </span>
                              </div>
                              <div className="display-6 text-success fw-bold mb-0" style={{
                                fontSize: 'clamp(2rem, 5vw, 3rem)',
                                lineHeight: '1.2',
                                wordWrap: 'break-word'
                              }}>
                                ₱{Number(selectedService.promo_price).toLocaleString()}{selectedService.per_teeth_service ? ' per tooth' : ''}
                              </div>
                              {selectedService.per_teeth_service && (
                                <div className="text-center mt-3">
                                  <small className="d-inline-flex align-items-center" style={{
                                    color: '#007bff',
                                    fontSize: '0.875rem'
                                  }}>
                                    <i className="bi bi-info-circle me-2" style={{fontSize: '1rem'}}></i>
                                    Total cost depends on number of teeth treated
                                  </small>
                                </div>
                              )}
                            </div>
                          )}

                          {selectedService.type === "special" && (
                            <div className="pricing-section-large">
                              <div className="display-6 text-info fw-bold mb-3" style={{
                                fontSize: 'clamp(2rem, 5vw, 3rem)',
                                lineHeight: '1.2',
                                wordWrap: 'break-word'
                              }}>
                                ₱{Number(selectedService.price).toLocaleString()}{selectedService.per_teeth_service ? ' per tooth' : ''}
                              </div>
                              <span className="badge bg-info fs-6">Special Service</span>
                              {selectedService.per_teeth_service && (
                                <div className="text-center mt-3">
                                  <small className="d-inline-flex align-items-center" style={{
                                    color: '#007bff',
                                    fontSize: '0.875rem'
                                  }}>
                                    <i className="bi bi-info-circle me-2" style={{fontSize: '1rem'}}></i>
                                    Total cost depends on number of teeth treated
                                  </small>
                                </div>
                              )}
                            </div>
                          )}

                          {selectedService.type === "regular" && (
                            <div className="pricing-section-large">
                              <div className="display-6 text-dark fw-bold mb-0" style={{
                                fontSize: 'clamp(2rem, 5vw, 3rem)',
                                lineHeight: '1.2',
                                wordWrap: 'break-word'
                              }}>
                                ₱{Number(selectedService.price).toLocaleString()}{selectedService.per_teeth_service ? ' per tooth' : ''}
                              </div>
                              {selectedService.per_teeth_service && (
                                <div className="text-center mt-3">
                                  <small className="d-inline-flex align-items-center" style={{
                                    color: '#007bff',
                                    fontSize: '0.875rem'
                                  }}>
                                    <i className="bi bi-info-circle me-2" style={{fontSize: '1rem'}}></i>
                                    Total cost depends on number of teeth treated
                                  </small>
                                </div>
                              )}
                            </div>
                          )}
                          {selectedService.is_follow_up && (
                            <div className="mt-4">
                              <span className="badge bg-primary fs-6 px-3 py-2">Follow-up Service</span>
                              <div className="mt-3 text-muted">
                                <strong>Parent Service:</strong>{" "}
                                {selectedService.follow_up_parent_name || "Assigned parent service"}
                              </div>
                              <div className="text-muted">
                                {selectedService.follow_up_max_gap_weeks === null || selectedService.follow_up_max_gap_weeks === undefined
                                  ? "No time limit between parent and follow-up visits."
                                  : `Book within ${selectedService.follow_up_max_gap_weeks} week${selectedService.follow_up_max_gap_weeks === 1 ? '' : 's'} of completing the parent service.`}
                              </div>
                            </div>
                          )}
                          {selectedService.has_follow_up_services && selectedService.follow_up_services && selectedService.follow_up_services.length > 0 && (
                            <div className="mt-4">
                              <div className="alert alert-warning border-0 shadow-sm" role="alert">
                                <div className="d-flex align-items-start">
                                  <i className="bi bi-exclamation-triangle-fill me-3 fs-4 text-warning"></i>
                                  <div>
                                    <h6 className="alert-heading text-warning mb-2">
                                      <strong>Are you sure you want to book this service?</strong>
                                    </h6>
                                    <p className="mb-2">
                                      This service has a follow-up service available. If you've already completed this service before, you might want to book the follow-up service instead:
                                    </p>
                                    <ul className="mb-2 ps-3">
                                      {selectedService.follow_up_services.map((followUp) => (
                                        <li key={followUp.id}>
                                          <strong>{followUp.name}</strong>
                                        </li>
                                      ))}
                                    </ul>
                                    <p className="mb-0">
                                      <strong>Please confirm:</strong> Do you want to book <strong>{selectedService.name}</strong> (the parent service) or one of the follow-up services listed above?
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="d-grid gap-3 mt-4">
                          <button
                            className="btn btn-lg fw-bold"
                            onClick={() => {
                              onServiceSelect(selectedService);
                              onClose();
                            }}
                            style={{
                              padding: '0.875rem 1.75rem',
                              fontSize: '1rem',
                              borderRadius: '10px',
                              whiteSpace: 'nowrap',
                              background: '#28a745',
                              border: 'none',
                              color: 'white',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.background = '#218838';
                              e.target.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.background = '#28a745';
                              e.target.style.transform = 'translateY(0)';
                            }}
                          >
                            <i className="bi bi-check-circle-fill me-2"></i>
                            Confirm Selection
                          </button>
                          <button
                            className="btn btn-lg"
                            onClick={handleBackToGrid}
                            style={{
                              padding: '0.75rem 1.5rem',
                              fontSize: '0.95rem',
                              borderRadius: '10px',
                              whiteSpace: 'nowrap',
                              background: 'transparent',
                              border: '2px solid #007bff',
                              color: '#007bff',
                              fontWeight: '500',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.background = '#007bff';
                              e.target.style.color = 'white';
                              e.target.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.background = 'transparent';
                              e.target.style.color = '#007bff';
                              e.target.style.transform = 'translateY(0)';
                            }}
                          >
                            <i className="bi bi-arrow-left-right me-2"></i>
                            Choose Different Service
                          </button>
                          <button
                            className="btn btn-lg"
                            onClick={handleBackToGrid}
                            style={{
                              padding: '0.75rem 1.5rem',
                              fontSize: '0.95rem',
                              borderRadius: '10px',
                              whiteSpace: 'nowrap',
                              background: 'linear-gradient(90deg, #00b4d8 0%, #0077b6 100%)',
                              border: 'none',
                              color: 'white',
                              fontWeight: '500',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.background = 'linear-gradient(90deg, #0096c7 0%, #0056b3 100%)';
                              e.target.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.background = 'linear-gradient(90deg, #00b4d8 0%, #0077b6 100%)';
                              e.target.style.transform = 'translateY(0)';
                            }}
                          >
                            <i className="bi bi-arrow-left me-2"></i>
                            Back to All Services
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Grid View */
              <>
                {/* Header with stats and search */}
                <div className="row mb-4">
                  <div className="col-12">
                    <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                      <div className="alert alert-light border-0 rounded-3 shadow-sm mb-0 flex-grow-1">
                        <div className="d-flex align-items-center">
                          <i className="bi bi-info-circle-fill text-primary me-3 fs-4"></i>
                          <div>
                            <h5 className="alert-heading mb-1 text-primary">
                              {filteredServices.length} of {services.length} services available
                            </h5>
                            <p className="mb-0 text-muted">
                              For {formatDate(selectedDate)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="row mb-4">
                  <div className="col-12">
                    <div className="position-relative">
                      <div className="input-group input-group-lg">
                        <span className="input-group-text bg-light border-end-0">
                          <i className="bi bi-search text-muted"></i>
                        </span>
                        <input
                          type="text"
                          className="form-control border-start-0 ps-0"
                          placeholder="Search services by name... (min 2 characters)"
                          value={searchTerm}
                          onChange={handleSearchChange}
                          style={{ fontSize: '1.1rem' }}
                        />
                        {searchTerm && (
                          <button
                            className="btn btn-outline-secondary border-start-0"
                            type="button"
                            onClick={clearSearch}
                            title="Clear search"
                          >
                            <i className="bi bi-x-lg"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Services Grid */}
                {searchTerm.length > 0 && searchTerm.length < 2 ? (
                  <div className="text-center py-5">
                    <i className="bi bi-info-circle display-4 text-warning d-block mb-3"></i>
                    <h4 className="text-warning">Please enter at least 2 characters</h4>
                    <p className="text-muted fs-5">Type more characters to search for services</p>
                    <button 
                      className="btn btn-outline-primary btn-lg"
                      onClick={clearSearch}
                    >
                      Clear Search
                    </button>
                  </div>
                ) : filteredServices.length === 0 && searchTerm ? (
                  <div className="text-center py-5">
                    <i className="bi bi-search display-4 text-muted d-block mb-3"></i>
                    <h4 className="text-muted">No services found</h4>
                    <p className="text-muted fs-5">Try adjusting your search terms</p>
                    <button 
                      className="btn btn-outline-primary btn-lg"
                      onClick={clearSearch}
                    >
                      Clear Search
                    </button>
                  </div>
                ) : (
                  <div className="row g-3">
                    {filteredServices.map((service) => (
                      <div 
                        className="col-12" 
                        key={`${service.id}-${service.type}`}
                      >
                        <div className="card border-0 shadow-sm service-card">
                          <div className="card-body d-flex align-items-center p-4">
                            <div className="flex-grow-1 me-4">
                              <h4 className="card-title fw-bold text-dark mb-2">
                                {service.name}
                              </h4>

                              {service.type === "promo" && (
                                <div className="d-flex align-items-center">
                                  <span className="text-muted text-decoration-line-through me-3">
                                    ₱{Number(service.original_price).toLocaleString()}{service.per_teeth_service ? ' per tooth' : ''}
                                  </span>
                                  <span className="badge bg-danger me-3">
                                    {service.discount_percent}% OFF
                                  </span>
                                  <div className="h4 text-success fw-bold mb-0">
                                    ₱{Number(service.promo_price).toLocaleString()}{service.per_teeth_service ? ' per tooth' : ''}
                                  </div>
                                </div>
                              )}

                              {service.type === "special" && (
                                <div className="d-flex align-items-center">
                                  <div className="h4 text-info fw-bold me-3">
                                    ₱{Number(service.price).toLocaleString()}{service.per_teeth_service ? ' per tooth' : ''}
                                  </div>
                                  <span className="badge bg-info">Special Service</span>
                                </div>
                              )}

                              {service.type === "regular" && (
                                <div className="h4 text-dark fw-bold mb-0">
                                  ₱{Number(service.price).toLocaleString()}{service.per_teeth_service ? ' per tooth' : ''}
                                </div>
                              )}
                              {service.is_follow_up && (
                                <div className="mt-3">
                                  <span className="badge bg-primary me-2">Follow-up</span>
                                  <div className="text-muted small mt-1">
                                    Parent: {service.follow_up_parent_name || 'Assigned parent service'}
                                  </div>
                                  <div className="text-muted small">
                                    {service.follow_up_max_gap_weeks === null || service.follow_up_max_gap_weeks === undefined
                                      ? 'No time limit between visits'
                                      : `Book within ${service.follow_up_max_gap_weeks} week${service.follow_up_max_gap_weeks === 1 ? '' : 's'} of completing the parent service`}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="flex-shrink-0">
                              <button
                                className="btn btn-primary btn-lg fw-semibold px-4"
                                onClick={() => handleServiceClick(service)}
                              >
                                <i className="bi bi-check-circle-fill me-2"></i>
                                Select Service
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="row mt-5 pt-4 border-top">
                  <div className="col-12">
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="text-muted">
                        Showing {filteredServices.length} of {services.length} services
                      </div>
                      <button 
                        type="button" 
                        className="btn btn-outline-secondary btn-lg"
                        onClick={onClose}
                      >
                        <i className="bi bi-x-circle me-2"></i>
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .service-card {
          transition: all 0.3s ease-in-out;
          border-radius: 16px;
          overflow: hidden;
          cursor: pointer;
          min-height: 100px;
        }
        
        .service-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.15) !important;
        }
        
        .selected-service-card {
          border-radius: 20px;
          background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
        }
        
        .pricing-section {
          min-height: 60px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        
        .pricing-section-large {
          min-height: 120px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        
        .card-title {
          font-size: 1.3rem;
          line-height: 1.4;
          margin-bottom: 0.5rem;
        }
        
        .btn-primary {
          background: linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%);
          border: none;
          border-radius: 12px;
          padding: 14px 28px;
          font-weight: 600;
          letter-spacing: 0.5px;
          font-size: 1rem;
        }
        
        .btn-primary:hover {
          background: linear-gradient(135deg, #0b5ed7 0%, #0a58ca 100%);
          transform: translateY(-2px);
        }
        
        .btn-lg {
          padding: 16px 32px;
          font-size: 1.1rem;
          border-radius: 14px;
        }
        
        .input-group-lg .form-control {
          border-radius: 14px;
          border: 2px solid #e9ecef;
          transition: all 0.3s ease;
          font-size: 1.1rem;
          padding: 16px 20px;
        }
        
        .input-group-lg .form-control:focus {
          border-color: #0d6efd;
          box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
        }
        
        .input-group-text {
          border-radius: 14px 0 0 14px;
          border: 2px solid #e9ecef;
          border-right: none;
          background: #f8f9fa;
          padding: 16px 20px;
        }
        
        .alert-light {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        }
        
        .badge {
          font-size: 0.8rem;
          padding: 0.6rem 0.9rem;
          border-radius: 10px;
          font-weight: 600;
        }
        
        /* Dynamic sizing based on screen width */
        @media (max-width: 576px) {
          .service-card .card-body {
            padding: 1.5rem;
            flex-direction: column;
            align-items: flex-start;
          }
          
          .service-card .flex-grow-1 {
            margin-right: 0;
            margin-bottom: 1rem;
          }
          
          .card-title {
            font-size: 1.1rem;
          }
          
          .h4 {
            font-size: 1.2rem;
          }
          
          .btn-lg {
            padding: 12px 24px;
            font-size: 0.95rem;
            width: 100%;
          }
          
          .input-group-lg .form-control {
            font-size: 1rem;
            padding: 14px 18px;
          }
          
          .input-group-text {
            padding: 14px 18px;
          }
        }
        
        @media (min-width: 577px) and (max-width: 768px) {
          .service-card .card-body {
            padding: 1.75rem;
          }
          
          .card-title {
            font-size: 1.2rem;
          }
          
          .h4 {
            font-size: 1.3rem;
          }
        }
        
        @media (min-width: 769px) and (max-width: 992px) {
          .service-card .card-body {
            padding: 2rem;
          }
          
          .card-title {
            font-size: 1.3rem;
          }
          
          .h4 {
            font-size: 1.4rem;
          }
        }
        
        @media (min-width: 993px) and (max-width: 1199px) {
          .service-card .card-body {
            padding: 2.25rem;
          }
          
          .card-title {
            font-size: 1.4rem;
          }
          
          .h4 {
            font-size: 1.5rem;
          }
        }
        
        @media (min-width: 1200px) {
          .service-card .card-body {
            padding: 2.5rem;
          }
          
          .card-title {
            font-size: 1.5rem;
          }
          
          .h4 {
            font-size: 1.6rem;
          }
          
          .btn-lg {
            padding: 18px 36px;
            font-size: 1.15rem;
          }
        }
        
        @media (min-width: 1400px) {
          .service-card .card-body {
            padding: 3rem;
          }
          
          .card-title {
            font-size: 1.6rem;
          }
          
          .h4 {
            font-size: 1.7rem;
          }
          
          .btn-lg {
            padding: 20px 40px;
            font-size: 1.2rem;
          }
        }
        
        /* Single service view responsive */
        .single-service-view .selected-service-card {
          max-width: 700px;
          margin: 0 auto;
          min-height: 400px;
        }
        
        .selected-service-card .card-body {
          min-height: 350px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        
        .pricing-section-large {
          min-height: 100px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        
        @media (max-width: 576px) {
          .single-service-view .selected-service-card .card-body {
            padding: 1.5rem !important;
            min-height: 300px;
          }
          
          .single-service-view h2 {
            font-size: 1.3rem !important;
            line-height: 1.4 !important;
          }
          
          .single-service-view .display-6 {
            font-size: 1.8rem !important;
            line-height: 1.3 !important;
          }
          
          .pricing-section-large {
            min-height: 80px;
          }
        }
        
        @media (min-width: 577px) and (max-width: 768px) {
          .single-service-view .selected-service-card .card-body {
            padding: 2rem !important;
            min-height: 350px;
          }
          
          .single-service-view h2 {
            font-size: 1.6rem !important;
            line-height: 1.3 !important;
          }
          
          .single-service-view .display-6 {
            font-size: 2.2rem !important;
            line-height: 1.2 !important;
          }
        }
        
        @media (min-width: 769px) {
          .single-service-view .selected-service-card .card-body {
            padding: 3rem !important;
            min-height: 400px;
          }
          
          .single-service-view h2 {
            font-size: 2rem !important;
            line-height: 1.3 !important;
          }
          
          .single-service-view .display-6 {
            font-size: 2.8rem !important;
            line-height: 1.2 !important;
          }
        }
      `}</style>
    </Modal>
  );
}

export default ServiceSelectionModal;
