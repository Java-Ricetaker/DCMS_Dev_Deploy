import { useState, useEffect, useMemo } from "react";
import api from "../../api/api";

function TimeBlockUtilizationDashboard() {
  const [selectedWeek, setSelectedWeek] = useState("week1");
  const [timeBlockData, setTimeBlockData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Calculate date ranges for the next 2 weeks
  const getWeekDates = (weekNumber) => {
    const today = new Date();
    const startOfWeek = new Date(today);
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Adjust to start from Monday (1)
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(today.getDate() - daysToSubtract);
    
    // Add weeks offset
    startOfWeek.setDate(startOfWeek.getDate() + (weekNumber === "week2" ? 7 : 0));
    
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    return dates;
  };

  const weekDates = getWeekDates(selectedWeek);
  const weekStart = new Date(weekDates[0]);
  const weekEnd = new Date(weekDates[6]);

  useEffect(() => {
    fetchTimeBlockData();
  }, [selectedWeek]);

  const fetchTimeBlockData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get('/api/admin/time-block-utilization', {
        params: {
          start_date: weekDates[0],
          end_date: weekDates[6]
        }
      });
      
      setTimeBlockData(response.data);
    } catch (err) {
      console.error('Failed to fetch time block data:', err);
      setError('Failed to load time block data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getDayName = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const getFormattedDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getTimeSlotColor = (utilization) => {
    if (utilization === 0) return '#e2e8f0'; // Light gray for empty
    if (utilization <= 25) return '#dcfce7'; // Light green for low usage
    if (utilization <= 50) return '#fef3c7'; // Light yellow for medium usage
    if (utilization <= 75) return '#fed7aa'; // Light orange for high usage
    return '#fecaca'; // Light red for very high usage
  };

  const getUtilizationText = (utilization) => {
    if (utilization === 0) return 'Empty';
    if (utilization <= 25) return 'Low';
    if (utilization <= 50) return 'Medium';
    if (utilization <= 75) return 'High';
    return 'Very High';
  };
  
  const dayDataByDate = useMemo(() => {
    return timeBlockData.reduce((acc, day) => {
      acc[day.date] = day;
      return acc;
    }, {});
  }, [timeBlockData]);

  const timeSlots = useMemo(() => {
    const slots = new Set();
    
    timeBlockData.forEach((day) => {
      day?.time_slots?.forEach((slot) => {
        if (slot?.time) {
          slots.add(slot.time);
        }
      });
    });
    
    const sortByMinutes = (time) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };
    
    return Array.from(slots).sort((a, b) => sortByMinutes(a) - sortByMinutes(b));
  }, [timeBlockData]);
  
  const hasSlots = timeSlots.length > 0;

  return (
    <div 
      className="time-block-utilization-dashboard"
      style={{
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        minHeight: '100vh',
        width: '100%',
        maxWidth: '100%',
        padding: '1.5rem',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <div className="row g-2 g-md-3 g-lg-4 m-0">
        <div className="col-12 p-0">
          <div className="card border-0 shadow-sm" style={{ 
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '100%'
          }}>
            <div className="card-header border-0" style={{ 
              borderRadius: '16px 16px 0 0',
              background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
              color: '#1e293b'
            }}>
              <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3">
                <div>
                  <h2 className="card-title mb-0 fw-bold" style={{ color: '#1e293b' }}>
                    <i className="bi bi-calendar-week me-2"></i>
                    Time Block Utilization Dashboard
                  </h2>
                  <p className="mb-0 mt-2" style={{ color: '#6b7280' }}>
                    Visual overview of appointment capacity and time block usage
                  </p>
                </div>
                
                {/* Week Selector */}
                <div className="d-flex flex-column flex-sm-row gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <label className="form-label mb-0 fw-semibold" style={{ color: '#1e293b' }}>
                      <i className="bi bi-calendar-range me-1"></i>
                      Week:
                    </label>
                    <select
                      className="form-select border-0 shadow-sm"
                      style={{ 
                        borderRadius: '12px', 
                        padding: '8px 12px',
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        minWidth: '120px'
                      }}
                      value={selectedWeek}
                      onChange={(e) => setSelectedWeek(e.target.value)}
                    >
                      <option value="week1">Week 1</option>
                      <option value="week2">Week 2</option>
                    </select>
                  </div>
                  <button
                    className="btn border-0 shadow-sm"
                    onClick={fetchTimeBlockData}
                    style={{
                      background: 'linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%)',
                      color: 'white',
                      borderRadius: '12px',
                      padding: '8px 16px',
                      fontWeight: '600',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <i className="bi bi-arrow-clockwise me-1"></i>
                    Refresh
                  </button>
                </div>
              </div>
              
              {/* Week Information */}
              <div className="mt-3">
                <div className="d-flex align-items-center gap-3">
                  <div className="badge bg-primary fs-6 px-3 py-2">
                    {weekStart.toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric' 
                    })} - {weekEnd.toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                  <small className="text-muted">
                    {selectedWeek === "week1" ? "Next 7 days" : "Following 7 days"}
                  </small>
                </div>
              </div>
            </div>

            <div className="card-body p-4" style={{ width: '100%', maxWidth: '100%' }}>
              {loading ? (
                <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
                  <div className="text-center">
                    <div className="spinner-border text-primary mb-3" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                    <p className="text-muted">Loading time block data...</p>
                  </div>
                </div>
              ) : error ? (
                <div className="alert alert-danger d-flex align-items-center" role="alert">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  <div>
                    <strong>Error:</strong> {error}
                  </div>
                </div>
              ) : (
                <div>
                  {/* Legend */}
                  <div className="mb-4">
                    <h6 className="fw-semibold mb-3" style={{ color: '#1e293b' }}>
                      <i className="bi bi-info-circle me-2"></i>
                      Utilization Legend
                    </h6>
                    <div className="d-flex flex-wrap gap-3">
                      {[
                        { level: 'Empty', color: '#e2e8f0', range: '0%' },
                        { level: 'Low', color: '#dcfce7', range: '1-25%' },
                        { level: 'Medium', color: '#fef3c7', range: '26-50%' },
                        { level: 'High', color: '#fed7aa', range: '51-75%' },
                        { level: 'Very High', color: '#fecaca', range: '76-100%' }
                      ].map((item) => (
                        <div key={item.level} className="d-flex align-items-center gap-2">
                          <div 
                            style={{ 
                              width: '20px', 
                              height: '20px', 
                              backgroundColor: item.color,
                              borderRadius: '4px',
                              border: '1px solid #d1d5db'
                            }}
                          ></div>
                          <span className="text-muted small">
                            {item.level} ({item.range})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Time Block Grid */}
                  <div className="table-responsive" style={{ maxHeight: '70vh', overflow: 'auto' }}>
                    {hasSlots ? (
                      <table className="table table-bordered mb-0" style={{ fontSize: '0.875rem' }}>
                        <thead className="table-primary sticky-top">
                          <tr>
                            <th 
                              className="fw-semibold px-2 py-2 border-0 text-center"
                              style={{ 
                                minWidth: '80px',
                                position: 'sticky',
                                left: 0,
                                backgroundColor: '#0d6efd',
                                zIndex: 10
                              }}
                            >
                              <i className="bi bi-clock me-1"></i>
                              Time
                            </th>
                            {weekDates.map((date) => {
                              const dayData = dayDataByDate[date];
                              const isClosed = dayData && !dayData.is_open;
                              return (
                                <th 
                                  key={date}
                                  className="fw-semibold px-2 py-2 border-0 text-center"
                                  style={{ minWidth: '140px' }}
                                >
                                  <div className="d-flex flex-column align-items-center gap-1">
                                    <div className="fw-bold">{getDayName(date)}</div>
                                    <small className="text-muted">{getFormattedDate(date)}</small>
                                    {isClosed ? (
                                      <span className="badge bg-light text-danger border border-danger-subtle px-2 py-1">
                                        Closed
                                      </span>
                                    ) : (
                                      <small className="text-muted fw-semibold">
                                        {dayData?.open_time && dayData?.close_time
                                          ? `${dayData.open_time} - ${dayData.close_time}`
                                          : 'No hours'}
                                      </small>
                                    )}
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {timeSlots.map((timeSlot) => (
                            <tr key={timeSlot}>
                              <td 
                                className="fw-semibold px-2 py-2 text-center border-0"
                                style={{ 
                                  position: 'sticky',
                                  left: 0,
                                  backgroundColor: '#f8fafc',
                                  zIndex: 5,
                                  borderRight: '2px solid #e2e8f0 !important'
                                }}
                              >
                                {timeSlot}
                              </td>
                              {weekDates.map((date) => {
                                const dayData = dayDataByDate[date];
                                const isClosed = dayData && !dayData.is_open;
                                const slotData = dayData?.time_slots?.find((s) => s.time === timeSlot);
                                
                                if (isClosed) {
                                  return (
                                    <td
                                      key={`${date}-${timeSlot}`}
                                      className="px-1 py-2 text-center border-0"
                                      style={{
                                        backgroundColor: '#f1f5f9',
                                        border: '1px solid #e2e8f0',
                                        color: '#c2410c',
                                        fontWeight: 600,
                                        fontSize: '0.75rem'
                                      }}
                                      title="Clinic closed"
                                    >
                                      Closed
                                    </td>
                                  );
                                }
                                
                                if (!slotData) {
                                  return (
                                    <td
                                      key={`${date}-${timeSlot}`}
                                      className="px-1 py-2 text-center border-0"
                                      style={{
                                        backgroundColor: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        color: '#94a3b8',
                                        fontStyle: 'italic',
                                        fontSize: '0.75rem'
                                      }}
                                      title="Not in schedule"
                                    >
                                      Not in schedule
                                    </td>
                                  );
                                }
                                
                                const utilization = slotData.utilization_percentage || 0;
                                const appointmentCount = slotData.appointment_count || 0;
                                const maxCapacity = slotData.max_capacity || 1;
                                
                                return (
                                  <td 
                                    key={`${date}-${timeSlot}`}
                                    className="px-1 py-2 text-center border-0"
                                    style={{
                                      backgroundColor: getTimeSlotColor(utilization),
                                      border: '1px solid #e2e8f0',
                                      position: 'relative',
                                      cursor: 'pointer'
                                    }}
                                    title={`${timeSlot} - ${getDayName(date)} ${getFormattedDate(date)}\nUtilization: ${utilization}%\nAppointments: ${appointmentCount}/${maxCapacity}`}
                                  >
                                    <div className="d-flex flex-column align-items-center">
                                      <small className="fw-semibold" style={{ fontSize: '0.75rem' }}>
                                        {utilization}%
                                      </small>
                                      <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                                        {appointmentCount}/{maxCapacity}
                                      </small>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="d-flex flex-column justify-content-center align-items-center text-center py-5">
                        <i className="bi bi-calendar-x fs-1 text-muted mb-3"></i>
                        <p className="mb-1 fw-semibold" style={{ color: '#1e293b' }}>
                          No clinic hours scheduled this week
                        </p>
                        <small className="text-muted">
                          All days are closed or no time slots were returned by the API.
                        </small>
                      </div>
                    )}
                  </div>

                  {/* Summary Statistics */}
                  <div className="mt-4">
                    <h6 className="fw-semibold mb-3" style={{ color: '#1e293b' }}>
                      <i className="bi bi-bar-chart me-2"></i>
                      Week Summary
                    </h6>
                    <div className="row g-3">
                      {weekDates.map((date) => {
                        const dayData = timeBlockData.find(d => d.date === date);
                        const totalSlots = dayData?.total_slots || 0;
                        const totalUtilization = dayData?.total_utilization || 0;
                        const totalAppointments = dayData?.total_appointments || 0;
                        
                        return (
                          <div key={date} className="col-12 col-md-6 col-lg-4">
                            <div className="card border-0 shadow-sm h-100">
                              <div className="card-body p-3">
                                <div className="d-flex align-items-center justify-content-between mb-2">
                                  <h6 className="card-title mb-0 fw-semibold">
                                    {getDayName(date)}
                                  </h6>
                                  <small className="text-muted">
                                    {getFormattedDate(date)}
                                  </small>
                                </div>
                                <div className="d-flex justify-content-between">
                                  <div>
                                    <small className="text-muted d-block">Appointments</small>
                                    <span className="fw-bold text-primary">{totalAppointments}</span>
                                  </div>
                                  <div>
                                    <small className="text-muted d-block">Avg. Utilization</small>
                                    <span className="fw-bold text-success">{totalUtilization}%</span>
                                  </div>
                                  <div>
                                    <small className="text-muted d-block">Time Slots</small>
                                    <span className="fw-bold text-info">{totalSlots}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TimeBlockUtilizationDashboard;
