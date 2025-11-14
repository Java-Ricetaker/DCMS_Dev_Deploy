import { useEffect, useState } from "react";
import api from "../../api/api";
import toast, { Toaster } from "react-hot-toast";

const weekdayLabels = [
  "Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"
];

function WeeklyScheduleManager() {
  const [schedules, setSchedules] = useState([]);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => { fetchSchedules(); }, []);

  const fetchSchedules = async () => {
    try {
      const res = await api.get("/api/weekly-schedule");
      setSchedules(res.data);
    } catch (err) {
      console.error("Failed to load weekly schedule", err);
    }
  };

  const handleChange = (id, field, value) => {
    setSchedules(prev =>
      prev.map(row => {
        if (row.id !== id) return row;

        if (field === "is_open") {
          const isOpen = value;
          return {
            ...row,
            is_open: isOpen,
            // if closing a day, clear times in UI (optional UX)
            open_time: isOpen ? (row.open_time || "08:00") : "",
            close_time: isOpen ? (row.close_time || "17:00") : "",
          };
        }
        return { ...row, [field]: value };
      })
    );
  };

  const handleSave = async (id) => {
    const row = schedules.find(r => r.id === id);
    setSavingId(id);
    try {
      await api.patch(`/api/weekly-schedule/${id}`, {
        is_open: !!row.is_open,
        open_time: row.is_open ? row.open_time : null,
        close_time: row.is_open ? row.close_time : null,
        note: row.note ?? null,
        // intentionally NOT sending dentist_count / max_per_slot anymore
      });
      toast.success(`${weekdayLabels[row.weekday]} saved.`, {
        style: {
          background: '#28a745',
          color: '#fff',
          borderRadius: '8px',
          padding: '16px',
          fontSize: '16px',
          fontWeight: '500',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        },
        iconTheme: {
          primary: '#fff',
          secondary: '#28a745',
        },
      });
    } catch (err) {
      console.error("Failed to save", err);
      const errorMessage = err.response?.data?.message || "Save failed. See console.";
      toast.error(errorMessage, {
        style: {
          background: '#dc3545',
          color: '#fff',
          borderRadius: '8px',
          padding: '16px',
          fontSize: '16px',
          fontWeight: '500',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        },
        iconTheme: {
          primary: '#fff',
          secondary: '#dc3545',
        },
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <Toaster 
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '8px',
            padding: '16px',
            fontSize: '16px',
            fontWeight: '500',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          },
          error: {
            style: {
              background: '#dc3545',
              color: '#fff',
            },
            iconTheme: {
              primary: '#fff',
              secondary: '#dc3545',
            },
          },
          success: {
            style: {
              background: '#28a745',
              color: '#fff',
            },
            iconTheme: {
              primary: '#fff',
              secondary: '#28a745',
            },
          },
        }}
      />
      <div 
        className="weekly-schedule-page"
        style={{
          width: '100%',
          maxWidth: '100%',
          padding: '0',
          boxSizing: 'border-box'
        }}
      >
      {/* Header Section */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
        <div>
          <h2 className="m-0 fw-bold" style={{ color: '#1e293b' }}>
            <i className="bi bi-calendar-week me-2"></i>
            Weekly Default Schedule
          </h2>
          <p className="text-muted mb-0 mt-1">Configure clinic operating hours and availability for each day of the week</p>
        </div>
      </div>

      <div className="row g-2 g-md-3 g-lg-4 m-0">
        <div className="col-12 p-0">
          <div className="card border-0 shadow-sm" style={{ 
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '100%'
          }}>
            <div className="card-header bg-transparent border-0 p-4 pb-0">
              <h5 className="card-title mb-0 fw-bold" style={{ color: '#1e293b' }}>
                <i className="bi bi-clock me-2"></i>
                Operating Hours Configuration
              </h5>
            </div>
            <div className="card-body p-4" style={{ width: '100%', maxWidth: '100%' }}>
              <div className="table-responsive" style={{ width: '100%', maxWidth: '100%' }}>
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-primary">
                    <tr>
                      <th className="fw-semibold px-3 px-md-4 py-3 border-0" style={{ fontSize: '1.1rem', minWidth: '140px' }}>
                        <i className="bi bi-calendar-day me-2"></i>Day
                      </th>
                      <th className="fw-semibold px-3 px-md-4 py-3 border-0" style={{ fontSize: '1.1rem', minWidth: '120px' }}>
                        <i className="bi bi-power me-2"></i>Status
                      </th>
                      <th className="fw-semibold px-3 px-md-4 py-3 border-0" style={{ fontSize: '1.1rem', minWidth: '120px' }}>
                        <i className="bi bi-sunrise me-2"></i>Opening
                      </th>
                      <th className="fw-semibold px-3 px-md-4 py-3 border-0" style={{ fontSize: '1.1rem', minWidth: '120px' }}>
                        <i className="bi bi-sunset me-2"></i>Closing
                      </th>
                      <th className="fw-semibold px-3 px-md-4 py-3 border-0" style={{ fontSize: '1.1rem' }}>
                        <i className="bi bi-chat-text me-2"></i>Note
                      </th>
                      <th className="fw-semibold px-3 px-md-4 py-3 border-0" style={{ fontSize: '1.1rem', minWidth: '110px' }}>
                        <i className="bi bi-gear me-2"></i>Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map(s => (
                      <tr key={s.id} className="align-middle" style={{ height: '60px' }}>
                        <td className="px-3 px-md-4 py-3 fw-medium border-0" style={{ fontSize: '1rem' }}>
                          <div className="d-flex align-items-center">
                            <div className="bg-primary rounded-circle me-3 d-flex align-items-center justify-content-center" 
                                 style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}>
                              📅
                            </div>
                            <div>
                              <div className="fw-bold text-dark">{weekdayLabels[s.weekday]}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 px-md-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                          <select
                            className="form-select border-0 shadow-sm"
                            style={{ borderRadius: '8px', padding: '8px 12px' }}
                            value={s.is_open ? "true" : "false"}
                            onChange={(e) => handleChange(s.id, "is_open", e.target.value === "true")}
                          >
                            <option value="true">Open</option>
                            <option value="false">Closed</option>
                          </select>
                        </td>

                        <td className="px-3 px-md-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                          {!s.is_open ? (
                            <input 
                              className="form-control border-0 shadow-sm" 
                              disabled 
                              placeholder="—"
                              style={{ borderRadius: '8px', padding: '8px 12px' }}
                            />
                          ) : (
                            <input
                              type="time"
                              className="form-control border-0 shadow-sm"
                              style={{ borderRadius: '8px', padding: '8px 12px' }}
                              value={s.open_time || ""}
                              onChange={(e) => handleChange(s.id, "open_time", e.target.value)}
                            />
                          )}
                        </td>

                        <td className="px-3 px-md-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                          {!s.is_open ? (
                            <input 
                              className="form-control border-0 shadow-sm" 
                              disabled 
                              placeholder="—"
                              style={{ borderRadius: '8px', padding: '8px 12px' }}
                            />
                          ) : (
                            <input
                              type="time"
                              className="form-control border-0 shadow-sm"
                              style={{ borderRadius: '8px', padding: '8px 12px' }}
                              value={s.close_time || ""}
                              onChange={(e) => handleChange(s.id, "close_time", e.target.value)}
                            />
                          )}
                        </td>

                        <td className="px-3 px-md-4 py-3 border-0" style={{ fontSize: '1rem' }}>
                          <input
                            type="text"
                            className="form-control border-0 shadow-sm"
                            style={{ borderRadius: '8px', padding: '8px 12px' }}
                            value={s.note || ""}
                            onChange={(e) => handleChange(s.id, "note", e.target.value)}
                            placeholder="Optional note"
                          />
                        </td>

                        <td className="px-3 px-md-4 py-3 border-0">
                          <button
                            className="btn btn-sm border-0 shadow-sm"
                            onClick={() => handleSave(s.id)}
                            disabled={savingId === s.id}
                            style={{
                              background: savingId === s.id 
                                ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
                                : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                              color: 'white',
                              borderRadius: '8px',
                              padding: '8px 16px',
                              fontWeight: '600',
                              transition: 'all 0.3s ease'
                            }}
                          >
                            {savingId === s.id ? (
                              <>
                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                Saving...
                              </>
                            ) : (
                              <>
                                <i className="bi bi-check-lg me-1"></i>
                                Save
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 p-3 bg-light rounded-3">
                <div className="d-flex align-items-start">
                  <div className="me-3">
                    <i className="bi bi-info-circle text-primary" style={{ fontSize: '1.2rem' }}></i>
                  </div>
                  <div>
                    <h6 className="fw-semibold mb-2 text-dark">Important Notes</h6>
                    <p className="text-muted mb-0 small">
                      <strong>Dentist headcount and per-slot capacity</strong> are managed separately in the{" "}
                      <strong>📊 Capacity (14 days)</strong> section and by individual dentist schedules—not in this weekly configuration.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export default WeeklyScheduleManager;
