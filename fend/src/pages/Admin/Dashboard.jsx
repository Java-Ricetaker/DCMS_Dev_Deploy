import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { useAuth } from "../../hooks/useAuth";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ChartTitle,
  ChartTooltip,
  ChartLegend,
  ChartDataLabels
);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [todayVisits, setTodayVisits] = useState(0);
  const [pendingAppointments, setPendingAppointments] = useState(0);
  const [pendingVisits, setPendingVisits] = useState(0);
  const [remindersCount, setRemindersCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);
  
  // Daily report state
  const [dailyReportLoading, setDailyReportLoading] = useState(false);
  const [dailyReportError, setDailyReportError] = useState("");
  const [dailyReportData, setDailyReportData] = useState({ 
    by_hour: [], 
    by_service: [], 
    by_visit_type: [] 
  });

  // Get firstname from user name
  const firstname = user?.name?.split(' ')[0] || user?.name || 'Admin';

  const fetchStatistics = useCallback(async () => {
    setLoadingStats(true);
    try {
      // Fetch visit statistics from dedicated endpoint
      const visitsStatsRes = await api.get("/api/visits/stats");
      setTodayVisits(visitsStatsRes.data.today_visits || 0);
      setPendingVisits(visitsStatsRes.data.pending_visits || 0);

      // Fetch pending appointments
      const appointmentsRes = await api.get("/api/appointments?status=pending");
      setPendingAppointments(appointmentsRes.data.length || 0);

      // Fetch remindable appointments
      const remindersRes = await api.get("/api/appointments/remindable");
      setRemindersCount(remindersRes.data.length || 0);
    } catch (err) {
      console.error("Failed to load statistics", err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadDailyReport = useCallback(async () => {
    setDailyReportLoading(true);
    setDailyReportError("");
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const res = await api.get("/api/reports/visits-daily", { params: { date: today } });
      setDailyReportData(res.data || { by_hour: [], by_service: [], by_visit_type: [] });
    } catch (e) {
      console.error(e);
      setDailyReportError(e?.response?.data?.message || "Failed to load daily report.");
    } finally {
      setDailyReportLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatistics();
    loadDailyReport();
  }, [fetchStatistics, loadDailyReport]);

  // Process hourly data for chart
  const byHour = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < 24; i++) map.set(i, 0);
    (dailyReportData.by_hour || []).forEach((r) => {
      const h = Number(r.hour) || 0;
      map.set(h, (map.get(h) || 0) + (Number(r.count) || 0));
    });
    return Array.from(map.entries()).map(([h, count]) => ({ 
      label: String(h).padStart(2, "0"), 
      count 
    }));
  }, [dailyReportData.by_hour]);

  // Process service data for chart
  const byService = useMemo(() => {
    const result = (dailyReportData.by_service || []).map((r) => {
      const totalCount = Number(r.count) || 0;
      const walkinCount = Number(r.walkin || 0);
      const appointmentCount = Number(r.appointment || 0);
      
      // If walk-in/appointment breakdown is not available, estimate based on visit type data
      let walkin = walkinCount;
      let appointment = appointmentCount;
      
      if (walkinCount === 0 && appointmentCount === 0 && totalCount > 0) {
        const visitTypeData = dailyReportData.by_visit_type || [];
        const walkinTotal = visitTypeData.find(vt => vt.visit_type === 'walkin')?.count || 0;
        const appointmentTotal = visitTypeData.find(vt => vt.visit_type === 'appointment')?.count || 0;
        const totalTypeVisits = walkinTotal + appointmentTotal;
        
        if (totalTypeVisits > 0) {
          const walkinRatio = Number(walkinTotal) / totalTypeVisits;
          const appointmentRatio = Number(appointmentTotal) / totalTypeVisits;
          
          walkin = Math.round(totalCount * walkinRatio);
          appointment = Math.round(totalCount * appointmentRatio);
          
          // Ensure the sum equals totalCount
          const sum = walkin + appointment;
          if (sum !== totalCount) {
            appointment = totalCount - walkin;
          }
        } else {
          // Default split if no data available
          walkin = Math.round(totalCount * 0.6); // 60% walk-in
          appointment = totalCount - walkin;
        }
      }
      
      return { 
        label: r.service_name || "(Unspecified)", 
        count: totalCount,
        walkin,
        appointment
      };
    });
    
    return result;
  }, [dailyReportData.by_service, dailyReportData.by_visit_type]);

  // Chart data and options
  const defaultDatalabels = {
    color: "#fff",
    font: { weight: "bold" },
    formatter: (v) => (v > 0 ? v : ""),
  };

  const hourBarData = useMemo(() => ({
    labels: byHour.map((d) => d.label),
    datasets: [
      {
        label: "Visits (today)",
        data: byHour.map((d) => d.count),
        backgroundColor: "rgba(25,135,84,0.85)",
        borderColor: "#198754",
        borderWidth: 1,
        type: "bar",
      },
    ],
  }), [byHour]);

  const hourBarOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        display: true,
        labels: { font: { size: 11 } }
      },
      tooltip: { enabled: true },
      datalabels: {
        anchor: "end",
        align: "end",
        offset: 2,
        font: { size: 9 },
        ...defaultDatalabels,
      },
    },
    scales: {
      x: { 
        title: { display: true, text: "Hour of Day", font: { size: 12 } },
        ticks: { font: { size: 11 } }
      },
      y: { 
        title: { display: true, text: "Visits", font: { size: 12 } }, 
        beginAtZero: true, 
        ticks: { precision: 0, font: { size: 11 } }
      },
    },
  }), []);

  const serviceBarData = useMemo(() => ({
    labels: byService.map((d) => d.label),
    datasets: [
      {
        label: "Walk-in",
        data: byService.map((d) => d.walkin),
        backgroundColor: "#0d6efd",
        borderColor: "#0d6efd",
        borderWidth: 1,
      },
      {
        label: "Appointment",
        data: byService.map((d) => d.appointment),
        backgroundColor: "#6c757d",
        borderColor: "#6c757d",
        borderWidth: 1,
      },
    ],
  }), [byService]);

  const serviceBarOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        display: true,
        labels: { font: { size: 11 } }
      },
      tooltip: { enabled: true },
      datalabels: {
        anchor: "end",
        align: "end",
        offset: 2,
        font: { size: 9 },
        ...defaultDatalabels,
      },
    },
    scales: {
      x: {
        title: { display: true, text: "Service", font: { size: 12 } },
        ticks: { 
          autoSkip: false, 
          maxRotation: 60, 
          minRotation: 30,
          font: { size: 10 }
        },
      },
      y: { 
        title: { display: true, text: "Visits", font: { size: 12 } }, 
        beginAtZero: true, 
        ticks: { precision: 0, font: { size: 11 } }
      },
    },
  }), []);

  return (
    <div>
      {/* Welcome Header */}
      <h2 className="mb-4">Welcome, {firstname}!</h2>

      {/* Daily Stats Card Group */}
      <div className="mb-4">
        <h4 className="mb-3">Daily Stats</h4>
        <div className="row g-3 mb-4">
          {/* Today's Visits Card */}
          <div className="col-12 col-md-6 col-lg-3">
            <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '16px', cursor: 'pointer' }}
                 onClick={() => navigate('/admin/appointments')}>
              <div className="card-body p-4">
                <div className="d-flex align-items-center">
                  <div className="bg-primary rounded-circle me-3 d-flex align-items-center justify-content-center flex-shrink-0" 
                       style={{ width: '50px', height: '50px', fontSize: '1.5rem' }}>
                    <i className="bi bi-calendar-day text-white"></i>
                  </div>
                  <div className="flex-grow-1 min-width-0">
                    <div className="text-muted small fw-semibold">Today's Visits</div>
                    <div className="fs-3 fw-bold text-primary">
                      {loadingStats ? '...' : todayVisits}
                    </div>
                    <small className="text-muted">Running & Finished</small>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Appointments Card */}
          <div className="col-12 col-md-6 col-lg-3">
            <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '16px', cursor: 'pointer' }}
                 onClick={() => navigate('/admin/appointments')}>
              <div className="card-body p-4">
                <div className="d-flex align-items-center">
                  <div className="bg-warning rounded-circle me-3 d-flex align-items-center justify-content-center flex-shrink-0" 
                       style={{ width: '50px', height: '50px', fontSize: '1.5rem' }}>
                    <i className="bi bi-clock-history text-white"></i>
                  </div>
                  <div className="flex-grow-1 min-width-0">
                    <div className="text-muted small fw-semibold">Pending Appointments</div>
                    <div className="fs-3 fw-bold text-warning">
                      {loadingStats ? '...' : pendingAppointments}
                    </div>
                    <small className="text-muted">Needs approval</small>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Visits Card */}
          <div className="col-12 col-md-6 col-lg-3">
            <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '16px', cursor: 'pointer' }}
                 onClick={() => navigate('/admin/appointments')}>
              <div className="card-body p-4">
                <div className="d-flex align-items-center">
                  <div className="bg-info rounded-circle me-3 d-flex align-items-center justify-content-center flex-shrink-0" 
                       style={{ width: '50px', height: '50px', fontSize: '1.5rem' }}>
                    <i className="bi bi-hourglass-split text-white"></i>
                  </div>
                  <div className="flex-grow-1 min-width-0">
                    <div className="text-muted small fw-semibold">Pending Visits</div>
                    <div className="fs-3 fw-bold text-info">
                      {loadingStats ? '...' : pendingVisits}
                    </div>
                    <small className="text-muted">Awaiting completion</small>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Appointment Reminders Card */}
          <div className="col-12 col-md-6 col-lg-3">
            <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '16px', cursor: 'pointer' }}
                 onClick={() => navigate('/admin/appointments')}>
              <div className="card-body p-4">
                <div className="d-flex align-items-center">
                  <div className="bg-success rounded-circle me-3 d-flex align-items-center justify-content-center flex-shrink-0" 
                       style={{ width: '50px', height: '50px', fontSize: '1.5rem' }}>
                    <i className="bi bi-bell text-white"></i>
                  </div>
                  <div className="flex-grow-1 min-width-0">
                    <div className="text-muted small fw-semibold">Appointment Reminders</div>
                    <div className="fs-3 fw-bold text-success">
                      {loadingStats ? '...' : remindersCount}
                    </div>
                    <small className="text-muted">Needs to be sent</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Report Card Group */}
      <div className="mb-4">
        <h4 className="mb-3">Today's Report</h4>
        
        {dailyReportError && (
          <div className="alert alert-danger border-0 shadow-sm mb-4" style={{ borderRadius: '12px' }} role="alert">
            <i className="bi bi-exclamation-triangle me-2"></i>
            {dailyReportError}
          </div>
        )}

        {dailyReportLoading ? (
          <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="text-muted">Loading today's report...</p>
            </div>
          </div>
        ) : (
          <div className="row g-4">
            {/* Visits by Hour Chart */}
            <div className="col-12">
              <div className="card border-0 shadow-sm" style={{ borderRadius: '16px' }}>
                <div className="card-header bg-primary text-white border-0" style={{ borderRadius: '16px 16px 0 0' }}>
                  <h5 className="mb-0 fw-semibold">
                    <i className="bi bi-clock me-2"></i>
                    Visits by Hour
                  </h5>
                </div>
                <div className="card-body p-4">
                  <div style={{ height: "350px", position: "relative", width: "100%" }}>
                    <Bar data={hourBarData} options={hourBarOptions} />
                  </div>
                </div>
              </div>
            </div>

            {/* Visits by Service & Type Chart */}
            <div className="col-12">
              <div className="card border-0 shadow-sm" style={{ borderRadius: '16px' }}>
                <div className="card-header bg-success text-white border-0" style={{ borderRadius: '16px 16px 0 0' }}>
                  <h5 className="mb-0 fw-semibold">
                    <i className="bi bi-bar-chart me-2"></i>
                    Visits by Service & Type
                  </h5>
                </div>
                <div className="card-body p-4">
                  <div style={{ height: "350px", position: "relative", width: "100%" }}>
                    <Bar data={serviceBarData} options={serviceBarOptions} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
