import { useEffect, useState } from "react";
import api from "../../api/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useAuth } from "../../hooks/useAuth";

function DentistSchedule() {
  const { user } = useAuth();
  const [dentistSchedule, setDentistSchedule] = useState(null);
  const [clinicSchedule, setClinicSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const weekdays = [
    { key: "sun", label: "Sunday" },
    { key: "mon", label: "Monday" },
    { key: "tue", label: "Tuesday" },
    { key: "wed", label: "Wednesday" },
    { key: "thu", label: "Thursday" },
    { key: "fri", label: "Friday" },
    { key: "sat", label: "Saturday" },
  ];

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      setError("");

      // Fetch clinic weekly schedule (accessible to dentists)
      const clinicRes = await api.get("/api/dentist/clinic-schedule");
      setClinicSchedule(clinicRes.data);

      // Fetch current dentist's schedule
      const dentistRes = await api.get("/api/dentist/my-schedule");
      setDentistSchedule(dentistRes.data);
    } catch (err) {
      console.error("Failed to fetch schedules", err);
      setError("Failed to load schedule information. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getDentistWorkingDays = () => {
    if (!dentistSchedule) return [];
    return weekdays.filter(day => dentistSchedule[day.key]);
  };

  const getClinicScheduleForDay = (weekdayIndex) => {
    return clinicSchedule.find(schedule => schedule.weekday === weekdayIndex);
  };

  const getDentistTimesForDay = (dayKey) => {
    if (!dentistSchedule) return null;
    const startTime = dentistSchedule[`${dayKey}_start_time`];
    const endTime = dentistSchedule[`${dayKey}_end_time`];
    if (startTime && endTime) {
      return {
        start: startTime,
        end: endTime
      };
    }
    return null;
  };

  const formatTime = (time) => {
    if (!time) return "Closed";
    return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading) {
    return <LoadingSpinner message="Loading schedule..." />;
  }

  if (error) {
    return (
      <div className="container-fluid px-4 py-4">
        <div className="alert alert-danger">
          <i className="bi bi-exclamation-triangle me-2"></i>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="dentist-schedule w-100">
      <div className="container-fluid px-4 py-4">
        <div className="row">
          <div className="col-12">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h2 className="h3 mb-0">📅 My Schedule</h2>
              <div className="text-muted">
                Dr. {user?.name || dentistSchedule?.dentist_name || dentistSchedule?.dentist_code || "Dentist"}
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          {/* Dentist Schedule */}
          <div className="col-lg-6 mb-4">
            <div className="card">
              <div className="card-header bg-primary text-white">
                <h5 className="mb-0">
                  <i className="bi bi-person-check me-2"></i>
                  My Working Days
                </h5>
              </div>
              <div className="card-body">
                {dentistSchedule ? (
                  <div>
                    <div className="mb-3">
                      <strong>Dentist Code:</strong> {dentistSchedule.dentist_code}
                    </div>
                    <div className="mb-3">
                      <strong>Employment Type:</strong> 
                      <span className={`badge ms-2 ${
                        dentistSchedule.employment_type === 'full_time' ? 'bg-success' :
                        dentistSchedule.employment_type === 'part_time' ? 'bg-warning' : 'bg-info'
                      }`}>
                        {dentistSchedule.employment_type.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="mb-3">
                      <strong>Status:</strong>
                      <span className={`badge ms-2 ${dentistSchedule.status === 'active' ? 'bg-success' : 'bg-secondary'}`}>
                        {dentistSchedule.status.toUpperCase()}
                      </span>
                    </div>
                    <hr />
                    <h6>My Schedule:</h6>
                    <div className="table-responsive">
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th>Status</th>
                            <th>Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weekdays.map(day => {
                            const isWorking = dentistSchedule[day.key];
                            const customTimes = getDentistTimesForDay(day.key);
                            return (
                              <tr key={day.key}>
                                <td><strong>{day.label}</strong></td>
                                <td>
                                  {isWorking ? (
                                    <span className="badge bg-success">Working</span>
                                  ) : (
                                    <span className="badge bg-secondary">Not working</span>
                                  )}
                                </td>
                                <td>
                                  {isWorking ? (
                                    customTimes ? (
                                      `${formatTime(customTimes.start)} - ${formatTime(customTimes.end)}`
                                    ) : (
                                      <span className="text-muted">
                                        <i className="bi bi-info-circle me-1"></i>
                                        Follows clinic hours
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-muted">
                    <i className="bi bi-info-circle me-2"></i>
                    No dentist schedule information available.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Clinic Schedule */}
          <div className="col-lg-6 mb-4">
            <div className="card">
              <div className="card-header bg-success text-white">
                <h5 className="mb-0">
                  <i className="bi bi-building me-2"></i>
                  Clinic Operating Hours
                </h5>
              </div>
              <div className="card-body">
                {clinicSchedule.length > 0 ? (
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Day</th>
                          <th>Status</th>
                          <th>Hours</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weekdays.map((day, index) => {
                          const clinicDay = getClinicScheduleForDay(index);
                          return (
                            <tr key={day.key}>
                              <td><strong>{day.label}</strong></td>
                              <td>
                                {clinicDay ? (
                                  clinicDay.is_open ? (
                                    <span className="badge bg-success">Open</span>
                                  ) : (
                                    <span className="badge bg-secondary">Closed</span>
                                  )
                                ) : (
                                  <span className="badge bg-secondary">Closed</span>
                                )}
                              </td>
                              <td>
                                {clinicDay && clinicDay.is_open ? (
                                  `${formatTime(clinicDay.open_time)} - ${formatTime(clinicDay.close_time)}`
                                ) : (
                                  "Closed"
                                )}
                              </td>
                              <td>
                                {clinicDay && clinicDay.note && (
                                  <small className="text-muted">{clinicDay.note}</small>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-muted">
                    <i className="bi bi-info-circle me-2"></i>
                    No clinic schedule information available.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="row">
          <div className="col-12">
            <div className="card">
              <div className="card-header bg-info text-white">
                <h5 className="mb-0">
                  <i className="bi bi-calendar-check me-2"></i>
                  Schedule Summary
                </h5>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6">
                    <h6>Your Working Days:</h6>
                    <p className="text-muted">
                      {dentistSchedule ? (
                        getDentistWorkingDays().length > 0 ? (
                          getDentistWorkingDays().map(day => day.label).join(", ")
                        ) : (
                          "No working days assigned"
                        )
                      ) : (
                        "Schedule information not available"
                      )}
                    </p>
                  </div>
                  <div className="col-md-6">
                    <h6>Clinic Status:</h6>
                    <p className="text-muted">
                      {clinicSchedule.filter(day => day.is_open).length > 0 ? (
                        `Open ${clinicSchedule.filter(day => day.is_open).length} days per week`
                      ) : (
                        "Clinic schedule not available"
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DentistSchedule;
