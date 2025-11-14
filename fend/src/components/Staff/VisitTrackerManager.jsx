/* global bootstrap */
import { useEffect, useState } from "react";
import api from "../../api/api";
import VisitCompletionModal from "./VisitCompletionModal";
import VisitNotesModal from "./VisitNotesModal";
import SendVisitCodeModal from "./SendVisitCodeModal";
import MedicalHistoryFormModal from "./MedicalHistoryFormModal";
import TimeBlockModal from "./TimeBlockModal";
import toast from "react-hot-toast";

function VisitTrackerManager() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [visitType, setVisitType] = useState("walkin");
  const [refCode, setRefCode] = useState("");
  const [appointmentData, setAppointmentData] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingVisitId, setRejectingVisitId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [offeredAppointment, setOfferedAppointment] = useState(false);
  const [editingVisit, setEditingVisit] = useState(null);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    contact: "",
    service_id: "",
  });
  const [availableServices, setAvailableServices] = useState([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchingPatients, setMatchingPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showAllVisits, setShowAllVisits] = useState(false);
  const [completingVisit, setCompletingVisit] = useState(null);
  const [viewingNotes, setViewingNotes] = useState(null);
    const [sendingReceipt, setSendingReceipt] = useState(null);       
  const [sendingVisitCode, setSendingVisitCode] = useState(null);   
  const [potentialMatches, setPotentialMatches] = useState([]);
  const [showMatchesModal, setShowMatchesModal] = useState(false);  
  const [showMakeAppointmentModal, setShowMakeAppointmentModal] = useState(false);
  const [showMedicalHistoryModal, setShowMedicalHistoryModal] = useState(false);
  const [medicalHistoryVisit, setMedicalHistoryVisit] = useState(null);
  const [showTimeBlockModal, setShowTimeBlockModal] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({
    patient_id: '',
    first_name: '',
    last_name: '',
    contact_number: '',
    email: '',
    birthdate: '',
    service_id: '',
    date: '',
    start_time: '',
    payment_method: 'cash',
    patient_hmo_id: '',
    teeth_count: '',
    linkToExisting: false,
    honor_preferred_dentist: true,
  });
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [creatingAppointment, setCreatingAppointment] = useState(false);
  const [selectedServiceDetails, setSelectedServiceDetails] = useState(null);
  const normalizeService = (service) => {
    if (!service || typeof service !== 'object') return service;

    const booleanKeys = [
      'per_teeth_service',
      'per_tooth_service',
      'requires_teeth_count',
    ];

    const normalizedService = { ...service };
    booleanKeys.forEach((key) => {
      if (key in normalizedService) {
        normalizedService[key] = Boolean(normalizedService[key]);
      }
    });

    return normalizedService;
  };

  const toHighlightDateStrings = (input) => {
    if (!Array.isArray(input)) return [];
    return input
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.date === 'string') {
          if (
            Object.prototype.hasOwnProperty.call(item, 'preferred_dentist_present') &&
            item.preferred_dentist_present === false
          ) {
            return null;
          }
          return item.date;
        }
        return null;
      })
      .filter(Boolean);
  };

  const normalizeServicesList = (services) =>
    Array.isArray(services) ? services.map(normalizeService) : [];

  const [availableDentists, setAvailableDentists] = useState([]);
  const [loadingDentists, setLoadingDentists] = useState(false);
  const [preferredDentistInfo, setPreferredDentistInfo] = useState(null);
  const [highlightInfo, setHighlightInfo] = useState({
    dates: [],
    present: false,
  });
  const [slotMetadataStaff, setSlotMetadataStaff] = useState(null);
  const dentistScheduledOnSelectedDate =
    !!(
      appointmentForm.date &&
      preferredDentistInfo &&
      (
        (Array.isArray(highlightInfo.dates) && highlightInfo.dates.includes(appointmentForm.date)) ||
        highlightInfo.present === true
      )
    );

  useEffect(() => {
    fetchVisits();
  }, []);

  // Debug: Log when visits state changes
  useEffect(() => {
    console.log("🔄 Visits state updated:", visits);
    console.log("📊 Visit counts:", {
      total: visits.length,
      pending: visits.filter(v => v.status === 'pending').length,
      completed: visits.filter(v => v.status === 'completed').length,
      rejected: visits.filter(v => v.status === 'rejected').length
    });
  }, [visits]);

  const fetchVisits = async () => {
    setLoading(true);
    try {
      console.log("🌐 Fetching visits from API...");
      const res = await api.get("/api/visits");
      console.log("📥 API response received:", res.data);
      console.log("📈 Number of visits received:", res.data.length);
      console.log("⏳ Visits with pending status:", res.data.filter(v => v.status === 'pending'));
      console.log("🔍 Visit IDs:", res.data.map(v => ({ id: v.id, status: v.status, patient: v.patient?.first_name + ' ' + v.patient?.last_name })));
      setVisits(res.data);
    } catch (err) {
      console.error("❌ Failed to load visits", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartVisit = async () => {
    setSubmitting(true);
    try {
      let payload;
      if (visitType === "walkin") {
        payload = { visit_type: "walkin" };
      } else if (visitType === "appointment") {
        if (!appointmentData) {
          toast.error("Search and select a valid appointment first.");
          setSubmitting(false);
          return;
        }
        payload = {
          visit_type: "appointment",
          reference_code: (refCode || "")
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, ""),
        };
      }
      console.log("🚀 Creating visit with payload:", payload);
      const response = await api.post("/api/visits", payload);
      const visit = response.data.visit || response.data;
      console.log("✅ Visit created successfully:", visit);
      console.log("📋 Visit details:", {
        id: visit.id,
        status: visit.status,
        visit_code: visit.visit_code,
        patient_id: visit.patient_id,
        patient_name: visit.patient?.first_name + ' ' + visit.patient?.last_name,
        start_time: visit.start_time
      });
      
      // Check if requires_medical_history flag is present (for appointment-based visits)
      if (response.data.requires_medical_history) {
        toast("Visit created. Please complete the medical history form before sending the visit code to the dentist.", { icon: "ℹ️" });
      } else if (visit.visit_code) {
        toast.success(`Visit started successfully!\n\nVisit Code: ${visit.visit_code}\n\nShare this code with the dentist to begin consultation.`);
      }
      
      // Add the newly created visit to the state immediately
      console.log("➕ Adding new visit to state:", visit);
      setVisits(prevVisits => {
        const newVisits = [visit, ...prevVisits];
        console.log("🔄 Updated visits state with new visit:", newVisits);
        console.log("🎯 New visit should now be visible in the list");
        return newVisits;
      });
      
      setRefCode("");
      setAppointmentData(null);
      
      // Also fetch from server to ensure consistency
      console.log("🔄 Fetching visits after creation to ensure consistency...");
      await new Promise(resolve => setTimeout(resolve, 200));
      await fetchVisits();
      console.log("✅ Visit creation process completed");
    } catch (err) {
      console.error("Error creating visit:", err);
      toast.error("Failed to start visit.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id, action) => {
    if (action === "finish") {
      const visit = visits.find(v => v.id === id);
      
      // Check if service is selected for walk-in patients
      if (!visit.service_id) {
        toast.error("Please select a service for this patient before finishing the visit. Use the 'Edit' button to assign a service.");
        return;
      }

      if (!visit.visit_code_sent_at) {
        toast.error("Send the visit code to a dentist before completing the visit.");
        return;
      }
      
      setCompletingVisit(visit);
      return;
    }
    
    try {
      await api.post(`/api/visits/${id}/${action}`);
      await fetchVisits();
    } catch (err) {
      toast.error(`Failed to ${action} visit.`);
    }
  };

  const handleVisitComplete = async () => {
    await fetchVisits();
  };

  const handleSendReceiptEmail = async (visitId) => {
    setSendingReceipt(visitId);
    try {
      const response = await api.post(`/api/receipts/visit/${visitId}/email`, {}, {
        skip401Handler: true
      });

      if (response.data.note) {
        toast.success(`${response.data.message}\n\n${response.data.note}`);
      } else {
        toast.success(`Receipt sent successfully to ${response.data.email}`);
      }
    } catch (err) {
      console.error("Failed to send receipt email", err);
      const serverMsg = err.response?.data?.message || "Failed to send receipt email. Please try again.";
      toast.error(serverMsg);
    } finally {
      setSendingReceipt(null);
    }
  };

  const handleSearchRefCode = async () => {
    setSearching(true);
    setAppointmentData(null);
    setSearchError("");

    try {
      const code = (refCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length !== 8) {
        setSearchError("Enter the full 8-character code.");
        return;
      }
      const res = await api.get(`/api/appointment/resolve/${code}`);
      setAppointmentData(res.data);
    } catch {
      setSearchError("Invalid or used reference code.");
    } finally {
      setSearching(false);
    }
  };

  const handleEditClick = async (visit) => {
    setEditingVisit(visit);
    setEditForm({
      first_name: visit.patient?.first_name || "",
      last_name: visit.patient?.last_name || "",
      contact: visit.patient?.contact || "",
      service_id: visit.service_id || "",
    });

    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await api.get(
        `/api/appointment/available-services?date=${today}`
      );
      const servicesData = Array.isArray(res.data) ? res.data : res.data.data || [];
      setAvailableServices(normalizeServicesList(servicesData));
    } catch (err) {
      toast.error("Failed to load services.");
    }
  };

  const handleEditSave = async () => {
    try {
      const response = await api.put(`/api/visits/${editingVisit.id}/update-patient`, {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        contact_number:
          editForm.contact.trim() !== ""
            ? editForm.contact.trim()
            : editingVisit.patient?.contact_number,
        service_id: editForm.service_id || null,
      });
      
      // Check if there are potential matching patients
      if (response.data.potential_matches && response.data.potential_matches.length > 0) {
        setPotentialMatches(response.data.potential_matches);
        setShowMatchesModal(true);
        // Keep editingVisit open so user can link if needed
        // Don't fetchVisits here to avoid race condition
      } else {
        const savedEditingVisit = editingVisit; // Store before clearing
        setEditingVisit(null);
        await fetchVisits();
        
        // NEW: Auto-open medical history modal for walk-in after edit save
        // Check if this is a walk-in (no appointment_id) and service is selected
        if (!savedEditingVisit.appointment_id && editForm.service_id) {
          try {
            const updatedVisitResponse = await api.get(`/api/visits/${savedEditingVisit.id}`);
            if (updatedVisitResponse.data.medical_history_status === 'pending') {
              setMedicalHistoryVisit(updatedVisitResponse.data);
              setShowMedicalHistoryModal(true);
            }
          } catch (err) {
            console.error("Failed to fetch updated visit for medical history:", err);
          }
        }
      }
    } catch (err) {
      toast.error("Failed to update patient.");
    }
  };

  const handleOpenMedicalHistory = (visit) => {
    setMedicalHistoryVisit(visit);
    setShowMedicalHistoryModal(true);
  };

  const handleMedicalHistorySuccess = async (data) => {
    // Refresh visits to get updated visit_code
    await fetchVisits();
    setShowMedicalHistoryModal(false);
    setMedicalHistoryVisit(null);
  };

  const handleMakeAppointmentClick = async () => {
    // Start with empty date - user must select a date first
    setAppointmentForm({
      patient_id: '',
      first_name: '',
      last_name: '',
      contact_number: '',
      email: '',
      birthdate: '',
      service_id: '',
      date: '',
      start_time: '',
      payment_method: 'cash',
      patient_hmo_id: '',
      teeth_count: '',
      linkToExisting: false,
      honor_preferred_dentist: true,
    });
    setSelectedServiceDetails(null);
    setAvailableSlots([]);
    setAvailableDentists([]);
    setPreferredDentistInfo(null);
    setHighlightInfo({ dates: [], present: false });
    setSlotMetadataStaff(null);
    
    // Don't load services initially - wait for date selection
    setAvailableServices([]);
    
    setShowMakeAppointmentModal(true);
  };

  const handleDateChange = async (date) => {
    setAppointmentForm(prev => ({
      ...prev,
      date,
      start_time: '',
      service_id: '',
      teeth_count: '',
      honor_preferred_dentist: false,
    }));
    setAvailableSlots([]);
    setSelectedServiceDetails(null);
    setSlotMetadataStaff(null);
    
    // Fetch available dentists for the selected date (optional feature)
    if (date) {
      setLoadingDentists(true);
      try {
        const res = await api.get(`/api/dentists/available-for-date?date=${date}`);
        setAvailableDentists(res.data.dentists || []);
      } catch (err) {
        console.error("Failed to load dentists for date:", err);
        setAvailableDentists([]);
      } finally {
        setLoadingDentists(false);
      }
      
      // Reload services for the new date
      try {
        const queryParams = new URLSearchParams({
          date,
          with_meta: '1',
        });
        if (appointmentForm.linkToExisting && appointmentForm.patient_id) {
          queryParams.set('patient_id', appointmentForm.patient_id);
        }
        const res = await api.get(
          `/api/appointment/available-services?${queryParams.toString()}`
        );
        const servicesData = Array.isArray(res.data?.services)
          ? res.data.services
          : Array.isArray(res.data)
          ? res.data
          : res.data?.data || [];
        setAvailableServices(normalizeServicesList(servicesData));

        const metadata = res.data?.metadata ?? null;
        if (metadata) {
          const highlightDates = toHighlightDateStrings(metadata.highlight_dates ?? []);
          const dentistAvailable =
            metadata.preferred_dentist_present ?? highlightDates.includes(date);
          setPreferredDentistInfo(metadata.preferred_dentist ?? null);
          setHighlightInfo({
            dates: highlightDates,
            present: metadata.preferred_dentist_present ?? dentistAvailable,
          });
          setAppointmentForm(prev => ({
            ...prev,
            honor_preferred_dentist: dentistAvailable,
          }));
        } else {
          setPreferredDentistInfo(null);
          setHighlightInfo({ dates: [], present: false });
          setAppointmentForm(prev => ({
            ...prev,
            honor_preferred_dentist: false,
          }));
        }
      } catch (err) {
        console.error("Failed to load services for new date:", err);
        setAvailableServices([]);
        setPreferredDentistInfo(null);
        setHighlightInfo({ dates: [], present: false });
        setAppointmentForm(prev => ({
          ...prev,
          honor_preferred_dentist: false,
        }));
      }
    } else {
      setAvailableDentists([]);
      setAvailableServices([]);
      setPreferredDentistInfo(null);
      setHighlightInfo({ dates: [], present: false });
      setAppointmentForm(prev => ({
        ...prev,
        honor_preferred_dentist: false,
      }));
    }
  };

  const handleServiceChange = async (serviceId) => {
    const service = availableServices.find(s => s.id == serviceId);
    setSelectedServiceDetails(service ? normalizeService(service) : null);
    setAppointmentForm(prev => ({ ...prev, service_id: serviceId, start_time: '', teeth_count: '' }));
    setAvailableSlots([]);
    setSlotMetadataStaff(null);
    
    // For per-teeth services, don't fetch slots until teeth count is provided
    if (serviceId && appointmentForm.date && service && !service.per_teeth_service) {
      await fetchAvailableSlots(appointmentForm.date, serviceId, appointmentForm.teeth_count);
    }
  };

  const handleTeethCountChange = async (teethCount) => {
    setAppointmentForm(prev => ({ ...prev, teeth_count: teethCount, start_time: '' }));
    setAvailableSlots([]);
    setSlotMetadataStaff(null);
    
    if (appointmentForm.date && appointmentForm.service_id && teethCount && teethCount > 0) {
      await fetchAvailableSlots(appointmentForm.date, appointmentForm.service_id, teethCount);
    }
  };

  const handleHonorPreferredDentistToggle = async (value) => {
    setAppointmentForm(prev => ({ ...prev, honor_preferred_dentist: value, start_time: '' }));
    setAvailableSlots([]);
    setSlotMetadataStaff(null);

    if (appointmentForm.date && appointmentForm.service_id) {
      await fetchAvailableSlots(
        appointmentForm.date,
        appointmentForm.service_id,
        appointmentForm.teeth_count || null,
        value
      );
    }
  };

  const fetchAvailableSlots = async (date, serviceId, teethCount = null, honorFlag = appointmentForm.honor_preferred_dentist) => {
    setLoadingSlots(true);
    try {
        const params = { date, service_id: serviceId };
      if (teethCount) {
        params.teeth_count = teethCount;
      }
      params.honor_preferred_dentist = honorFlag ? 1 : 0;
        if (appointmentForm.linkToExisting && appointmentForm.patient_id) {
          params.patient_id = appointmentForm.patient_id;
        }
      
      const response = await api.get('/api/appointment/available-slots', { params });
      setAvailableSlots(response.data.slots || response.data);
      setSlotMetadataStaff(response.data.metadata ?? null);
    } catch (err) {
      console.error('Failed to fetch available slots:', err);
      setAvailableSlots([]);
      setSlotMetadataStaff(null);
    } finally {
      setLoadingSlots(false);
    }
  };

  const validateBirthdate = (dateString) => {
    if (!dateString) return null; // Optional field
    
    const birthDate = new Date(dateString);
    const today = new Date();
    const fourYearsAgo = new Date();
    fourYearsAgo.setFullYear(today.getFullYear() - 4);
    
    if (birthDate > today) {
      return "Birthdate cannot be in the future.";
    }
    
    if (birthDate > fourYearsAgo) {
      return "Patient must be at least 4 years old.";
    }
    
    return null;
  };

  // Calculate the maximum allowed date (4 years ago)
  const getMaxBirthdate = () => {
    const fourYearsAgo = new Date();
    fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);
    return fourYearsAgo.toISOString().split('T')[0];
  };

  const handleCreateAppointment = async () => {
    if (!appointmentForm.service_id || !appointmentForm.date || !appointmentForm.start_time) {
      toast.error('Please select service, date, and time.');
      return;
    }

    // Check if per-teeth service requires teeth count
    if (selectedServiceDetails && selectedServiceDetails.per_teeth_service && !appointmentForm.teeth_count) {
      toast.error('Please enter the number of teeth for this per-teeth service.');
      return;
    }

    // Validate birthdate if provided
    const birthdateError = validateBirthdate(appointmentForm.birthdate);
    if (birthdateError) {
      toast.error(birthdateError);
      return;
    }

    if (!appointmentForm.linkToExisting && (!appointmentForm.first_name || !appointmentForm.last_name || !appointmentForm.contact_number)) {
      toast.error('Please fill in patient details including contact number (required for SMS reminders) or link to existing patient.');
      return;
    }

    if (appointmentForm.linkToExisting && !appointmentForm.patient_id) {
      toast.error('Please select an existing patient.');
      return;
    }

    setCreatingAppointment(true);
    try {
      const payload = {
        service_id: appointmentForm.service_id,
        date: appointmentForm.date,
        start_time: appointmentForm.start_time,
        payment_method: appointmentForm.payment_method,
      honor_preferred_dentist: appointmentForm.honor_preferred_dentist,
      };

      if (appointmentForm.linkToExisting) {
        payload.patient_id = appointmentForm.patient_id;
      } else {
        payload.first_name = appointmentForm.first_name;
        payload.last_name = appointmentForm.last_name;
        payload.contact_number = appointmentForm.contact_number;
        if (appointmentForm.email) payload.email = appointmentForm.email;
        if (appointmentForm.birthdate) payload.birthdate = appointmentForm.birthdate;
      }

      if (appointmentForm.payment_method === 'hmo' && appointmentForm.patient_hmo_id) {
        payload.patient_hmo_id = appointmentForm.patient_hmo_id;
      }

      if (appointmentForm.teeth_count) {
        payload.teeth_count = parseInt(appointmentForm.teeth_count);
      }

      const response = await api.post('/api/appointments/staff-create', payload);
      toast.success(`Appointment created successfully!\nReference Code: ${response.data.appointment.reference_code}`);
      setShowMakeAppointmentModal(false);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to create appointment.';
      toast.error(errorMessage);
    } finally {
      setCreatingAppointment(false);
    }
  };

  return (
    <div className="h-100 d-flex flex-column">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3>📝 Patient Visit Tracker</h3>
        <button
          className="btn btn-outline-primary"
          onClick={() => setShowTimeBlockModal(true)}
        >
          <i className="bi bi-calendar-check me-2"></i>
          View Today's Schedule
        </button>
      </div>

      <div className="card p-3 mb-4">
        <label>Visit Type</label>
        <select
          className="form-select mb-2"
          value={visitType}
          onChange={(e) => {
            setVisitType(e.target.value);
            setAppointmentData(null);
            setRefCode("");
            setSearchError("");
          }}
        >
          <option value="walkin">Walk-in</option>
          <option value="appointment">Appointment</option>
        </select>

        {visitType === "appointment" && (
          <>
            <div className="input-group mb-2">
              <input
                type="text"
                className="form-control"
                placeholder="Enter Appointment Reference Code"
                value={refCode}
                onChange={(e) => setRefCode(e.target.value.toUpperCase())}
              />
              <button
                className="btn btn-outline-primary"
                onClick={handleSearchRefCode}
                disabled={searching || !refCode}
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </div>
            {searchError && <div className="text-danger">{searchError}</div>}
            {appointmentData && (
              <div className="alert alert-success">
                <div className="mb-2">
                  <strong>{appointmentData.patient_name}</strong> —{" "}
                  {appointmentData.service_name} @ {appointmentData.date} /{" "}
                  {appointmentData.time_slot}
                </div>
                {appointmentData.last_visit && (
                  <div className="mt-2 p-2 bg-light rounded">
                    <small className="text-muted">📋 Last Visit:</small>
                    <div className="small">
                      <strong>Date:</strong> {new Date(appointmentData.last_visit.visit_date).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      })} |{" "}
                      <strong>Service:</strong> {appointmentData.last_visit.service_name || 'N/A'}
                      {appointmentData.last_visit.teeth_treated && (
                        <> | <strong>Teeth Treated:</strong> {appointmentData.last_visit.teeth_treated}</>
                      )}
                    </div>
                  </div>
                )}
                {!appointmentData.last_visit && (
                  <div className="mt-2 p-2 bg-light rounded">
                    <small className="text-muted">📋 No previous visits found</small>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div className="d-flex gap-2 mt-2">
          <button
            className="btn btn-primary"
            onClick={handleStartVisit}
            disabled={submitting}
          >
            {submitting ? "Saving..." : "Start Visit"}
          </button>
          <button
            className="btn btn-success"
            onClick={handleMakeAppointmentClick}
          >
            📅 Make Appointment
          </button>
        </div>
      </div>

      <div className="flex-grow-1 d-flex flex-column">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="d-flex align-items-center">
            <h5 className="mb-0">Ongoing Visits ({visits.filter(v => v.status === 'pending').length} pending)</h5>
            {loading && (
              <div className="d-flex align-items-center text-muted ms-3">
                <div className="spinner-border spinner-border-sm me-2" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <small>Loading visits...</small>
              </div>
            )}
          </div>
            <div className="d-flex gap-2">
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={fetchVisits}
              >
                🔄 Refresh
              </button>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setShowAllVisits((prev) => !prev)}
              >
                {showAllVisits
                  ? "🔽 Hide Completed/Rejected"
                  : "🔼 Show All Today's Visits"}
              </button>
          </div>
        </div>
        <div className="table-responsive flex-grow-1">
            <table className="table table-bordered table-hover mb-0">
              <thead className="table-light sticky-top">
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Visit Code</th>
                  <th>Service</th>
                  <th>Note</th>
                  <th>Started At</th>
                  <th>Status</th>
                  <th>Medical History</th>
                  <th style={{minWidth: '200px'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
              {(() => {
                const filteredVisits = visits.filter((v) => showAllVisits || v.status === "pending");
                console.log("All visits:", visits);
                console.log("Show all visits:", showAllVisits);
                console.log("Filtered visits:", filteredVisits);
                return filteredVisits;
              })()
                .map((v) => {
                  const canFinish = Boolean(v.service_id) && Boolean(v.visit_code_sent_at);
                  const assignedDentistName = v.assigned_dentist?.dentist_name || v.assigned_dentist?.dentist_code || null;
                  const visitCodeSentAt = v.visit_code_sent_at ? new Date(v.visit_code_sent_at).toLocaleString("en-PH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }) : null;

                  console.log("Rendering visit:", v.id, "Patient:", v.patient);
                  return (
                  <tr key={v.id}>
                    <td>
                      {v.patient?.first_name} {v.patient?.last_name}
                    </td>
                    <td>{v.patient?.contact_number || "—"}</td>
                    <td>
                      {v.visit_code ? (
                        <span className="badge bg-primary">{v.visit_code}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {v.service ? (
                        <span className="badge bg-info">{v.service.name}</span>
                      ) : (
                        <span className="badge bg-warning">
                          <i className="bi bi-exclamation-triangle me-1"></i>
                          No Service
                        </span>
                      )}
                    </td>
                    <td>
                      {v.status === "completed" && v.visit_notes ? (
                        <button
                          className="btn btn-sm btn-outline-info"
                          onClick={() => setViewingNotes(v)}
                        >
                          🔒 View Notes
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {v.start_time
                        ? new Date(v.start_time).toLocaleString("en-PH", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>

                    <td>{v.status}</td>
                    <td>
                      {v.medical_history_status === 'completed' ? (
                        <span className="badge bg-success">
                          <i className="bi bi-check-circle me-1"></i>
                          Completed
                        </span>
                      ) : (
                        <span className="badge bg-warning text-dark">
                          <i className="bi bi-clock me-1"></i>
                          Pending
                        </span>
                      )}
                    </td>
                    <td>
                      {v.status === "pending" && (
                        <div className="d-flex gap-1 flex-wrap">    
                          <button
                            className="btn btn-warning btn-sm"      
                            onClick={() => handleEditClick(v)}      
                          >
                            Edit
                          </button>
                          
                          {/* Medical History Button */}
                          <button
                            className={`btn btn-sm ${v.medical_history_status === 'completed' ? 'btn-success' : 'btn-info'}`}
                            onClick={() => handleOpenMedicalHistory(v)}
                            title={v.medical_history_status === 'completed' ? 'View/Edit Medical History' : 'Complete Medical History'}
                          >
                            <i className={`bi ${v.medical_history_status === 'completed' ? 'bi-check-circle' : 'bi-file-medical'} me-1`}></i>
                            Medical History
                          </button>
                          
                          {/* Conditionally show Send Visit Code button or badge */}
                          {v.visit_code ? (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => setSendingVisitCode(v)}
                              disabled={v.medical_history_status === 'pending'}
                              title={v.medical_history_status === 'pending' ? 'Complete medical history first' : 'Send visit code to dentist'}
                            >
                              <i className="bi bi-send me-1"></i>
                              Send Visit Code to Dentist
                            </button>
                          ) : (
                            <span className="badge bg-warning text-dark">
                              <i className="bi bi-exclamation-triangle me-1"></i>
                              Medical History Required
                            </span>
                          )}

                          <div className="small text-muted w-100">
                            {assignedDentistName ? (
                              <>
                                <i className="bi bi-person-badge me-1"></i>
                                Assigned dentist: {assignedDentistName}
                                {visitCodeSentAt && (
                                  <div>
                                    <i className="bi bi-clock-history me-1"></i>
                                    Sent: {visitCodeSentAt}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span>
                                <i className="bi bi-info-circle me-1"></i>
                                Visit code not yet sent
                              </span>
                            )}
                          </div>
                          
                          <button
                            className={`btn btn-sm ${
                              canFinish ? "btn-success" : "btn-outline-secondary"
                            }`}
                            onClick={() => handleAction(v.id, "finish")}                                                                
                            disabled={!canFinish}
                            title={
                              !v.service_id
                                ? "Please select a service first"
                                : !v.visit_code_sent_at
                                  ? "Send the visit code before completing this visit"
                                  : "Complete this visit"
                            }
                          >
                            {!v.service_id ? (
                              <>
                                <i className="bi bi-exclamation-triangle me-1"></i>                                                     
                                Finish
                              </>
                            ) : (
                              "Finish"
                            )}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"       
                            onClick={() => {
                              setRejectingVisitId(v.id);
                              setRejectReason("");
                              setOfferedAppointment(false);
                              setShowRejectModal(true);
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {v.status === "completed" && (
                        <div className="d-flex gap-1 flex-wrap">
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleSendReceiptEmail(v.id)}
                            disabled={sendingReceipt === v.id}
                            title="Send Receipt Email"
                          >
                            {sendingReceipt === v.id ? (
                              <>
                                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                Sending...
                              </>
                            ) : (
                              <>
                                <i className="bi bi-envelope me-1"></i>
                                Send Receipt
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
            </tbody>
            </table>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="modal show d-block" tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {rejectReason === "inquiry_only" ? "Mark as Inquiry" : "Reject Visit"}
                </h5>
                <button
                  className="btn-close"
                  onClick={() => setShowRejectModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <label className="form-label">
                  {rejectReason === "inquiry_only" ? "Reason for inquiry:" : "Reason for rejection:"}
                </label>
                <select
                  className="form-select"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                >
                  <option value="">Select reason</option>
                  <option value="human_error">Human Error</option>
                  <option value="left">Patient Left</option>
                  <option value="line_too_long">Line Too Long</option>
                  <option value="inquiry_only">Inquiry Only</option>
                </select>
                {rejectReason === "line_too_long" && (
                  <div className="form-check mt-2">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={offeredAppointment}
                      onChange={(e) => setOfferedAppointment(e.target.checked)}
                      id="offerAppt"
                    />
                    <label htmlFor="offerAppt" className="form-check-label">
                      Patient was offered an appointment
                    </label>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowRejectModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  disabled={!rejectReason}
                  onClick={async () => {
                    await api.post(`/api/visits/${rejectingVisitId}/reject`, {
                      reason: rejectReason,
                      offered_appointment: offeredAppointment,
                    });
                    setShowRejectModal(false);
                    setRejectingVisitId(null);
                    await fetchVisits();
                  }}
                >
                  {rejectReason === "inquiry_only" ? "Mark as Inquiry" : "Confirm Reject"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingVisit && (
        <div className="modal show d-block" tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Patient Info</h5>
                <button
                  className="btn-close"
                  onClick={() => setEditingVisit(null)}
                ></button>
              </div>
              <div className="modal-body">
                <label className="form-label">First Name</label>
                <input
                  className="form-control mb-2"
                  value={editForm.first_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, first_name: e.target.value })
                  }
                />
                <label className="form-label">Last Name</label>
                <input
                  className="form-control mb-2"
                  value={editForm.last_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, last_name: e.target.value })
                  }
                />
                <label className="form-label">Contact</label>
                <input
                  className="form-control mb-2"
                  value={editForm.contact}
                  onChange={(e) =>
                    setEditForm({ ...editForm, contact: e.target.value })
                  }
                />
                <label className="form-label">Service</label>
                <select
                  className="form-select"
                  value={editForm.service_id}
                  onChange={(e) =>
                    setEditForm({ ...editForm, service_id: e.target.value })
                  }
                >
                  <option value="">— Select —</option>
                  {availableServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} –{" "}
                      {s.type === "promo"
                        ? `₱${Number(s.promo_price).toLocaleString()} (${
                            s.discount_percent
                          }% off)`
                        : s.type === "special"
                        ? `₱${Number(s.price).toLocaleString()} Special Service`
                        : `₱${Number(s.price).toLocaleString()}`}
                    </option>
                  ))}
                </select>
                <hr />
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    // trigger modal to search existing patients
                    setShowLinkModal(true);
                    setSearchQuery("");
                    setMatchingPatients([]);
                    setSelectedPatient(null);
                  }}
                >
                  🔗 Link to Existing Patient
                </button>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setEditingVisit(null)}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleEditSave}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLinkModal && (
        <div className="modal show d-block" tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Link to Existing Patient</h5>
                <button
                  className="btn-close"
                  onClick={() => setShowLinkModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <input
                  className="form-control mb-2"
                  placeholder="Search by name or contact (min 2 characters)"
                  value={searchQuery}
                  onChange={async (e) => {
                    const val = e.target.value;
                    setSearchQuery(val);
                    setMatchingPatients([]);
                    setSelectedPatient(null);

                    if (val.length >= 2) {
                      try {
                        const res = await api.get("/api/patients/search", {
                          params: { q: val.trim() },
                        });
                        setMatchingPatients(res.data);
                      } catch {
                        toast.error("Search failed.");
                      }
                    }
                  }}
                />

                {matchingPatients.filter(
                  (p) => p.id !== editingVisit?.patient?.id
                ).length > 0 ? (
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Contact</th>
                        <th>Birthdate</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingPatients
                        .filter((p) => p.id !== editingVisit?.patient?.id)
                        .map((p) => (
                          <tr key={p.id}>
                            <td>
                              {p.first_name} {p.last_name}
                            </td>
                            <td>{p.contact_number || "—"}</td>
                            <td>{p.birthdate ? new Date(p.birthdate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : "—"}</td>
                            <td>
                              <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => setSelectedPatient(p)}
                              >
                                Select
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Contact</th>
                        <th>Birthdate</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan="4" className="text-muted text-center">
                          No matching patients found.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {selectedPatient && (
                  <div className="alert alert-info mt-3">
                    Link current visit to{" "}
                    <strong>
                      {selectedPatient.first_name} {selectedPatient.last_name}
                    </strong>
                    ?
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowLinkModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!selectedPatient}
                  onClick={async () => {
                    try {
                      const payload = {
                        target_patient_id: selectedPatient.id,
                      };
                      
                      // Preserve service_id if it was selected in the edit form
                      if (editForm.service_id) {
                        payload.service_id = editForm.service_id;
                      }
                      
                      await api.post(
                        `/api/visits/${editingVisit.id}/link-existing`,
                        payload
                      );
                      setShowLinkModal(false);
                      setEditingVisit(null);
                      await fetchVisits();
                    } catch {
                      toast.error("Failed to link to patient.");
                    }
                  }}
                >
                  Confirm Link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Potential Matches Modal */}
      {showMatchesModal && (
        <div className="modal show d-block" tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header bg-warning">
                <h5 className="modal-title">⚠️ Potential Duplicate Patient Found</h5>
                <button
                  className="btn-close"
                  onClick={() => {
                    setShowMatchesModal(false);
                    setEditingVisit(null);
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-warning">
                  <strong>Warning:</strong> We found existing patient(s) with the same name. 
                  This might be a duplicate entry. Please review and link if this is the same patient.
                </div>
                <h6>Matching Patients:</h6>
                {potentialMatches.map((match) => (
                  <div key={match.id} className="card mb-2 p-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <strong>{match.first_name} {match.last_name}</strong>
                        <br />
                        <small className="text-muted">
                          Contact: {match.contact_number || 'N/A'}<br />
                          Birthdate: {match.birthdate ? new Date(match.birthdate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'N/A'}<br />
                          {match.has_user_account && (
                            <span className="badge bg-success">Has Online Account ({match.user_email})</span>
                          )}
                        </small>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={async () => {
                          if (window.confirm(`Link this visit to ${match.first_name} ${match.last_name}?`)) {
                            try {
                              const payload = {
                                target_patient_id: match.id,
                              };
                              
                              // Preserve service_id if it was selected in the edit form
                              if (editForm.service_id) {
                                payload.service_id = editForm.service_id;
                              }
                              
                              await api.post(`/api/visits/${editingVisit.id}/link-existing`, payload);
                              setShowMatchesModal(false);
                              setEditingVisit(null);
                              await fetchVisits();
                              toast.success('Visit successfully linked to existing patient!');
                            } catch (err) {
                              toast.error('Failed to link visit to patient.');
                            }
                          }
                        }}
                      >
                        Link to This Patient
                      </button>
                    </div>
                  </div>
                ))}
                <hr />
                <p className="text-muted">
                  <small>
                    If none of these patients match, you can close this dialog and the walk-in patient 
                    record will remain separate.
                  </small>
                </p>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowMatchesModal(false);
                    setEditingVisit(null);
                  }}
                >
                  Keep as Separate Patient
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visit Completion Modal */}
      {completingVisit && (
        <VisitCompletionModal
          visit={completingVisit}
          onClose={() => setCompletingVisit(null)}
          onComplete={handleVisitComplete}
        />
      )}

      {/* Visit Notes Modal */}
      {viewingNotes && (
        <VisitNotesModal
          visit={viewingNotes}
          onClose={() => setViewingNotes(null)}
        />
      )}

            {/* Send Visit Code Modal */}
      {sendingVisitCode && (
        <SendVisitCodeModal
          visit={sendingVisitCode}
          onClose={() => setSendingVisitCode(null)}
          onSuccess={async () => {
            await fetchVisits();
          }}
        />
      )}

      {/* Medical History Modal */}
      {showMedicalHistoryModal && medicalHistoryVisit && (
        <MedicalHistoryFormModal
          visit={medicalHistoryVisit}
          onClose={() => {
            setShowMedicalHistoryModal(false);
            setMedicalHistoryVisit(null);
          }}
          onSuccess={handleMedicalHistorySuccess}
        />
      )}

      {/* Make Appointment Modal */}
      {showMakeAppointmentModal && (
        <div className="modal show d-block" tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">📅 Create Appointment for Walk-in Patient</h5>
                <button
                  className="btn-close"
                  onClick={() => setShowMakeAppointmentModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <div className="row">
                  <div className="col-md-6">
                    <h6>Patient Information</h6>
                    
                    {/* Toggle between existing and new patient */}
                    <div className="form-check mb-3">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="linkToExisting"
                        checked={appointmentForm.linkToExisting}
                        onChange={(e) => setAppointmentForm(prev => ({ 
                          ...prev, 
                          linkToExisting: e.target.checked,
                          patient_id: e.target.checked ? prev.patient_id : '',
                          first_name: e.target.checked ? '' : prev.first_name,
                          last_name: e.target.checked ? '' : prev.last_name,
                          contact_number: e.target.checked ? '' : prev.contact_number,
                          email: e.target.checked ? '' : prev.email,
                          birthdate: e.target.checked ? '' : prev.birthdate,
                        }))}
                      />
                      <label className="form-check-label" htmlFor="linkToExisting">
                        Link to existing patient
                      </label>
                    </div>

                    {appointmentForm.linkToExisting ? (
                      <div className="mb-3">
                        <label className="form-label">Search Existing Patient</label>
                        <input
                          className="form-control"
                          placeholder="Search by name or contact (min 2 characters)"
                          value={searchQuery}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setSearchQuery(val);
                            setMatchingPatients([]);
                            setSelectedPatient(null);

                            if (val.length >= 2) {
                              try {
                                const res = await api.get("/api/patients/search", {
                                  params: { q: val.trim() },
                                });
                                setMatchingPatients(res.data);
                              } catch {
                                toast.error("Search failed.");
                              }
                            }
                          }}
                        />
                        
                        {matchingPatients.length > 0 && (
                          <div className="mt-2">
                            <small className="text-muted">Select a patient:</small>
                            {matchingPatients.map((patient) => (
                              <div key={patient.id} className="card p-2 mb-1 cursor-pointer" 
                                   onClick={() => {
                                     setAppointmentForm(prev => ({ ...prev, patient_id: patient.id }));
                                     setSelectedPatient(patient);
                                   }}
                                   style={{ cursor: 'pointer', backgroundColor: appointmentForm.patient_id === patient.id ? '#e3f2fd' : 'white' }}>
                                <div className="d-flex justify-content-between">
                                  <div>
                                    <strong>{patient.first_name} {patient.last_name}</strong>
                                    <br />
                                    <small className="text-muted">
                                      Contact: {patient.contact_number || 'N/A'} | 
                                      Birthdate: {patient.birthdate ? new Date(patient.birthdate).toLocaleDateString() : 'N/A'}
                                    </small>
                                  </div>
                                  {appointmentForm.patient_id === patient.id && (
                                    <span className="badge bg-primary">Selected</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="mb-3">
                          <label className="form-label" htmlFor="staffAppointmentFirstName">First Name *</label>
                          <input
                            className="form-control"
                            value={appointmentForm.first_name}
                            onChange={(e) => setAppointmentForm(prev => ({ ...prev, first_name: e.target.value }))}
                            id="staffAppointmentFirstName"
                          />
                        </div>
                        <div className="mb-3">
                          <label className="form-label" htmlFor="staffAppointmentLastName">Last Name *</label>
                          <input
                            className="form-control"
                            value={appointmentForm.last_name}
                            onChange={(e) => setAppointmentForm(prev => ({ ...prev, last_name: e.target.value }))}
                            id="staffAppointmentLastName"
                          />
                        </div>
                        <div className="mb-3">
                          <label className="form-label" htmlFor="staffAppointmentContact">Contact Number *</label>
                          <input
                            className="form-control"
                            value={appointmentForm.contact_number}
                            onChange={(e) => setAppointmentForm(prev => ({ ...prev, contact_number: e.target.value }))}
                            placeholder="Required for SMS reminders"
                            id="staffAppointmentContact"
                          />
                          <div className="form-text">
                            <i className="bi bi-phone me-1"></i>
                            Required for SMS appointment reminders
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="form-label">Email (Optional)</label>
                          <input
                            type="email"
                            className="form-control"
                            value={appointmentForm.email}
                            onChange={(e) => setAppointmentForm(prev => ({ ...prev, email: e.target.value }))}
                          />
                        </div>
                        <div className="mb-3">
                          <label className="form-label">Birthdate (Optional)</label>
                          <input
                            type="date"
                            className="form-control"
                            value={appointmentForm.birthdate}
                            onChange={(e) => {
                              const value = e.target.value;
                              setAppointmentForm(prev => ({ ...prev, birthdate: value }));
                              
                              // Real-time validation
                              const error = validateBirthdate(value);
                              if (error) {
                                toast.error(error);
                              }
                            }}
                            max={getMaxBirthdate()} // Must be at least 4 years old
                          />
                          <div className="form-text">
                            Must be at least 4 years old (dates after {getMaxBirthdate()} are not selectable).
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="col-md-6">
                    <h6>Appointment Details</h6>
                    
                    <div className="mb-3">
                      <label className="form-label" htmlFor="staffAppointmentDate">Date *</label>
                      <input
                        type="date"
                        className="form-control"
                        value={appointmentForm.date}
                        onChange={(e) => handleDateChange(e.target.value)}
                        min={new Date().toISOString().slice(0, 10)}
                        max={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                        placeholder="Select a date"
                        id="staffAppointmentDate"
                      />
                      <div className="form-text">
                        <i className="bi bi-info-circle me-1"></i>
                        {appointmentForm.date ? 
                          "You can only select dates up to 7 days from today" : 
                          "Please select a date first to see available dentists and services"
                        }
                      </div>
                      {preferredDentistInfo && (
                        <div className="alert alert-info border-0 shadow-sm mt-3">
                          <strong>Recent dentist:</strong> {preferredDentistInfo.name || preferredDentistInfo.code}
                          <div className="small mt-2">
                            {Array.isArray(highlightInfo.dates) && highlightInfo.dates.length > 0 ? (
                              <>
                                Available on:{" "}
                                <span className="fw-semibold">
                                  {highlightInfo.dates.join(', ')}
                                </span>
                              </>
                            ) : (
                              "No upcoming availability recorded."
                            )}
                          </div>
                          {appointmentForm.date && !dentistScheduledOnSelectedDate && (
                            <div className="small text-muted mt-2">
                              Your dentist is not scheduled on this selected date.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="form-check form-switch mb-3">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="staffHonorPreferredDentistSwitch"
                        checked={appointmentForm.honor_preferred_dentist}
                        onChange={(e) => handleHonorPreferredDentistToggle(e.target.checked)}
                        disabled={!preferredDentistInfo || !dentistScheduledOnSelectedDate}
                      />
                      <label className="form-check-label" htmlFor="staffHonorPreferredDentistSwitch">
                        Prefer assigning to recent dentist
                      </label>
                      {!preferredDentistInfo && (
                        <div className="form-text">
                          No recent dentist found for this patient yet; any dentist can be assigned.
                        </div>
                      )}
                      {preferredDentistInfo && appointmentForm.date && !dentistScheduledOnSelectedDate && (
                        <div className="form-text text-muted">
                          Dentist not available on this date.
                        </div>
                      )}
                    </div>

                    {/* Available Dentists Display - Optional Feature */}
                    {appointmentForm.date && (
                      <div className="mb-3">
                        <label className="form-label">Available Dentists</label>
                        {loadingDentists ? (
                          <div className="text-muted">
                            <i className="bi bi-hourglass-split me-1"></i>
                            Loading available dentists...
                          </div>
                        ) : availableDentists.length > 0 ? (
                          <div className="alert alert-info border-0 shadow-sm">
                            <div className="d-flex align-items-center justify-content-between">
                              <div>
                                <i className="bi bi-person-check me-2"></i>
                                <strong>{availableDentists.length} dentist{availableDentists.length !== 1 ? 's' : ''} available</strong>
                              </div>
                              <span className="badge bg-primary">{availableDentists.length}</span>
                            </div>
                            <div className="mt-2">
                              <small className="text-muted">Available dentists:</small>
                              <div className="mt-1">
                                {availableDentists.map((dentist, index) => (
                                  <span key={index} className="badge bg-light text-dark me-1 mb-1">
                                    {dentist.dentist_name} ({dentist.dentist_code})
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="alert alert-warning border-0 shadow-sm">
                            <i className="bi bi-exclamation-triangle me-2"></i>
                            No dentists available on this date
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mb-3">
                      <label className="form-label" htmlFor="staffAppointmentService">Service *</label>
                      <select
                        className="form-select"
                        value={appointmentForm.service_id}
                        onChange={(e) => handleServiceChange(e.target.value)}
                        disabled={!appointmentForm.date}
                        id="staffAppointmentService"
                      >
                        <option value="">{appointmentForm.date ? "Select a service" : "Please select a date first"}</option>
                        {availableServices.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name} –{" "}
                            {service.type === "promo"
                              ? `₱${Number(service.promo_price).toLocaleString()} (${service.discount_percent}% off)`
                              : service.type === "special"
                              ? `₱${Number(service.price).toLocaleString()} Special Service`
                              : `₱${Number(service.price).toLocaleString()}`}
                            {service.per_teeth_service ? ' per tooth' : ''}
                          </option>
                        ))}
                      </select>
                      {!appointmentForm.date && (
                        <div className="form-text text-muted">
                          <i className="bi bi-lock me-1"></i>
                          Please select a date first to enable service selection
                        </div>
                      )}
                    </div>

                    {/* Service Selection Info Alert */}
                    {selectedServiceDetails && (
                      <div className="alert alert-info border-0 shadow-sm mb-4" role="alert">
                        <div className="d-flex align-items-center justify-content-between flex-wrap">
                          <div className="d-flex align-items-center">
                            <i className="bi bi-check-circle me-3 fs-4"></i>
                            <div>
                              <strong>Service Selected:</strong><br/>
                              <span className="fs-5">{selectedServiceDetails.name}</span><br/>
                              <span className="text-info fw-semibold">
                                ₱{Number(selectedServiceDetails.price || selectedServiceDetails.promo_price).toLocaleString()}
                                {selectedServiceDetails.per_teeth_service ? ' per tooth' : ''}
                              </span>
                              {selectedServiceDetails.per_teeth_service && (
                                <div className="mt-2">
                                  <small className="text-info">
                                    <i className="bi bi-info-circle me-1"></i>
                                    Total cost depends on number of teeth treated
                                  </small>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Per-Teeth Service Recommendation */}
                    {selectedServiceDetails && selectedServiceDetails.per_teeth_service && (
                      <div className="alert alert-warning border-0 shadow-sm mb-4" role="alert">
                        <div className="d-flex align-items-start">
                          <i className="bi bi-lightbulb me-3 fs-4 text-warning"></i>
                          <div>
                            <h6 className="alert-heading text-warning mb-2">
                              <i className="bi bi-tooth me-2"></i>
                              Per-Teeth Service Information
                            </h6>
                            <p className="mb-2">
                              For per-teeth services, please enter the number of teeth that need treatment. This will determine:
                            </p>
                            <ul className="mb-2 ps-3">
                              <li>Appointment duration</li>
                              <li>Available time slots</li>
                              <li>Accurate cost calculation</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Teeth Count Selector for Per-Teeth Services - Show before time selection */}
                    {selectedServiceDetails && selectedServiceDetails.per_teeth_service && (
                      <div className="mb-3">
                        <label className="form-label">
                          Number of Teeth to be Treated *
                          <span className="text-muted ms-1">(Required for per-teeth services)</span>
                        </label>
                        
                        {/* Custom Teeth Count Selector */}
                        <div className="position-relative">
                          <input
                            type="number"
                            min="1"
                            max="32"
                            className="form-control"
                            value={appointmentForm.teeth_count}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === '' || (parseInt(value) >= 1 && parseInt(value) <= 32)) {
                                handleTeethCountChange(value);
                              }
                            }}
                            placeholder="Select or enter number of teeth"
                            style={{ paddingRight: '60px' }}
                          />
                          <button
                            type="button"
                            className="btn btn-outline-secondary position-absolute top-50 end-0 translate-middle-y me-2"
                            onClick={() => {
                              const modal = document.getElementById('teethCountModal');
                              if (modal) {
                                const bsModal = new bootstrap.Modal(modal);
                                bsModal.show();
                                
                                // Auto-scroll to selected teeth count after modal opens
                                setTimeout(() => {
                                  const roulette = modal.querySelector('.teeth-roulette');
                                  const selectedOption = modal.querySelector(`[data-teeth="${appointmentForm.teeth_count}"]`);
                                  if (roulette && selectedOption && appointmentForm.teeth_count) {
                                    const optionTop = selectedOption.offsetTop;
                                    const rouletteHeight = roulette.clientHeight;
                                    const optionHeight = selectedOption.clientHeight;
                                    roulette.scrollTop = optionTop - (rouletteHeight / 2) + (optionHeight / 2);
                                  }
                                }, 300);
                              }
                            }}
                            style={{ height: '32px', width: '40px', padding: '0' }}
                          >
                            <i className="bi bi-chevron-down"></i>
                          </button>
                        </div>

                        {/* Teeth Count Roulette Modal */}
                        <div className="modal fade" id="teethCountModal" tabIndex="-1" aria-hidden="true">
                          <div className="modal-dialog modal-dialog-centered">
                            <div className="modal-content">
                              <div className="modal-header">
                                <h5 className="modal-title">
                                  <i className="bi bi-tooth me-2"></i>
                                  Select Number of Teeth
                                </h5>
                                <button type="button" className="btn-close" data-bs-dismiss="modal"></button>
                              </div>
                              <div className="modal-body p-0">
                                <div 
                                  className="teeth-roulette"
                                  style={{
                                    height: '200px',
                                    overflowY: 'auto',
                                    padding: '10px',
                                    scrollBehavior: 'smooth',
                                    touchAction: 'pan-y',
                                    WebkitOverflowScrolling: 'touch'
                                  }}
                                  onScroll={(e) => {
                                    // Optional: Add scroll snapping effect
                                    e.target.scrollTop = Math.round(e.target.scrollTop / 50) * 50;
                                  }}
                                  onTouchStart={(e) => {
                                    // Add touch feedback
                                    e.target.style.backgroundColor = '#f8f9fa';
                                  }}
                                  onTouchEnd={(e) => {
                                    setTimeout(() => {
                                      e.target.style.backgroundColor = 'transparent';
                                    }, 150);
                                  }}
                                >
                                  {Array.from({ length: 32 }, (_, i) => i + 1).map((num) => (
                                    <div
                                      key={num}
                                      data-teeth={num}
                                      className={`teeth-option d-flex align-items-center justify-content-center p-3 border-bottom cursor-pointer ${
                                        appointmentForm.teeth_count == num ? 'bg-primary text-white' : 'bg-light'
                                      }`}
                                      onClick={() => {
                                        handleTeethCountChange(num.toString());
                                        const modal = document.getElementById('teethCountModal');
                                        if (modal) {
                                          const bsModal = bootstrap.Modal.getInstance(modal);
                                          bsModal.hide();
                                        }
                                      }}
                                      style={{
                                        minHeight: '50px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        userSelect: 'none'
                                      }}
                                      onMouseEnter={(e) => {
                                        if (appointmentForm.teeth_count != num) {
                                          e.target.style.backgroundColor = '#e9ecef';
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (appointmentForm.teeth_count != num) {
                                          e.target.style.backgroundColor = '#f8f9fa';
                                        }
                                      }}
                                    >
                                      <div className="text-center">
                                        <div className="fs-4 fw-bold">{num}</div>
                                        <div className="small">
                                          {num === 1 ? 'tooth' : 'teeth'}
                                        </div>
                                        {appointmentForm.teeth_count == num && (
                                          <div className="small">
                                            <i className="bi bi-check-circle-fill"></i>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="modal-footer">
                                <div className="w-100 text-center">
                                  <small className="text-muted">
                                    <i className="bi bi-info-circle me-1"></i>
                                    Swipe to scroll • Tap to select • Max 32 teeth
                                  </small>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="form-text">
                          <i className="bi bi-info-circle me-1"></i>
                          Enter the number of teeth that need treatment. Time slots will be calculated based on this.
                          {appointmentForm.teeth_count && (
                            <div className="mt-1">
                              <strong>Estimated cost:</strong> ₱{Number(selectedServiceDetails.price || selectedServiceDetails.promo_price) * parseInt(appointmentForm.teeth_count || 0).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mb-3">
                      <label className="form-label" htmlFor="staffAppointmentTimeSlot">Time Slot *</label>
                      {loadingSlots ? (
                        <div className="text-muted">Loading available slots...</div>
                      ) : availableSlots.length > 0 ? (
                        <>
                          {slotMetadataStaff?.preferred_dentist && (
                            <div className="alert alert-info border-0 shadow-sm mb-2">
                              <i className="bi bi-person-badge me-2"></i>
                              {appointmentForm.honor_preferred_dentist
                                ? "Scheduling with:"
                                : "Suggested dentist:"}{" "}
                              {slotMetadataStaff.preferred_dentist.name || slotMetadataStaff.preferred_dentist.code}
                            </div>
                          )}
                          {slotMetadataStaff && slotMetadataStaff.effective_honor_preferred_dentist === false && appointmentForm.honor_preferred_dentist && (
                            <div className="alert alert-warning border-0 shadow-sm mb-2">
                              <i className="bi bi-exclamation-triangle me-2"></i>
                              Preferred dentist is unavailable for the selected slot. Another dentist will be assigned.
                            </div>
                          )}
                        <select
                          className="form-select"
                          value={appointmentForm.start_time}
                          onChange={(e) => setAppointmentForm(prev => ({ ...prev, start_time: e.target.value }))}
                            id="staffAppointmentTimeSlot"
                        >
                          <option value="">Select time slot</option>
                          {availableSlots.map((slot) => (
                            <option key={slot} value={slot}>
                              {slot}
                            </option>
                          ))}
                        </select>
                        </>
                      ) : appointmentForm.service_id && appointmentForm.date ? (
                        <div className="text-muted">
                          {selectedServiceDetails && selectedServiceDetails.per_teeth_service && !appointmentForm.teeth_count ? 
                            "Please enter number of teeth first to see available time slots." :
                            "No available slots for this service on this date."
                          }
                        </div>
                      ) : (
                        <div className="text-muted">
                          {!appointmentForm.date ? "Please select a date first." : 
                           !appointmentForm.service_id ? "Please select a service first." : 
                           "Please select service and date first."}
                        </div>
                      )}
                    </div>

                    <div className="mb-3">
                      <label className="form-label">Payment Method *</label>
                      <select
                        className="form-select"
                        value={appointmentForm.payment_method}
                        onChange={(e) => setAppointmentForm(prev => ({ ...prev, payment_method: e.target.value }))}
                        disabled={!appointmentForm.date || !appointmentForm.service_id}
                      >
                        <option value="cash">Cash</option>
                        <option value="maya">Maya Payment</option>
                        <option value="hmo">HMO</option>
                      </select>
                      {(!appointmentForm.date || !appointmentForm.service_id) && (
                        <div className="form-text text-muted">
                          <i className="bi bi-lock me-1"></i>
                          Please select date and service first to enable payment method selection
                        </div>
                      )}
                    </div>

                    {appointmentForm.payment_method === 'hmo' && (
                      <div className="mb-3">
                        <label className="form-label">HMO (Optional)</label>
                        <select
                          className="form-select"
                          value={appointmentForm.patient_hmo_id}
                          onChange={(e) => setAppointmentForm(prev => ({ ...prev, patient_hmo_id: e.target.value }))}
                        >
                          <option value="">No HMO selected</option>
                          {/* HMO options would be loaded here if patient has HMOs */}
                        </select>
                      </div>
                    )}

                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowMakeAppointmentModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleCreateAppointment}
                  disabled={creatingAppointment}
                >
                  {creatingAppointment ? "Creating..." : "Create Appointment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Time Block Modal */}
      <TimeBlockModal 
        show={showTimeBlockModal} 
        onClose={() => setShowTimeBlockModal(false)} 
      />
    </div>
  );
}

export default VisitTrackerManager;
