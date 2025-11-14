import { useState, useEffect } from 'react';
import api from '../../api/api';
import toast from 'react-hot-toast';

export default function TimeBlockModal({ show, onClose }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (show) {
      fetchTimeBlocks();
    }
  }, [show]);

  const fetchTimeBlocks = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/staff/today-time-blocks');
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch time blocks:', err);
      toast.error('Failed to load time blocks');
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">
              <i className="bi bi-calendar-check me-2"></i>
              Today's Appointment Schedule
            </h5>
            <button 
              type="button" 
              className="btn-close btn-close-white" 
              onClick={onClose}
            ></button>
          </div>
          
          <div className="modal-body">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : !data?.is_open ? (
              <div className="alert alert-info">
                <i className="bi bi-info-circle me-2"></i>
                Clinic is closed today
              </div>
            ) : (
              <div>
                <div className="alert alert-info mb-4">
                  <strong>Clinic Hours:</strong> {data.open_time} - {data.close_time} | 
                  <strong className="ms-3">Capacity:</strong> {data.capacity} per slot
                </div>
                
                <div className="time-block-container">
                  {data.blocks.map((block) => (
                    <div 
                      key={block.time} 
                      className={`card mb-3 ${block.count > 0 ? 'border-primary' : 'border-secondary'}`}
                    >
                      <div className="card-header d-flex justify-content-between align-items-center">
                        <h6 className="mb-0">
                          <i className="bi bi-clock me-2"></i>
                          {block.time}
                        </h6>
                        <span className={`badge ${block.count > 0 ? 'bg-primary' : 'bg-secondary'}`}>
                          {block.count} appointment{block.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      
                      {block.count > 0 && (
                        <div className="card-body">
                          <div className="list-group list-group-flush">
                            {block.appointments.map((apt) => (
                              <div key={apt.id} className="list-group-item">
                                <div className="d-flex justify-content-between align-items-start">
                                  <div>
                                    <h6 className="mb-1">{apt.patient_name}</h6>
                                    <small className="text-muted">
                                      <i className="bi bi-bandaid me-1"></i>
                                      {apt.service_name}
                                    </small>
                                    <br />
                                    <small className="text-muted">
                                      <i className="bi bi-tag me-1"></i>
                                      Ref: {apt.reference_code}
                                    </small>
                                  </div>
                                  <span className={`badge ${
                                    apt.status === 'completed' ? 'bg-success' : 'bg-info'
                                  }`}>
                                    {apt.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="modal-footer">
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose}
            >
              Close
            </button>
            <button 
              type="button" 
              className="btn btn-primary" 
              onClick={fetchTimeBlocks}
              disabled={loading}
            >
              <i className="bi bi-arrow-clockwise me-2"></i>
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
