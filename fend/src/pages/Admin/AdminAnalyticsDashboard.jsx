import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import ExcelJS from 'exceljs';
import { addClinicHeader } from "../../utils/pdfHeader";
import toast from "react-hot-toast";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  Filler,
} from "chart.js";
import { Line, Bar, Pie } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  ChartTitle,
  ChartTooltip,
  ChartLegend,
  Filler
);

export default function AdminAnalyticsDashboard() {
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [trendRange, setTrendRange] = useState(6);
  const [selectedMetric, setSelectedMetric] = useState('visits');
  const [loading, setLoading] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [trendData, setTrendData] = useState(null);
  
  // New state for revenue-specific controls
  const [revenueTimeframe, setRevenueTimeframe] = useState('monthly'); // 'monthly' or 'yearly'
  const [revenueStartDate, setRevenueStartDate] = useState('');
  const [revenueEndDate, setRevenueEndDate] = useState('');

  // Load main analytics data (KPIs, insights, etc.)
  const loadMainData = async () => {
    setLoading(true);
    setError("");
    try {
      const summaryRes = await api.get("/api/analytics/summary", {
        params: { period: month },
      });
      
      const summaryData = summaryRes.data || null;
      
      // Debug logging
      console.log("Analytics API Response:", summaryData);
      console.log("Has insights:", summaryData?.insights ? "Yes" : "No");
      console.log("Insights count:", summaryData?.insights?.length || 0);
      
      // Ensure insights is an array if it exists
      if (summaryData && summaryData.insights && !Array.isArray(summaryData.insights)) {
        console.warn("Insights data is not an array, converting...");
        summaryData.insights = [];
      }
      
      setData(summaryData);
    } catch (e) {
      console.error("Analytics loading error:", e);
      console.error("Error response:", e?.response?.data);
      setError(e?.response?.data?.message || e?.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  };

  // Load trend data only
  const loadTrendData = async () => {
    setTrendLoading(true);
    try {
      // Prepare trend parameters
      const trendParams = { months: trendRange };
      
      // Add revenue-specific parameters if revenue is selected
      if (selectedMetric === 'revenue') {
        if (revenueTimeframe === 'yearly') {
          trendParams.yearly = true;
        }
        if (revenueStartDate && revenueEndDate) {
          trendParams.start_date = revenueStartDate;
          trendParams.end_date = revenueEndDate;
        }
      }

      const trendRes = await api.get("/api/analytics/trend", {
        params: trendParams,
      });
      
      const trendData = trendRes.data || null;
      
      // Debug trend parameters
      console.log("Trend API Parameters:", trendParams);
      console.log("Selected Metric:", selectedMetric);
      console.log("Revenue Timeframe:", revenueTimeframe);
      console.log("Revenue Start Date:", revenueStartDate);
      console.log("Revenue End Date:", revenueEndDate);
      console.log("Revenue Controls Should Show:", selectedMetric === 'revenue');
      
      setTrendData(trendData);
    } catch (e) {
      console.error("Trend loading error:", e);
      console.error("Error response:", e?.response?.data);
      // Don't set error for trend data failures, just log them
    } finally {
      setTrendLoading(false);
    }
  };

  // Load both main data and trend data
  const load = async () => {
    await Promise.all([loadMainData(), loadTrendData()]);
  };

  // Load main data when month changes
  useEffect(() => {
    loadMainData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // Clear revenue-specific controls when switching to non-revenue metrics
  useEffect(() => {
    if (selectedMetric !== 'revenue') {
      console.log("Clearing revenue controls for metric:", selectedMetric);
      setRevenueTimeframe('monthly');
      setRevenueStartDate('');
      setRevenueEndDate('');
    }
  }, [selectedMetric]);

  // Load trend data when trend-related parameters change
  useEffect(() => {
    loadTrendData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendRange, selectedMetric, revenueTimeframe, revenueStartDate, revenueEndDate]);

  // Initial load
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Export functions
  const downloadPdf = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
      
      // Helper function to add section title
      const addSectionTitle = (doc, title, currentY) => {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 119, 182); // Brand color
        doc.text(title, 40, currentY);
        doc.setTextColor(0, 0, 0);
        return currentY + 15;
      };

      // Add clinic header
      let currentY = await addClinicHeader(doc, 20);
      
      // Add report title
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Analytics Dashboard Report', 40, currentY);
      currentY += 20;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Report Period: ${month}`, 40, currentY);
      currentY += 15;
      
      // Add current trend information
      if (trendData && trendData.labels && trendData.labels.length > 0) {
        const trendInfo = `Trend Analysis: ${selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)} over ${trendData.labels.length} periods`;
        doc.text(trendInfo, 40, currentY);
        currentY += 15;
        
        if (selectedMetric === 'revenue' && (revenueStartDate && revenueEndDate)) {
          const customRangeInfo = `Custom Date Range: ${revenueStartDate} to ${revenueEndDate}`;
          doc.text(customRangeInfo, 40, currentY);
          currentY += 15;
        }
        
        if (selectedMetric === 'revenue' && revenueTimeframe) {
          const timeframeInfo = `Time Period: ${revenueTimeframe.charAt(0).toUpperCase() + revenueTimeframe.slice(1)}`;
          doc.text(timeframeInfo, 40, currentY);
          currentY += 15;
        }
      }
      currentY += 15;

      // SECTION 1: KPI OVERVIEW
      currentY = addSectionTitle(doc, "Key Performance Indicators", currentY);
      
      const kpiData = [
        ["Metric", "Current", "Previous", "Change", "Trend"],
        ["Total Visits", String(k?.total_visits?.value ?? 0), String(k?.total_visits?.prev ?? 0), `${k?.total_visits?.pct_change ?? 0}%`, (k?.total_visits?.pct_change ?? 0) >= 0 ? "↗ Positive" : "↘ Negative"],
        ["Approved Appts", String(k?.approved_appointments?.value ?? 0), String(k?.approved_appointments?.prev ?? 0), `${k?.approved_appointments?.pct_change ?? 0}%`, (k?.approved_appointments?.pct_change ?? 0) >= 0 ? "↗ Positive" : "↘ Negative"],
        ["No-shows", String(k?.no_shows?.value ?? 0), String(k?.no_shows?.prev ?? 0), `${k?.no_shows?.pct_change ?? 0}%`, (k?.no_shows?.pct_change ?? 0) >= 0 ? "↗ Concern" : "↘ Better"],
        ["Avg Duration (min)", String(k?.avg_visit_duration_min?.value ?? 0), String(k?.avg_visit_duration_min?.prev ?? 0), `${k?.avg_visit_duration_min?.pct_change ?? 0}%`, (k?.avg_visit_duration_min?.pct_change ?? 0) >= 0 ? "↗ Longer" : "↘ Shorter"],
        ["Revenue", `₱${(k?.total_revenue?.value ?? 0).toLocaleString()}`, `₱${(k?.total_revenue?.prev ?? 0).toLocaleString()}`, `${k?.total_revenue?.pct_change ?? 0}%`, (k?.total_revenue?.pct_change ?? 0) >= 0 ? "↗ Growth" : "↘ Decline"]
      ];

      autoTable(doc, {
        startY: currentY,
        head: [kpiData[0]],
        body: kpiData.slice(1),
        theme: "striped",
        styles: {
          fontSize: 9,
          cellPadding: 4,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9
        },
        columnStyles: {
          0: { cellWidth: 100 }, // Metric
          1: { cellWidth: 80 },  // Current
          2: { cellWidth: 80 },  // Previous
          3: { cellWidth: 60 },  // Change
          4: { cellWidth: 70 }   // Trend
        }
      });

      // SECTION 2: PAYMENT METHOD SHARE
      currentY = addSectionTitle(doc, "Payment Method Distribution", (doc.lastAutoTable?.finalY || 100) + 20);
      
      const paymentData = [
        ["Payment Method", "Count", "Percentage"],
        ["Cash", String(k?.payment_method_share?.cash?.count ?? 0), `${k?.payment_method_share?.cash?.share_pct ?? 0}%`],
        ["HMO", String(k?.payment_method_share?.hmo?.count ?? 0), `${k?.payment_method_share?.hmo?.share_pct ?? 0}%`],
        ["Maya", String(k?.payment_method_share?.maya?.count ?? 0), `${k?.payment_method_share?.maya?.share_pct ?? 0}%`]
      ];

      autoTable(doc, {
        startY: currentY,
        head: [paymentData[0]],
        body: paymentData.slice(1),
        theme: "striped",
      });

      // SECTION 3: REVENUE BY SERVICE
      if (data?.top_revenue_services?.length > 0) {
        currentY = addSectionTitle(doc, "Revenue by Service", (doc.lastAutoTable?.finalY || 100) + 20);
        
        const serviceData = [
          ["Service", "Current Revenue", "Previous Revenue", "Change (%)"],
          ...data.top_revenue_services.map(service => [
            service.service_name,
            `₱${service.revenue.toLocaleString()}`,
            `₱${(service.prev_revenue || 0).toLocaleString()}`,
            `${service.pct_change || 0}%`
          ])
        ];

        autoTable(doc, {
          startY: currentY,
          head: [serviceData[0]],
          body: serviceData.slice(1),
          theme: "striped",
        });
      }

      // SECTION 4: MONTHLY TRENDS DATA
      if (trendData && trendData.labels && trendData.labels.length > 0) {
        currentY = addSectionTitle(doc, "Monthly Trends Analysis", (doc.lastAutoTable?.finalY || 100) + 20);
        
        // Add trend metadata
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Metric: ${selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)}`, 40, currentY);
        currentY += 12;
        
        if (selectedMetric === 'revenue') {
          doc.text(`Time Period: ${revenueTimeframe.charAt(0).toUpperCase() + revenueTimeframe.slice(1)}`, 40, currentY);
          currentY += 12;
          
          if (revenueStartDate && revenueEndDate) {
            doc.text(`Custom Range: ${revenueStartDate} to ${revenueEndDate}`, 40, currentY);
            currentY += 12;
          }
        }
        
        currentY += 5;
        
        // Create trend data table
        const trendTableData = [
          ["Period", "Visits", "Appointments", "Revenue", "Loss"],
          ...trendData.labels.map((label, index) => [
            label,
            String(trendData.visits?.[index] ?? 0),
            String(trendData.appointments?.[index] ?? 0),
            `₱${(trendData.revenue?.[index] ?? 0).toLocaleString()}`,
            `₱${(trendData.loss?.[index] ?? 0).toLocaleString()}`
          ])
        ];

        autoTable(doc, {
          startY: currentY,
          head: [trendTableData[0]],
          body: trendTableData.slice(1),
          theme: "striped",
          styles: {
            fontSize: 8,
          },
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: 255,
            fontStyle: 'bold'
          },
        });
      }

      doc.save(`analytics-report-${month}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF.");
    }
  };

  const downloadExcel = async () => {
    try {
      const { styleHeaderRow, styleDataRow, addWorksheetHeader, formatCurrency, formatPercentage, styleTotalRow } = await import("../../utils/excelStyling");
      const workbook = new ExcelJS.Workbook();
      
      // KPI Overview Sheet
      const kpiSheet = workbook.addWorksheet('KPI Overview');
      let startRow = addWorksheetHeader(kpiSheet, 'Analytics Dashboard Report', `Report Period: ${month}`);
      
      // Add header row
      const headerRow = kpiSheet.addRow(['Metric', 'Current Value', 'Previous Value', 'Change (%)', 'Trend Status']);
      styleHeaderRow(headerRow);
      
      // Add data rows
      const dataRows = [
        ['Total Visits', k?.total_visits?.value ?? 0, k?.total_visits?.prev ?? 0, (k?.total_visits?.pct_change ?? 0) / 100, (k?.total_visits?.pct_change ?? 0) >= 0 ? "Positive" : "Negative"],
        ['Approved Appointments', k?.approved_appointments?.value ?? 0, k?.approved_appointments?.prev ?? 0, (k?.approved_appointments?.pct_change ?? 0) / 100, (k?.approved_appointments?.pct_change ?? 0) >= 0 ? "Positive" : "Negative"],
        ['No-shows', k?.no_shows?.value ?? 0, k?.no_shows?.prev ?? 0, (k?.no_shows?.pct_change ?? 0) / 100, 
          (() => {
            const current = k?.no_shows?.value ?? 0;
            const previous = k?.no_shows?.prev ?? 0;
            const change = k?.no_shows?.pct_change ?? 0;
            if (current === 0 && previous === 0) return "Excellent";
            if (current === 0 && previous > 0) return "Excellent";
            if (previous === 0 && current > 0) return "Concerning";
            return change >= 0 ? "Concerning" : "Improving";
          })()
        ],
        ['Avg Visit Duration (min)', k?.avg_visit_duration_min?.value ?? 0, k?.avg_visit_duration_min?.prev ?? 0, (k?.avg_visit_duration_min?.pct_change ?? 0) / 100, (k?.avg_visit_duration_min?.pct_change ?? 0) >= 0 ? "Longer" : "Shorter"]
      ];
      
      dataRows.forEach((rowData, index) => {
        const row = kpiSheet.addRow(rowData);
        styleDataRow(row, index);
        // Format percentage column (index 3)
        formatPercentage(row.getCell(4));
      });
      
      // Format Total Revenue row
      const revenueRow = kpiSheet.addRow([
        'Total Revenue', 
        k?.total_revenue?.value ?? 0, 
        k?.total_revenue?.prev ?? 0, 
        (k?.total_revenue?.pct_change ?? 0) / 100, 
        (k?.total_revenue?.pct_change ?? 0) >= 0 ? "Growth" : "Decline"
      ]);
      styleTotalRow(revenueRow);
      formatCurrency(revenueRow.getCell(2));
      formatCurrency(revenueRow.getCell(3));
      formatPercentage(revenueRow.getCell(4));
      
      kpiSheet.columns = [
        { width: 25 },
        { width: 20 },
        { width: 20 },
        { width: 12 },
        { width: 15 }
      ];

      // Payment Method Share Sheet
      const paymentSheet = workbook.addWorksheet('Payment Methods');
      startRow = addWorksheetHeader(paymentSheet, 'Payment Method Analysis', `Report Period: ${month}`);
      
      const paymentHeaderRow = paymentSheet.addRow(['Payment Method', 'Count', 'Percentage']);
      styleHeaderRow(paymentHeaderRow);
      
      const paymentData = [
        ['Cash', k?.payment_method_share?.cash?.count ?? 0, (k?.payment_method_share?.cash?.share_pct ?? 0) / 100],
        ['HMO', k?.payment_method_share?.hmo?.count ?? 0, (k?.payment_method_share?.hmo?.share_pct ?? 0) / 100],
        ['Maya', k?.payment_method_share?.maya?.count ?? 0, (k?.payment_method_share?.maya?.share_pct ?? 0) / 100]
      ];
      
      paymentData.forEach((rowData, index) => {
        const row = paymentSheet.addRow(rowData);
        styleDataRow(row, index);
        formatPercentage(row.getCell(3));
      });
      
      paymentSheet.columns = [
        { width: 20 },
        { width: 12 },
        { width: 12 }
      ];

      // Revenue by Service Sheet
      if (data?.top_revenue_services?.length > 0) {
        const serviceSheet = workbook.addWorksheet('Revenue by Service');
        startRow = addWorksheetHeader(serviceSheet, 'Revenue by Service', `Report Period: ${month}`);
        
        const serviceHeaderRow = serviceSheet.addRow(['Service', 'Current Revenue', 'Previous Revenue', 'Change (%)']);
        styleHeaderRow(serviceHeaderRow);
        
        data.top_revenue_services.forEach((service, index) => {
          const row = serviceSheet.addRow([
            service.service_name,
            service.revenue || 0,
            service.prev_revenue || 0,
            (service.pct_change || 0) / 100
          ]);
          styleDataRow(row, index);
          formatCurrency(row.getCell(2));
          formatCurrency(row.getCell(3));
          formatPercentage(row.getCell(4));
        });
        
        serviceSheet.columns = [
          { width: 30 },
          { width: 20 },
          { width: 20 },
          { width: 12 }
        ];
      }

      // Monthly Trends Sheet
      if (trendData?.labels?.length > 0) {
        const trendSheet = workbook.addWorksheet('Trend Analysis');
        
        let subtitle = `Metric: ${selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)} | Time Range: ${trendData.labels.length} periods`;
        if (selectedMetric === 'revenue' && revenueTimeframe) {
          subtitle += ` | Period: ${revenueTimeframe.charAt(0).toUpperCase() + revenueTimeframe.slice(1)}`;
        }
        if (selectedMetric === 'revenue' && revenueStartDate && revenueEndDate) {
          subtitle += ` | Custom Range: ${revenueStartDate} to ${revenueEndDate}`;
        }
        
        startRow = addWorksheetHeader(trendSheet, 'Trend Analysis', subtitle);
        
        const trendHeaderRow = trendSheet.addRow(['Period', 'Visits', 'Appointments', 'Revenue', 'Loss']);
        styleHeaderRow(trendHeaderRow);
        
        trendData.labels.forEach((label, index) => {
          const row = trendSheet.addRow([
            label,
            trendData.visits?.[index] ?? 0,
            trendData.appointments?.[index] ?? 0,
            trendData.revenue?.[index] ?? 0,
            trendData.loss?.[index] ?? 0
          ]);
          styleDataRow(row, index);
          formatCurrency(row.getCell(4));
          formatCurrency(row.getCell(5));
        });
        
        trendSheet.columns = [
          { width: 20 },
          { width: 12 },
          { width: 15 },
          { width: 18 },
          { width: 18 }
        ];
      }

      // Save the file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analytics-report-${month}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate Excel file.");
    }
  };

  const k = data?.kpis || {};


  const payBar = useMemo(() => {
    const cash = k?.payment_method_share?.cash ?? {};
    const hmo = k?.payment_method_share?.hmo ?? {};
    const maya = k?.payment_method_share?.maya ?? {};
    return {
      labels: ["Cash", "HMO", "Maya"],
      datasets: [
        {
          label: "This Month",
          backgroundColor: [
            "rgba(34, 197, 94, 0.8)", // Green for Cash
            "rgba(139, 92, 246, 0.8)", // Purple for HMO
            "rgba(59, 130, 246, 0.8)", // Blue for Maya
          ],
          borderColor: [
            "rgba(34, 197, 94, 1)",
            "rgba(139, 92, 246, 1)",
            "rgba(59, 130, 246, 1)",
          ],
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
          data: [
            Number(cash.share_pct || 0),
            Number(hmo.share_pct || 0),
            Number(maya.share_pct || 0),
          ],
        },
      ],
    };
  }, [k]);

  const payBarOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "white",
          bodyColor: "white",
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            label: function (context) {
              return `${context.label}: ${context.parsed.y}%`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#6b7280",
            font: { size: 12, weight: "500" },
          },
        },
        y: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: "rgba(107, 114, 128, 0.1)",
            drawBorder: false,
          },
          ticks: {
            callback: (v) => `${v}%`,
            color: "#6b7280",
            font: { size: 12, weight: "500" },
          },
        },
      },
    }),
    []
  );

  // Individual Pie Chart Configurations
  const chartConfigs = useMemo(() => {
    const visits = k?.total_visits?.value || 0;
    const approved = k?.approved_appointments?.value || 0;
    const noShows = k?.no_shows?.value || 0;
    const avgDuration = k?.avg_visit_duration_min?.value || 0;
    const revenue = k?.total_revenue?.value || 0;
    const prevRevenue = k?.total_revenue?.prev || 0;

    return [
      {
        id: 'visits',
        title: 'Total Visits',
        icon: '👥',
        value: visits,
        prevValue: k?.total_visits?.prev || 0,
        change: k?.total_visits?.pct_change || 0,
        color: '#8B5CF6', // Violet
        glowColor: 'rgba(139, 92, 246, 0.4)',
        data: {
          labels: ['Current Month', 'Previous Month'],
          datasets: [{
            data: [visits, k?.total_visits?.prev || 0],
            backgroundColor: ['#8B5CF6', 'rgba(139, 92, 246, 0.3)'],
            borderColor: ['#8B5CF6', 'rgba(139, 92, 246, 0.5)'],
            borderWidth: 3,
            hoverBackgroundColor: ['#7C3AED', 'rgba(139, 92, 246, 0.4)'],
          }]
        },
        formatter: (val) => val.toString()
      },
      {
        id: 'approved',
        title: 'Approved Appointments',
        icon: '✅',
        value: approved,
        prevValue: k?.approved_appointments?.prev || 0,
        change: k?.approved_appointments?.pct_change || 0,
        color: '#0EA5E9', // Electric Blue
        glowColor: 'rgba(14, 165, 233, 0.4)',
        data: {
          labels: ['Current Month', 'Previous Month'],
          datasets: [{
            data: [approved, k?.approved_appointments?.prev || 0],
            backgroundColor: ['#0EA5E9', 'rgba(14, 165, 233, 0.3)'],
            borderColor: ['#0EA5E9', 'rgba(14, 165, 233, 0.5)'],
            borderWidth: 3,
            hoverBackgroundColor: ['#0284C7', 'rgba(14, 165, 233, 0.4)'],
          }]
        },
        formatter: (val) => val.toString()
      },
      {
        id: 'noshows',
        title: 'No-shows',
        icon: '❌',
        value: noShows,
        prevValue: k?.no_shows?.prev || 0,
        change: k?.no_shows?.pct_change || 0,
        color: '#FF6B6B', // Coral
        glowColor: 'rgba(255, 107, 107, 0.4)',
        data: {
          labels: ['Current Month', 'Previous Month'],
          datasets: [{
            data: [noShows, k?.no_shows?.prev || 0],
            backgroundColor: ['#FF6B6B', 'rgba(255, 107, 107, 0.3)'],
            borderColor: ['#FF6B6B', 'rgba(255, 107, 107, 0.5)'],
            borderWidth: 3,
            hoverBackgroundColor: ['#EF4444', 'rgba(255, 107, 107, 0.4)'],
          }]
        },
        formatter: (val) => val.toString()
      },
      {
        id: 'avgtime',
        title: 'Average Visit Time',
        icon: '⏱️',
        value: avgDuration,
        prevValue: k?.avg_visit_duration_min?.prev || 0,
        change: k?.avg_visit_duration_min?.pct_change || 0,
        color: '#84CC16', // Lime Green
        glowColor: 'rgba(132, 204, 22, 0.4)',
        data: {
          labels: ['Current Month', 'Previous Month'],
          datasets: [{
            data: [avgDuration, k?.avg_visit_duration_min?.prev || 0],
            backgroundColor: ['#84CC16', 'rgba(132, 204, 22, 0.3)'],
            borderColor: ['#84CC16', 'rgba(132, 204, 22, 0.5)'],
            borderWidth: 3,
            hoverBackgroundColor: ['#65A30D', 'rgba(132, 204, 22, 0.4)'],
          }]
        },
        formatter: (val) => `${val} min`
      }
    ];
  }, [k]);

  const createPieOptions = (config) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        align: 'center',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 15,
          font: { 
            size: 12, 
            weight: '600',
            family: "'Inter', 'Segoe UI', sans-serif"
          },
          color: '#374151',
          boxWidth: 12,
          boxHeight: 12,
          generateLabels: function(chart) {
            const data = chart.data;
            if (data.labels.length && data.datasets.length) {
              return data.labels.map((label, i) => {
                const dataset = data.datasets[0];
                const value = dataset.data[i];
                const backgroundColor = dataset.backgroundColor[i];
                
                return {
                  text: label,
                  fillStyle: backgroundColor,
                  strokeStyle: backgroundColor,
                  lineWidth: 0,
                  pointStyle: 'circle',
                  hidden: false,
                  index: i
                };
              });
            }
            return [];
          }
        },
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: config.color,
        borderWidth: 2,
        cornerRadius: 12,
        displayColors: true,
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 13, weight: '500' },
        padding: 12,
        callbacks: {
          label: function (context) {
            const value = context.parsed;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${context.label}: ${config.formatter(value)} (${percentage}%)`;
          },
        },
      },
    },
    elements: {
      arc: {
        borderWidth: 0,
      },
    },
    interaction: {
      intersect: false,
      mode: 'nearest',
    },
    animation: {
      animateRotate: true,
      animateScale: true,
      duration: 1200,
      easing: 'easeOutQuart',
    },
  });

  const kpiInsights = useMemo(() => {
    if (!data) return null;
    const arrowPct = (x) =>
      x > 0 ? `▲ ${x}%` : x < 0 ? `▼ ${Math.abs(x)}%` : "—";
    return {
      visits: `Change vs last month: ${arrowPct(
        k?.total_visits?.pct_change || 0
      )}`,
      approved: `Change vs last month: ${arrowPct(
        k?.approved_appointments?.pct_change || 0
      )}`,
      noShows: `Change vs last month: ${arrowPct(
        k?.no_shows?.pct_change || 0
      )}`,
      avgDuration: `Change vs last month: ${arrowPct(
        k?.avg_visit_duration_min?.pct_change || 0
      )}`,
    };
  }, [data, k]);

  const paymentInsight = useMemo(() => {
    const cash = k?.payment_method_share?.cash?.share_pct ?? 0;
    const hmo = k?.payment_method_share?.hmo?.share_pct ?? 0;
    const maya = k?.payment_method_share?.maya?.share_pct ?? 0;
    const trendCash = k?.payment_method_share?.cash?.pct_point_change ?? 0;
    const trendHmo = k?.payment_method_share?.hmo?.pct_point_change ?? 0;
    const trendMaya = k?.payment_method_share?.maya?.pct_point_change ?? 0;

    if (cash === 0 && hmo === 0 && maya === 0) return null;

    return (
      `Cash: ${cash}% (${trendCash >= 0 ? "▲" : "▼"}${Math.abs(trendCash)}), ` +
      `HMO: ${hmo}% (${trendHmo >= 0 ? "▲" : "▼"}${Math.abs(trendHmo)}), ` +
      `Maya: ${maya}% (${trendMaya >= 0 ? "▲" : "▼"}${Math.abs(trendMaya)}). ` +
      (maya > 40
        ? "Tip: Strong digital payment adoption. Monitor Maya transaction fees."
        : hmo > 50
        ? "Tip: Monitor insurer approval times and patient satisfaction with HMO processes."
        : "Tip: Payment preferences vary by patient demographics and insurance coverage.")
    );
  }, [k]);

  const followUpInsight = useMemo(() => {
    const rate = k?.patient_follow_up_rate?.value ?? 0;
    const change = k?.patient_follow_up_rate?.pct_change ?? 0;
    const total = k?.patient_follow_up_rate?.total_first_time_patients ?? 0;
    const returned = k?.patient_follow_up_rate?.returned_patients ?? 0;
    
    if (total === 0) return null;
    
    return `Follow-up rate: ${rate}% (${returned}/${total} patients returned within 3-4 months). ` +
      `Change: ${change >= 0 ? '▲' : '▼'}${Math.abs(change)}%. ` +
      (rate >= 50 ? 'Excellent retention! This indicates strong patient satisfaction.' : 
       rate >= 30 ? 'Good retention. Consider strategies to improve further.' : 
       'Consider implementing follow-up calls, appointment reminders, or patient satisfaction surveys.');
  }, [k]);

  const topServiceInsight = useMemo(() => {
    const s = (data?.top_services || [])[0];
    if (!s) return null;
    const change = s.pct_change ?? 0;
    return (
      `Top service: ${s.service_name} (Δ ${change >= 0 ? "▲" : "▼"}${Math.abs(
        change
      )}% vs last month). ` +
      `Tip: Align stock/staffing; promote under-performers.`
    );
  }, [data]);

  const pct = (v) =>
    typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%` : "0%";

  // Month helpers
  const toMonthName = (ym /* 'YYYY-MM' */) => {
    const [y, m] = (ym || "").split("-").map(Number);
    if (!y || !m) return "";
    return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
  };
  const prevMonthOf = (ym /* 'YYYY-MM' */) => {
    const [y, m] = (ym || "").split("-").map(Number);
    if (!y || !m) return ym;
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const lastMonthLabel = toMonthName(prevMonthOf(month));
  const thisMonthLabel = toMonthName(month);

  const fmtUnit = (unit, v) => {
    const n = Number(v || 0);
    if (unit === "money") return `₱${n.toLocaleString()}`;
    if (unit === "minutes") return `${n} min`;
    return `${n}`; // count
  };

  // Helper to compute previous month values
  function derivePrev(current, pct) {
    if (current == null) return 0;
    if (pct === -100 && current === 0) return 0;
    const denom = 1 + ((pct ?? 0) / 100);
    return denom === 0 ? 0 : Number((current / denom).toFixed(2));
  }

  const tv = k?.total_visits;
  const aa = k?.approved_appointments;
  const ns = k?.no_shows;
  const av = k?.avg_visit_duration_min;
  const tr = k?.total_revenue;

  const prev = {
    visits: tv?.prev ?? derivePrev(tv?.value, tv?.pct_change),
    approved: aa?.prev ?? derivePrev(aa?.value, aa?.pct_change),
    noShows: ns?.prev ?? derivePrev(ns?.value, ns?.pct_change),
    avgDur: av?.prev ?? derivePrev(av?.value, av?.pct_change),
    revenue: tr?.prev ?? derivePrev(tr?.value, tr?.pct_change),
  };

  // Mini 2-bar chart generator
  const miniCompareData = (lastVal = 0, thisVal = 0, colors = { last:"#9ca3af", curr:"#3b82f6" }) => ({
    labels: ["Last", "This"],
    datasets: [
      {
        label: "Last Month",
        data: [lastVal, null],
        backgroundColor: colors.last,
        borderRadius: 6,
        barThickness: 10,
        categoryPercentage: 0.6,
        borderSkipped: false,
      },
      {
        label: "This Month",
        data: [null, thisVal],
        backgroundColor: colors.curr,
        borderRadius: 6,
        barThickness: 10,
        categoryPercentage: 0.6,
        borderSkipped: false,
      }
    ]
  });

  const baseMiniOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      x: { display: false, grid: { display: false } },
      y: { display: false, grid: { display: false }, beginAtZero: true }
    }
  };

  const buildMiniOptions = (unit, lastLbl, thisLbl) => ({
    ...baseMiniOptions,
    plugins: {
      ...baseMiniOptions.plugins,
      tooltip: {
        ...baseMiniOptions.plugins.tooltip,
        callbacks: {
          label: (ctx) => {
            const isLast = ctx.dataIndex === 0;
            const label = isLast ? lastLbl : thisLbl;
            const val = ctx.raw ?? 0;
            return `${label}: ${fmtUnit(unit, val)}`;
          }
        }
      }
    }
  });


  // Trend Chart Data
  const trendChartData = useMemo(() => {
    if (!trendData) return null;
    
    const metricConfig = {
      visits: {
        label: "Visits",
        data: trendData.visits,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        yAxisID: "y"
      },
      appointments: {
        label: "Appointments", 
        data: trendData.appointments,
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        yAxisID: "y"
      },
      revenue: {
        label: "Revenue",
        data: trendData.revenue,
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.1)",
        yAxisID: "y1"
      },
      loss: {
        label: "Loss",
        data: trendData.loss || [],
        borderColor: "#ef4444",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        yAxisID: "y1"
      }
    };
    
    const selected = metricConfig[selectedMetric];
    if (!selected) return null;
    
    return {
      labels: trendData.labels,
      datasets: [{
        label: selected.label,
        data: selected.data,
        borderColor: selected.borderColor,
        backgroundColor: selected.backgroundColor,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        fill: false,
        yAxisID: selected.yAxisID,
      }],
    };
  }, [trendData, selectedMetric]);

  const trendChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            usePointStyle: true,
            padding: 20,
            font: { size: 12, weight: "500" },
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "white",
          bodyColor: "white",
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: true,
          callbacks: {
            label: function (context) {
              const label = context.dataset.label;
              const value = context.parsed.y;
              if (label === "Revenue") {
                return `${label}: ₱${value.toLocaleString()}`;
              } else if (label === "Loss") {
                return `${label}: ₱${value.toLocaleString()}`;
              }
              return `${label}: ${value}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#6b7280",
            font: { size: 12, weight: "500" },
          },
        },
        y: {
          type: "linear",
          display: true,
          position: "left",
          beginAtZero: true,
          grid: {
            color: "rgba(107, 114, 128, 0.1)",
            drawBorder: false,
          },
          ticks: {
            color: "#6b7280",
            font: { size: 12, weight: "500" },
          },
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          beginAtZero: true,
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            color: "#6b7280",
            font: { size: 12, weight: "500" },
            callback: function (value) {
              return `₱${value.toLocaleString()}`;
            },
          },
        },
      },
    }),
    []
  );

  const formatMoney = (n) => {
    const num = Number(n || 0);
    return `₱${num.toLocaleString()}`;
  };

  const kpiCard = (title, value, change, icon, color, prevValue, opts = {}) => {
    const numericValue = Number(String(value).replace(/[^\d.-]/g, "")) || 0;
    const numericPrev  = Number(prevValue || 0);

    return (
      <div className="card h-100 border-0 shadow-sm"
           style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #e5e7eb" }}>
        <div className="card-body p-3 p-lg-4">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <div className="text-muted small fw-medium text-uppercase" style={{ letterSpacing: ".4px", fontSize: "0.7rem" }}>
              {title}
            </div>
            <div className="fs-5" style={{ color: color || "#6b7280" }}>{icon}</div>
          </div>

          <div className="fw-bold mb-1" style={{ fontSize: opts.money ? "clamp(1.2rem, 1.5vw + 0.8rem, 1.6rem)" : "clamp(1.5rem, 1.8vw + 1rem, 2rem)", color: "#111827", lineHeight: 1.1, wordBreak: "break-word" }}>
            {opts.money ? formatMoney(numericValue) : value ?? 0}
          </div>

          <div className={"small fw-semibold " + ((change ?? 0) >= 0 ? "text-success" : "text-danger")} style={{ marginBottom: "8px" }}>
            {(change ?? 0) >= 0 ? "↗" : "↘"} {typeof change === "number" ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%` : "0%"} vs last month
          </div>

          {/* Legend */}
          <div className="d-flex align-items-center gap-3 mt-1 mb-1 small text-muted">
            <span className="d-inline-flex align-items-center">
              <span style={{width:8,height:8,background:'#9ca3af',borderRadius:999,display:'inline-block',marginRight:6}}></span>
              Last month
            </span>
            <span className="d-inline-flex align-items-center">
              <span style={{width:8,height:8,background:color,borderRadius:999,display:'inline-block',marginRight:6}}></span>
              This month
            </span>
          </div>

          {/* Mini Last vs This */}
          <div style={{ height: 60, marginTop: 2 }}>
            <Bar
              data={miniCompareData(numericPrev, numericValue, { last:"#9ca3af", curr: color })}
              options={buildMiniOptions(opts.unit || "count", lastMonthLabel, thisMonthLabel)}
            />
          </div>

          {/* Month labels with values */}
          <div className="d-flex justify-content-between mt-1">
            <small className="text-muted">
              {lastMonthLabel}: {fmtUnit(opts.unit || "count", numericPrev)}
            </small>
            <small className="text-muted">
              {thisMonthLabel}: {fmtUnit(opts.unit || "count", numericValue)}
            </small>
          </div>

          {/* Absolute delta */}
          {(() => {
            const delta = numericValue - numericPrev;
            const up = delta >= 0;
            return (
              <div className={`small ${up ? "text-success" : "text-danger"}`}>
                Δ {opts.unit==="money" ? fmtUnit("money", Math.abs(delta)) : fmtUnit(opts.unit || "count", Math.abs(delta))} {up ? "higher" : "lower"} than last
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  return (
    <>
      <div 
        className="analytics-dashboard-page"
        style={{ 
          minHeight: "100vh", 
          width: '100vw',
          position: 'relative',
          left: 0,
          right: 0,
          padding: '1.5rem 2rem',
          boxSizing: 'border-box',
          background: "linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 50%, #CBD5E1 100%)",
          color: "#1E293B"
        }}
      >
        <div className="container-xl">
        <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center mb-5 gap-3">
          <div>
            <h2 className="m-0 fw-bold" style={{ color: "#1E293B", fontSize: "2.5rem", textShadow: "0 2px 4px rgba(0, 0, 0, 0.1)" }}>
              📊 Analytics Dashboard
            </h2>
            <p className="mb-0 mt-2" style={{ color: "#64748B", fontSize: "1.1rem" }}>
              Real-time insights and performance metrics for your clinic
            </p>
          </div>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <input
              type="month"
              className="form-control form-control-sm border-0"
              style={{
                width: 180,
                borderRadius: "16px",
                padding: "14px 18px",
                fontSize: "14px",
                fontWeight: "600",
                background: "rgba(255, 255, 255, 0.9)",
                color: "#1E293B",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
              }}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Select month"
            />
            <button
              className="btn border-0"
              onClick={loadMainData}
              disabled={loading}
              style={{
                background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
                color: "white",
                borderRadius: "16px",
                padding: "14px 28px",
                fontWeight: "700",
                fontSize: "14px",
                boxShadow: "0 8px 25px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                transition: "all 0.3s ease",
                transform: loading ? "scale(0.95)" : "scale(1)",
              }}
            >
              {loading ? "⟳" : "🔄"} {loading ? "Loading..." : "Refresh Data"}
            </button>
            <div className="dropdown">
              <button
                className="btn dropdown-toggle border-0"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                style={{
                  background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
                  color: "white",
                  borderRadius: "16px",
                  padding: "14px 20px",
                  fontWeight: "700",
                  fontSize: "14px",
                  boxShadow: "0 8px 25px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                }}
              >
                📊 Export Data
              </button>
              <ul className="dropdown-menu" style={{
                background: "rgba(255, 255, 255, 0.95)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: "12px",
                boxShadow: "0 10px 40px rgba(0, 0, 0, 0.15)",
              }}>
                <li>
                  <button
                    className="dropdown-item"
                    onClick={downloadPdf}
                    disabled={loading}
                    style={{
                      color: "#1E293B",
                      padding: "12px 20px",
                      borderRadius: "8px",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => e.target.style.background = "rgba(59, 130, 246, 0.1)"}
                    onMouseLeave={(e) => e.target.style.background = "transparent"}
                  >
                    📄 Download PDF Report
                  </button>
                </li>
                <li>
                  <button
                    className="dropdown-item"
                    onClick={downloadExcel}
                    disabled={loading}
                    style={{
                      color: "#1E293B",
                      padding: "12px 20px",
                      borderRadius: "8px",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => e.target.style.background = "rgba(16, 185, 129, 0.1)"}
                    onMouseLeave={(e) => e.target.style.background = "transparent"}
                  >
                    📊 Export Excel Data
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {error && (
          <div
            className="alert border-0 mb-4"
            role="alert"
            style={{ 
              borderRadius: "20px",
              background: "linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(254, 226, 226, 0.8) 100%)",
              border: "2px solid rgba(239, 68, 68, 0.2)",
              boxShadow: "0 10px 30px rgba(239, 68, 68, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
              backdropFilter: "blur(10px)",
              color: "#DC2626"
            }}
          >
            <div className="d-flex align-items-center">
              <div
                className="me-3 d-flex align-items-center justify-content-center"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)",
                  boxShadow: "0 6px 15px rgba(239, 68, 68, 0.3)",
                  fontSize: "18px"
                }}
              >
                ⚠️
              </div>
              <div>
                <div className="fw-bold mb-1" style={{ color: "#B91C1C" }}>System Alert</div>
                <div style={{ color: "#DC2626" }}>{error}</div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div
            className="d-flex justify-content-center align-items-center"
            style={{ minHeight: "500px" }}
          >
            <div className="text-center">
              <div className="position-relative mb-4">
                <div
                  className="spinner-border"
                  role="status"
                  style={{
                    width: "4rem",
                    height: "4rem",
                    borderWidth: "4px",
                    borderColor: "transparent",
                    borderTopColor: "#3B82F6",
                    borderRightColor: "#8B5CF6",
                    borderBottomColor: "#14B8A6",
                    borderLeftColor: "#F97316",
                    animation: "spin 1.5s linear infinite",
                    filter: "drop-shadow(0 4px 8px rgba(59, 130, 246, 0.3))"
                  }}
                >
                  <span className="visually-hidden">Loading...</span>
                </div>
                <div
                  className="position-absolute top-50 start-50 translate-middle"
                  style={{
                    fontSize: "1.5rem",
                    animation: "pulse 2s ease-in-out infinite"
                  }}
                >
                  📊
                </div>
              </div>
              <h5 className="fw-bold mb-2" style={{ color: "#1E293B", textShadow: "0 2px 4px rgba(0, 0, 0, 0.1)" }}>
                Analyzing Data...
              </h5>
              <p style={{ color: "#64748B", fontSize: "1rem" }}>
                Processing clinic analytics and generating insights
              </p>
              <div className="d-flex justify-content-center gap-2 mt-3">
                <div className="bg-primary rounded-circle" style={{ width: "8px", height: "8px", animation: "bounce 1.4s ease-in-out infinite" }}></div>
                <div className="bg-info rounded-circle" style={{ width: "8px", height: "8px", animation: "bounce 1.4s ease-in-out 0.2s infinite" }}></div>
                <div className="bg-success rounded-circle" style={{ width: "8px", height: "8px", animation: "bounce 1.4s ease-in-out 0.4s infinite" }}></div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Modern Light Theme KPI Grid */}
            <div className="row g-4 mb-5">
              {chartConfigs.map((config, index) => (
                <div key={config.id} className="col-12 col-sm-6 col-lg-3 col-xl-3">
                  <div
                    className="card h-100 border-0"
                    style={{
                      background: "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)",
                      borderRadius: "24px",
                      border: `2px solid ${config.color}20`,
                      boxShadow: `
                        0 20px 40px rgba(0, 0, 0, 0.1),
                        0 0 0 1px rgba(255, 255, 255, 0.8),
                        inset 0 1px 0 rgba(255, 255, 255, 0.9),
                        0 0 30px ${config.color}15
                      `,
                      backdropFilter: "blur(20px)",
                      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                      transform: "translateY(0px)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-8px)";
                      e.currentTarget.style.boxShadow = `
                        0 30px 60px rgba(0, 0, 0, 0.15),
                        0 0 0 1px rgba(255, 255, 255, 0.9),
                        inset 0 1px 0 rgba(255, 255, 255, 1),
                        0 0 40px ${config.color}25
                      `;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0px)";
                      e.currentTarget.style.boxShadow = `
                        0 20px 40px rgba(0, 0, 0, 0.1),
                        0 0 0 1px rgba(255, 255, 255, 0.8),
                        inset 0 1px 0 rgba(255, 255, 255, 0.9),
                        0 0 30px ${config.color}15
                      `;
                    }}
                  >
                    <div className="card-header border-0 bg-transparent pt-4 pb-2">
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="d-flex align-items-center">
                          <div
                            className="me-3 d-flex align-items-center justify-content-center"
                            style={{
                              width: "48px",
                              height: "48px",
                              borderRadius: "16px",
                              background: `linear-gradient(135deg, ${config.color} 0%, ${config.color}CC 100%)`,
                              boxShadow: `0 8px 20px ${config.color}30, inset 0 1px 0 rgba(255, 255, 255, 0.3)`,
                              fontSize: "20px",
                            }}
                          >
                            {config.icon}
                          </div>
                          <div>
                            <h6
                              className="mb-0 fw-bold"
                              style={{
                                color: "#1E293B",
                                fontSize: "1rem",
                                textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
                              }}
                            >
                              {config.title}
                            </h6>
                            <small style={{ color: "#64748B", fontSize: "0.8rem" }}>
                              {toMonthName(month)}
                            </small>
                          </div>
                        </div>
                        <div
                          className="px-3 py-1 rounded-pill"
                          style={{
                            background: config.change >= 0 
                              ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
                              : "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)",
                            fontSize: "0.75rem",
                            fontWeight: "700",
                            color: "white",
                            boxShadow: config.change >= 0 
                              ? "0 4px 12px rgba(16, 185, 129, 0.3)"
                              : "0 4px 12px rgba(239, 68, 68, 0.3)",
                          }}
                        >
                          {config.change >= 0 ? "↗" : "↘"} {Math.abs(config.change).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    
                    <div className="card-body pt-2 pb-4">
                      {/* Main Value Display */}
                      <div className="text-center mb-3">
                        <div
                          className="fw-bold mb-1"
                          style={{
                            fontSize: "2.2rem",
                            color: config.color,
                            textShadow: `0 2px 4px ${config.color}30`,
                            lineHeight: "1.1",
                          }}
                        >
                          {config.formatter(config.value)}
                        </div>
                        <div style={{ color: "#64748B", fontSize: "0.85rem" }}>
                          Previous: {config.formatter(config.prevValue)}
                        </div>
                      </div>

                      {/* Pie Chart */}
                      <div style={{ height: "250px", position: "relative" }}>
                        <Pie data={config.data} options={createPieOptions(config)} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>


            <div className="row g-4">
              <div className="col-12 col-lg-6">
                <div
                  className="card h-100 border-0"
                  style={{
                    background: "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)",
                    borderRadius: "24px",
                    border: "2px solid rgba(14, 165, 233, 0.2)",
                    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 0 30px rgba(14, 165, 233, 0.15)",
                    backdropFilter: "blur(20px)",
                  }}
                >
                  <div className="card-header border-0 bg-transparent py-4">
                    <h5
                      className="mb-0 fw-bold d-flex align-items-center"
                      style={{ color: "#1E293B", textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)" }}
                    >
                      <span className="me-3" style={{ fontSize: "1.5rem" }}>💳</span>
                      Payment Method Share
                    </h5>
                  </div>
                  <div className="card-body pt-0">
                    <div className="px-1 px-md-2" style={{ height: "300px" }}>
                      <Bar data={payBar} options={payBarOptions} />
                    </div>
                    <div
                      className="mt-3 p-3 rounded-3"
                      style={{ backgroundColor: "rgba(59, 130, 246, 0.05)" }}
                    >
                      <div className="small text-muted mb-2 fw-medium">
                        Monthly Changes:
                      </div>
                      <div className="d-flex justify-content-between">
                        <span className="small">
                          <span className="fw-medium">Cash:</span>
                          <span
                            className={
                              (k?.payment_method_share?.cash
                                ?.pct_point_change ?? 0) >= 0
                                ? "text-success"
                                : "text-danger"
                            }
                          >
                            {pct(
                              k?.payment_method_share?.cash?.pct_point_change ||
                                0
                            )}
                          </span>
                        </span>
                        <span className="small">
                          <span className="fw-medium">HMO:</span>
                          <span
                            className={
                              (k?.payment_method_share?.hmo?.pct_point_change ??
                                0) >= 0
                                ? "text-success"
                                : "text-danger"
                            }
                          >
                            {pct(
                              k?.payment_method_share?.hmo?.pct_point_change ||
                                0
                            )}
                          </span>
                        </span>
                        <span className="small">
                          <span className="fw-medium">Maya:</span>
                          <span
                            className={
                              (k?.payment_method_share?.maya
                                ?.pct_point_change ?? 0) >= 0
                                ? "text-success"
                                : "text-danger"
                            }
                          >
                            {pct(
                              k?.payment_method_share?.maya?.pct_point_change ||
                                0
                            )}
                          </span>
                        </span>
                      </div>
                    </div>
                    {paymentInsight && (
                      <div
                        className="mt-3 p-3 rounded-3"
                        style={{ backgroundColor: "rgba(16, 185, 129, 0.05)" }}
                      >
                        <small className="text-muted">{paymentInsight}</small>
                      </div>
                    )}
                    {followUpInsight && (
                      <div
                        className="mt-3 p-3 rounded-3"
                        style={{ backgroundColor: "rgba(139, 92, 246, 0.05)" }}
                      >
                        <small className="text-muted">{followUpInsight}</small>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-12 col-lg-6">
                <div
                  className="card h-100 border-0 shadow-sm"
                  style={{
                    background:
                      "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                    borderRadius: "16px",
                  }}
                >
                  <div className="card-header border-0 bg-transparent py-4">
                    <h5
                      className="mb-0 fw-bold d-flex align-items-center"
                      style={{ color: "#1e293b" }}
                    >
                      <span className="me-2">💰</span>
                      Revenue by Service
                    </h5>
                  </div>
                  <div className="card-body pt-0">
                    <div className="list-group list-group-flush">
                      {(data?.top_revenue_services || []).map((s, index) => (
                        <div
                          key={`${s.service_id}-${s.service_name}`}
                          className="list-group-item border-0 px-0 py-3 d-flex justify-content-between align-items-center"
                          style={{
                            borderBottom:
                              index < (data?.top_revenue_services || []).length - 1
                                ? "1px solid rgba(0,0,0,0.05)"
                                : "none",
                          }}
                        >
                          <div className="d-flex align-items-center">
                            <div
                              className="me-3 d-flex align-items-center justify-content-center rounded-circle"
                              style={{
                                width: "32px",
                                height: "32px",
                                backgroundColor:
                                  index === 0
                                    ? "#fbbf24"
                                    : index === 1
                                    ? "#9ca3af"
                                    : index === 2
                                    ? "#f59e0b"
                                    : "#e5e7eb",
                                color: "white",
                                fontSize: "14px",
                                fontWeight: "bold",
                              }}
                            >
                              {index + 1}
                            </div>
                            <span
                              className="fw-medium"
                              style={{ color: "#374151" }}
                            >
                              {s.service_name}
                            </span>
                          </div>
                          <div className="d-flex align-items-center">
                            <strong
                              className="me-3 fs-6"
                              style={{ color: "#1f2937" }}
                            >
                              ₱{s.revenue.toLocaleString()}
                            </strong>
                            <span
                              className={`badge ${
                                (s.pct_change ?? 0) >= 0
                                  ? "bg-success"
                                  : "bg-danger"
                              } px-2 py-1`}
                              style={{ fontSize: "0.75rem" }}
                            >
                              {(s.pct_change ?? 0) >= 0 ? "↗" : "↘"}{" "}
                              {Math.abs(s.pct_change ?? 0).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                      {(data?.top_revenue_services || []).length === 0 && (
                        <div className="text-center py-4 text-muted">
                          <span className="fs-4">💰</span>
                          <p className="mt-2 mb-0">No revenue data available</p>
                        </div>
                      )}
                    </div>
                    <div
                      className="mt-3 p-3 rounded-3"
                      style={{ backgroundColor: "rgba(16, 185, 129, 0.05)" }}
                    >
                      <div className="small text-muted mb-2 fw-medium">
                        Total Revenue This Month:
                      </div>
                      <div className="fs-4 fw-bold text-success">
                        ₱{(k?.total_revenue?.value ?? 0).toLocaleString()}
                      </div>
                      <div className="small text-muted">
                        {k?.total_revenue?.pct_change >= 0 ? "↗" : "↘"}{" "}
                        {Math.abs(k?.total_revenue?.pct_change ?? 0).toFixed(1)}% vs last month
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Trend Chart Section */}
            {trendChartData && (
              <div className="row g-2 g-md-3 g-lg-4 mb-4">
                <div className="col-12">
                  <div
                    className="card h-100 border-0 shadow-sm"
                    style={{
                      background:
                        "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                      borderRadius: "16px",
                    }}
                  >
                    <div className="card-header border-0 bg-transparent py-4">
                      <div className="d-flex justify-content-between align-items-center">
                        <h5
                          className="mb-0 fw-bold d-flex align-items-center"
                          style={{ color: "#1e293b" }}
                        >
                          <span className="me-2">📈</span>
                          {selectedMetric === 'revenue' && (revenueStartDate && revenueEndDate) ? 'Revenue Trends' : 'Monthly Trends'}
                          {trendLoading && (
                            <span className="ms-2 spinner-border spinner-border-sm text-primary" role="status">
                              <span className="visually-hidden">Loading...</span>
                            </span>
                          )}
                        </h5>
                        <div className="d-flex gap-2 flex-wrap">
                          <select 
                            value={selectedMetric} 
                            onChange={(e) => setSelectedMetric(e.target.value)} 
                            className="form-select form-select-sm" 
                            style={{ width: 140 }}
                          >
                            <option value="visits">Visits</option>
                            <option value="appointments">Appointments</option>
                            <option value="revenue">Revenue</option>
                            <option value="loss">Loss</option>
                          </select>
                          <select 
                            value={trendRange} 
                            onChange={(e) => setTrendRange(Number(e.target.value))} 
                            className="form-select form-select-sm" 
                            style={{ width: 140 }}
                          >
                            <option value={6}>Last 6 months</option>
                            <option value={12}>Last 1 year</option>
                            <option value={24}>Last 2 years</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    
                    {/* Revenue-specific controls */}
                    {selectedMetric === 'revenue' && (
                      <div className="card-body pt-0 pb-3 border-top">
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label small fw-medium text-muted">Time Period:</label>
                            <div className="d-flex gap-3">
                              <div className="form-check">
                                <input
                                  className="form-check-input"
                                  type="radio"
                                  name="revenueTimeframe"
                                  id="revenueMonthly"
                                  value="monthly"
                                  checked={revenueTimeframe === 'monthly'}
                                  onChange={(e) => setRevenueTimeframe(e.target.value)}
                                />
                                <label className="form-check-label small" htmlFor="revenueMonthly">
                                  Monthly
                                </label>
                              </div>
                              <div className="form-check">
                                <input
                                  className="form-check-input"
                                  type="radio"
                                  name="revenueTimeframe"
                                  id="revenueYearly"
                                  value="yearly"
                                  checked={revenueTimeframe === 'yearly'}
                                  onChange={(e) => setRevenueTimeframe(e.target.value)}
                                />
                                <label className="form-check-label small" htmlFor="revenueYearly">
                                  Yearly
                                </label>
                              </div>
                            </div>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label small fw-medium text-muted">Custom Date Range (Optional):</label>
                            <div className="d-flex gap-2">
                              <input
                                type="date"
                                className="form-control form-control-sm"
                                value={revenueStartDate}
                                onChange={(e) => setRevenueStartDate(e.target.value)}
                                placeholder="Start Date"
                                style={{ fontSize: "0.8rem" }}
                              />
                              <input
                                type="date"
                                className="form-control form-control-sm"
                                value={revenueEndDate}
                                onChange={(e) => setRevenueEndDate(e.target.value)}
                                placeholder="End Date"
                                style={{ fontSize: "0.8rem" }}
                              />
                            </div>
                            {revenueStartDate && revenueEndDate ? (
                              <small className="text-muted">
                                Showing data from {revenueStartDate} to {revenueEndDate}
                              </small>
                            ) : (
                              <small className="text-muted">
                                Leave empty to use default time range
                              </small>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="card-body pt-0">
                      {trendLoading ? (
                        <div className="d-flex justify-content-center align-items-center" style={{ height: "300px" }}>
                          <div className="text-center">
                            <div className="spinner-border text-primary mb-3" role="status">
                              <span className="visually-hidden">Loading trend data...</span>
                            </div>
                            <p className="text-muted mb-0">Loading trend data...</p>
                          </div>
                        </div>
                      ) : (
                        <div className="px-1 px-md-2" style={{ height: "300px" }}>
                          <Line data={trendChartData} options={trendChartOptions} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Clinic Closure Warning Section */}
            {data && data.clinic_closure_info && data.clinic_closure_info.has_significant_closures && (
              <div className="mt-4">
                <div
                  className="card border-0 shadow-sm"
                  style={{
                    background: "linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(254, 226, 226, 0.1) 100%)",
                    borderRadius: "16px",
                    border: "2px solid rgba(239, 68, 68, 0.2)",
                    boxShadow: "0 10px 30px rgba(239, 68, 68, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
                  }}
                >
                  <div className="card-header border-0 bg-transparent py-4">
                    <h5
                      className="mb-0 fw-bold d-flex align-items-center"
                      style={{ color: "#DC2626" }}
                    >
                      <span className="me-2">🚨</span>
                      Clinic Closure Alert
                    </h5>
                    <p className="mb-0 mt-2 text-muted small">
                      Unexpected clinic closures detected this month
                    </p>
                  </div>
                  <div className="card-body pt-0">
                    <div className="alert alert-warning border-0 mb-0" style={{ 
                      background: "rgba(245, 158, 11, 0.1)",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      borderRadius: "12px"
                    }}>
                      <div className="d-flex align-items-start">
                        <div className="me-3">
                          <div
                            className="d-flex align-items-center justify-content-center rounded-circle"
                            style={{
                              width: "40px",
                              height: "40px",
                              background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                              color: "white",
                              fontSize: "18px",
                            }}
                          >
                            ⚠️
                          </div>
                        </div>
                        <div className="flex-grow-1">
                          <h6 className="fw-bold mb-2" style={{ color: "#92400E" }}>
                            {data.clinic_closure_info.summary}
                          </h6>
                          <div className="row g-3">
                            <div className="col-md-6">
                              <div className="d-flex justify-content-between">
                                <span className="text-muted">Expected Open Days:</span>
                                <span className="fw-semibold">{data.clinic_closure_info.total_expected_open_days}</span>
                              </div>
                            </div>
                            <div className="col-md-6">
                              <div className="d-flex justify-content-between">
                                <span className="text-muted">Days with Activity:</span>
                                <span className="fw-semibold">{data.clinic_closure_info.total_actual_open_days}</span>
                              </div>
                            </div>
                            <div className="col-md-6">
                              <div className="d-flex justify-content-between">
                                <span className="text-muted">Unexpected Closures:</span>
                                <span className="fw-semibold text-danger">{data.clinic_closure_info.closure_count}</span>
                              </div>
                            </div>
                            <div className="col-md-6">
                              <div className="d-flex justify-content-between">
                                <span className="text-muted">Closure Rate:</span>
                                <span className="fw-semibold text-danger">{data.clinic_closure_info.closure_rate_percentage}%</span>
                              </div>
                            </div>
                          </div>
                          {data.clinic_closure_info.unexpected_closures && data.clinic_closure_info.unexpected_closures.length > 0 && (
                            <div className="mt-3">
                              <h6 className="fw-semibold mb-2" style={{ color: "#92400E", fontSize: "0.9rem" }}>
                                Closed Days:
                              </h6>
                              <div className="d-flex flex-wrap gap-2">
                                {data.clinic_closure_info.unexpected_closures.slice(0, 10).map((closure, idx) => (
                                  <span
                                    key={idx}
                                    className="badge"
                                    style={{
                                      background: "rgba(239, 68, 68, 0.1)",
                                      color: "#DC2626",
                                      border: "1px solid rgba(239, 68, 68, 0.3)",
                                      fontSize: "0.75rem"
                                    }}
                                  >
                                    {closure.day_name} {closure.date.split('-')[2]}
                                  </span>
                                ))}
                                {data.clinic_closure_info.unexpected_closures.length > 10 && (
                                  <span className="badge bg-secondary" style={{ fontSize: "0.75rem" }}>
                                    +{data.clinic_closure_info.unexpected_closures.length - 10} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actionable Insights Section */}
            {data && data.has_last_month_data && (
              <div className="mt-4">
                <div
                  className="card border-0 shadow-sm"
                  style={{
                    background:
                      "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                    borderRadius: "16px",
                  }}
                >
                  <div className="card-header border-0 bg-transparent py-4">
                    <h5
                      className="mb-0 fw-bold d-flex align-items-center"
                      style={{ color: "#1e293b" }}
                    >
                      <span className="me-2">💡</span>
                      Actionable Insights & Recommendations
                    </h5>
                    <p className="mb-0 mt-2 text-muted small">
                      Data-driven recommendations to improve your clinic's performance
                    </p>
                  </div>
                  <div className="card-body pt-0">
                    <div className="row g-3">
                      {data.insights && data.insights.length > 0 ? data.insights.map((insight, idx) => (
                        <div key={idx} className="col-12 col-lg-6">
                          <div
                            className="card h-100 border-0"
                            style={{
                              background: insight.priority === 'high' 
                                ? "linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(254, 226, 226, 0.1) 100%)"
                                : insight.priority === 'medium'
                                ? "linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(254, 243, 199, 0.1) 100%)"
                                : "linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(209, 250, 229, 0.1) 100%)",
                              borderRadius: "12px",
                              border: insight.priority === 'high' 
                                ? "1px solid rgba(239, 68, 68, 0.2)"
                                : insight.priority === 'medium'
                                ? "1px solid rgba(245, 158, 11, 0.2)"
                                : "1px solid rgba(16, 185, 129, 0.2)",
                            }}
                          >
                            <div className="card-body p-4">
                              <div className="d-flex align-items-start justify-content-between mb-3">
                                <div className="d-flex align-items-center">
                                  <div
                                    className="me-3 d-flex align-items-center justify-content-center rounded-circle"
                                    style={{
                                      width: "40px",
                                      height: "40px",
                                      background: insight.priority === 'high' 
                                        ? "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)"
                                        : insight.priority === 'medium'
                                        ? "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)"
                                        : "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                                      color: "white",
                                      fontSize: "18px",
                                    }}
                                  >
                                    {insight.priority === 'high' ? '🚨' : insight.priority === 'medium' ? '⚠️' : '✅'}
                                  </div>
                                  <div>
                                    <h6 className="mb-1 fw-bold" style={{ color: "#1e293b" }}>
                                      {insight.title}
                                    </h6>
                                    <span
                                      className={`badge px-2 py-1 ${
                                        insight.priority === 'high' 
                                          ? 'bg-danger' 
                                          : insight.priority === 'medium'
                                          ? 'bg-warning'
                                          : 'bg-success'
                                      }`}
                                      style={{ fontSize: "0.7rem" }}
                                    >
                                      {insight.priority.toUpperCase()} PRIORITY
                                    </span>
                                  </div>
                                </div>
                                <div className="text-end">
                                  <small className="text-muted d-block" style={{ fontSize: "0.7rem" }}>
                                    {insight.category.replace('_', ' ').toUpperCase()}
                                  </small>
                                </div>
                              </div>
                              
                              <p className="text-muted mb-3" style={{ fontSize: "0.9rem", lineHeight: "1.5" }}>
                                {insight.description}
                              </p>
                              
                              <div className="mb-3">
                                <h6 className="fw-semibold mb-2" style={{ color: "#374151", fontSize: "0.85rem" }}>
                                  Recommended Actions:
                                </h6>
                                <ul className="list-unstyled mb-0">
                                  {insight.actions.slice(0, 3).map((action, actionIdx) => (
                                    <li key={actionIdx} className="d-flex align-items-start mb-1">
                                      <span className="me-2 text-primary" style={{ fontSize: "0.8rem" }}>•</span>
                                      <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{action}</span>
                                    </li>
                                  ))}
                                  {insight.actions.length > 3 && (
                                    <li className="text-muted" style={{ fontSize: "0.75rem" }}>
                                      +{insight.actions.length - 3} more recommendations
                                    </li>
                                  )}
                                </ul>
                              </div>
                              
                              <div className="d-flex justify-content-between align-items-center">
                                <small className="text-muted" style={{ fontSize: "0.75rem" }}>
                                  Impact: {insight.impact}
                                </small>
                                <button
                                  className="btn btn-sm border-0"
                                  style={{
                                    background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
                                    color: "white",
                                    borderRadius: "8px",
                                    fontSize: "0.75rem",
                                    padding: "4px 12px",
                                  }}
                                  onClick={() => {
                                    // Copy actions to clipboard or show detailed view
                                    const actionsText = insight.actions.join('\n• ');
                                    navigator.clipboard.writeText(`Actions for ${insight.title}:\n• ${actionsText}`);
                                    toast.success('Actions copied to clipboard!');
                                  }}
                                >
                                  Copy Actions
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="col-12">
                          <div className="text-center py-4">
                            <div className="fs-1 mb-3">🔍</div>
                            <p className="text-muted mb-0 fw-medium">
                              No actionable insights available
                            </p>
                            <small className="text-muted">
                              Insights will appear here when data patterns are detected
                            </small>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* No Data Message Section */}
            {data && !data.has_last_month_data && (
              <div className="mt-4">
                <div
                  className="card border-0 shadow-sm"
                  style={{
                    background:
                      "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                    borderRadius: "16px",
                  }}
                >
                  <div className="card-header border-0 bg-transparent py-4">
                    <h5
                      className="mb-0 fw-bold d-flex align-items-center"
                      style={{ color: "#1e293b" }}
                    >
                      <span className="me-2">📊</span>
                      Analytics Status
                    </h5>
                    <p className="mb-0 mt-2 text-muted small">
                      Current month analytics overview
                    </p>
                  </div>
                  <div className="card-body pt-0">
                    <div className="text-center py-4">
                      <div className="fs-1 mb-3">📈</div>
                      <h6 className="fw-bold mb-2" style={{ color: "#374151" }}>
                        Insufficient Historical Data
                      </h6>
                      <p className="text-muted mb-3">
                        Actionable insights require comparison with previous month data. 
                        Current month shows activity, but we need more historical data to generate meaningful recommendations.
                      </p>
                      <div className="alert alert-info border-0" style={{ 
                        background: "rgba(59, 130, 246, 0.1)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        borderRadius: "12px"
                      }}>
                        <small className="text-muted">
                          <strong>Tip:</strong> Once you have at least one month of historical data, 
                          the system will automatically generate actionable insights and recommendations 
                          to help optimize your clinic's performance.
                        </small>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4">
              <div
                className="card border-0 shadow-sm"
                style={{
                  background:
                    "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                  borderRadius: "16px",
                }}
              >
                <div className="card-header border-0 bg-transparent py-4">
                  <h5
                    className="mb-0 fw-bold d-flex align-items-center"
                    style={{ color: "#1e293b" }}
                  >
                    <span className="me-2">🔔</span>
                    System Alerts
                  </h5>
                </div>
                <div className="card-body pt-0">
                  {(data?.alerts || []).length === 0 ? (
                    <div className="text-center py-4">
                      <div className="fs-1 mb-3">✅</div>
                      <p className="text-muted mb-0 fw-medium">
                        All systems running smoothly
                      </p>
                      <small className="text-muted">No alerts to display</small>
                    </div>
                  ) : (
                    <div className="list-group list-group-flush">
                      {(data?.alerts || []).map((a, idx) => (
                        <div
                          key={idx}
                          className={`list-group-item border-0 px-0 py-3 d-flex align-items-start ${
                            a.type === "warning" ? "text-warning" : "text-info"
                          }`}
                        >
                          <span className="me-3 mt-1">
                            {a.type === "warning" ? "⚠️" : "ℹ️"}
                          </span>
                          <span className="fw-medium">{a.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </>
  );
}