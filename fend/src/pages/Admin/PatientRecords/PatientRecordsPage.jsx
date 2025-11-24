import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import patientRecordsApi from "../../../api/patientRecords";
import "./PatientRecordsPage.css";

const INITIAL_SEARCH_FORM = {
  query: "",
  patientId: "",
  contact: "",
};

const DEFAULT_VISIT_FILTERS = {
  startDate: "",
  endDate: "",
  visitType: "",
  status: "",
  dentist: "",
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
];

const VISIT_TYPE_OPTIONS = [
  { value: "", label: "All visit types" },
  { value: "walk-in", label: "Walk-in" },
  { value: "appointment", label: "Appointment" },
];

const statusVariant = {
  pending: "warning",
  active: "info",
  in_progress: "info",
  completed: "success",
  cancelled: "secondary",
  no_show: "dark",
};

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString() : "—";

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString() : "—";

const formatStatus = (status) => {
  if (!status) return "Unknown";
  return status
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
};

const buildSearchParams = (formState) => {
  const params = {};
  if (formState?.query?.trim()) params.query = formState.query.trim();
  if (formState?.patientId?.trim())
    params.patient_id = formState.patientId.trim();
  if (formState?.contact?.trim()) params.contact = formState.contact.trim();
  return params;
};

const buildVisitParams = (filtersState, page, perPage) => {
  const params = { page, per_page: perPage };
  if (filtersState?.startDate) params.start_date = filtersState.startDate;
  if (filtersState?.endDate) params.end_date = filtersState.endDate;
  if (filtersState?.visitType) params.visit_type = filtersState.visitType;
  if (filtersState?.status) params.status = filtersState.status;
  if (filtersState?.dentist?.trim()) {
    params.dentist_schedule_id = filtersState.dentist.trim();
  }
  return params;
};

const PatientRecordsPage = () => {
  const [searchForm, setSearchForm] = useState({ ...INITIAL_SEARCH_FORM });
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);

  const [profileLoading, setProfileLoading] = useState(false);
  const [patientProfile, setPatientProfile] = useState(null);

  const [visitFilters, setVisitFilters] = useState({
    ...DEFAULT_VISIT_FILTERS,
  });
  const [visitPage, setVisitPage] = useState(1);
  const [visitPerPage, setVisitPerPage] = useState(10);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visits, setVisits] = useState([]);
  const [visitMeta, setVisitMeta] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
    per_page: visitPerPage,
  });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [visitDetail, setVisitDetail] = useState(null);

  const fetchPatients = useCallback(async (formState = INITIAL_SEARCH_FORM) => {
    setPatientsLoading(true);
    try {
      const params = buildSearchParams(formState ?? INITIAL_SEARCH_FORM);
      const { data } = await patientRecordsApi.searchPatients(params);
      const rows = data?.data ?? [];
      setPatients(rows);
      setSelectedPatientId((prev) => {
        if (!rows.length) return null;
        if (!prev) return rows[0].id;
        const stillVisible = rows.some((row) => row.id === prev);
        return stillVisible ? prev : rows[0].id;
      });
    } catch (error) {
      console.error("Failed to fetch patients", error);
      toast.error("Unable to load patients. Please try again.");
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  const fetchPatientProfile = useCallback(async (patientId) => {
    setProfileLoading(true);
    try {
      const { data } = await patientRecordsApi.getPatientProfile(patientId);
      setPatientProfile(data?.data ?? null);
    } catch (error) {
      console.error("Failed to fetch patient profile", error);
      toast.error("Unable to load patient profile.");
      setPatientProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const fetchVisits = useCallback(
    async (
      patientId,
      filtersState = DEFAULT_VISIT_FILTERS,
      pageValue = 1,
      perPageValue = 10
    ) => {
      setVisitsLoading(true);
      try {
        const params = buildVisitParams(filtersState, pageValue, perPageValue);
        const { data } = await patientRecordsApi.getPatientVisits(
          patientId,
          params
        );
        setVisits(data?.data ?? []);
        setVisitMeta(
          data?.meta ?? {
            current_page: pageValue,
            last_page: pageValue,
            total: data?.data?.length ?? 0,
            per_page: perPageValue,
          }
        );
      } catch (error) {
        console.error("Failed to fetch visits", error);
        toast.error("Unable to load patient visits.");
        setVisits([]);
      } finally {
        setVisitsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchPatients(INITIAL_SEARCH_FORM);
  }, [fetchPatients]);

  useEffect(() => {
    if (!selectedPatientId) return;
    fetchPatientProfile(selectedPatientId);
  }, [selectedPatientId, fetchPatientProfile]);

  useEffect(() => {
    if (selectedPatientId) return;
    setPatientProfile(null);
    setVisits([]);
    setVisitMeta({
      current_page: 1,
      last_page: 1,
      total: 0,
      per_page: visitPerPage,
    });
  }, [selectedPatientId, visitPerPage]);

  useEffect(() => {
    if (!selectedPatientId) return;
    fetchVisits(selectedPatientId, visitFilters, visitPage, visitPerPage);
  }, [selectedPatientId, visitFilters, visitPage, visitPerPage, fetchVisits]);

  const handleSearchSubmit = async (event) => {
    event.preventDefault();
    await fetchPatients(searchForm);
  };

  const handleSelectPatient = (patientId) => {
    setSelectedPatientId(patientId);
    setVisitPage(1);
    setVisitFilters({ ...DEFAULT_VISIT_FILTERS });
  };

  const handleFilterChange = (field, value) => {
    setVisitFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
    setVisitPage(1);
  };

  const handlePerPageChange = (event) => {
    setVisitPerPage(Number(event.target.value));
    setVisitPage(1);
  };

  const totalPages = useMemo(
    () => visitMeta?.last_page ?? 1,
    [visitMeta?.last_page]
  );

  const openVisitDetails = async (visitId) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setVisitDetail(null);
    try {
      const { data } = await patientRecordsApi.getVisitDetail(visitId);
      setVisitDetail(data?.data ?? null);
    } catch (error) {
      console.error("Failed to load visit detail", error);
      toast.error("Unable to load visit details.");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeVisitDetails = () => {
    setDetailOpen(false);
    setVisitDetail(null);
  };

  const handlePrint = () => {
    if (!visitDetail) return;
    window.print();
  };

  return (
    <div className="patient-records-page py-3">
      <div className="d-flex flex-column flex-lg-row gap-3">
        <section className="patient-records-card shadow-sm">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title">Search for a patient</h5>
              <p className="text-muted small mb-3">
                Search by name, patient ID, or contact number. Results only show
                basic profile details.
              </p>
              <form onSubmit={handleSearchSubmit}>
                <div className="mb-3">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Maria Santos"
                    value={searchForm.query}
                    onChange={(e) =>
                      setSearchForm((prev) => ({
                        ...prev,
                        query: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Patient ID</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Numeric ID"
                    value={searchForm.patientId}
                    onChange={(e) =>
                      setSearchForm((prev) => ({
                        ...prev,
                        patientId: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Contact number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="09xx..."
                    value={searchForm.contact}
                    onChange={(e) =>
                      setSearchForm((prev) => ({
                        ...prev,
                        contact: e.target.value,
                      }))
                    }
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary w-100"
                  disabled={patientsLoading}
                >
                  {patientsLoading ? (
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                    />
                  ) : null}
                  Search
                </button>
              </form>
            </div>
            <div className="patient-list list-group">
              {patientsLoading ? (
                <div className="text-center py-4 text-muted">
                  <div className="spinner-border text-secondary mb-2" />
                  <div>Loading patients…</div>
                </div>
              ) : patients.length === 0 ? (
                <div className="text-center py-4 text-muted">
                  No patients found. Refine your search and try again.
                </div>
              ) : (
                patients.map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    className={`list-group-item list-group-item-action ${
                      selectedPatientId === patient.id ? "active" : ""
                    }`}
                    onClick={() => handleSelectPatient(patient.id)}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <div className="fw-semibold">{patient.full_name}</div>
                        <div className="small opacity-75">
                          {patient.contact_number || "No contact on file"}
                        </div>
                      </div>
                      <span className="badge bg-light text-dark">
                        {patient.patient_code}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="flex-grow-1">
          {!selectedPatientId ? (
            <div className="h-100 d-flex align-items-center justify-content-center">
              <div className="text-center text-muted">
                <i className="bi bi-search display-5 d-block mb-3"></i>
                <p className="mb-0">
                  Select a patient to see their profile and visit history.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="card mb-3 shadow-sm">
                <div className="card-body">
                  {profileLoading ? (
                    <div className="text-center text-muted py-4">
                      <div className="spinner-border text-secondary" />
                    </div>
                  ) : patientProfile ? (
                    <>
                      <div className="d-flex flex-wrap justify-content-between gap-2">
                        <div>
                          <h4 className="mb-0">{patientProfile.full_name}</h4>
                          <p className="text-muted mb-1">
                            Patient ID: {patientProfile.patient_code}
                          </p>
                        </div>
                        <div className="text-end">
                          <span className="badge bg-secondary text-uppercase">
                            {patientProfile.sex || "Unspecified"}
                          </span>
                          <div className="small text-muted mt-1">
                            Age: {patientProfile.age ?? "—"}
                          </div>
                        </div>
                      </div>
                      <div className="row g-3 mt-2">
                        <div className="col-sm-6 col-lg-3">
                          <div className="text-muted small">Contact</div>
                          <div>{patientProfile.contact_number || "—"}</div>
                        </div>
                        <div className="col-sm-6 col-lg-3">
                          <div className="text-muted small">Birthdate</div>
                          <div>{formatDate(patientProfile.birthdate)}</div>
                        </div>
                        <div className="col-sm-12 col-lg-6">
                          <div className="text-muted small">Address</div>
                          <div>{patientProfile.address || "—"}</div>
                        </div>
                      </div>
                      <hr />
                      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <div>
                          <div className="text-muted small">
                            Linked user account
                          </div>
                          {patientProfile.user ? (
                            <div>
                              {patientProfile.user.name} ·{" "}
                              {patientProfile.user.email}
                            </div>
                          ) : (
                            <div className="text-muted">Not linked</div>
                          )}
                        </div>
                        {patientProfile.archived_at ? (
                          <span className="badge bg-danger-subtle text-danger">
                            Archived on{" "}
                            {formatDateTime(patientProfile.archived_at)}
                          </span>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="text-muted">No profile data available.</div>
                  )}
                </div>
              </div>

              <div className="card shadow-sm">
                <div className="card-header bg-white border-bottom-0">
                  <ul className="nav nav-tabs card-header-tabs">
                    <li className="nav-item">
                      <span className="nav-link active">
                        Visits (notes hidden until you open a visit)
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="card-body">
                  <div className="row g-3 align-items-end mb-3 visits-filter-row">
                    <div className="col-sm-6 col-lg-3">
                      <label className="form-label">Date from</label>
                      <input
                        type="date"
                        className="form-control"
                        value={visitFilters.startDate}
                        onChange={(e) =>
                          handleFilterChange("startDate", e.target.value)
                        }
                      />
                    </div>
                    <div className="col-sm-6 col-lg-3">
                      <label className="form-label">Date to</label>
                      <input
                        type="date"
                        className="form-control"
                        value={visitFilters.endDate}
                        onChange={(e) =>
                          handleFilterChange("endDate", e.target.value)
                        }
                      />
                    </div>
                    <div className="col-sm-6 col-lg-3">
                      <label className="form-label">Visit type</label>
                      <select
                        className="form-select"
                        value={visitFilters.visitType}
                        onChange={(e) =>
                          handleFilterChange("visitType", e.target.value)
                        }
                      >
                        {VISIT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-sm-6 col-lg-3">
                      <label className="form-label">Status</label>
                      <select
                        className="form-select"
                        value={visitFilters.status}
                        onChange={(e) =>
                          handleFilterChange("status", e.target.value)
                        }
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-sm-6 col-lg-4">
                      <label className="form-label">
                        Dentist schedule ID (optional)
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Enter ID to filter by dentist"
                        value={visitFilters.dentist}
                        onChange={(e) =>
                          handleFilterChange("dentist", e.target.value)
                        }
                      />
                    </div>
                    <div className="col-sm-6 col-lg-2">
                      <label className="form-label">Rows per page</label>
                      <select
                        className="form-select"
                        value={visitPerPage}
                        onChange={handlePerPageChange}
                      >
                        {[10, 25, 50].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-lg-6 text-lg-end text-muted small">
                      Notes remain hidden here. Use “View details” to read and
                      print dentist notes.
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table align-middle">
                      <thead>
                        <tr>
                          <th>Visit ID</th>
                          <th>Date</th>
                          <th>Service</th>
                          <th>Type</th>
                          <th>Status</th>
                          <th>Dentist</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visitsLoading ? (
                          <tr>
                            <td colSpan="7" className="text-center text-muted">
                              <div className="spinner-border text-secondary" />
                            </td>
                          </tr>
                        ) : visits.length === 0 ? (
                          <tr>
                            <td colSpan="7" className="text-center text-muted">
                              No visits match the selected filters.
                            </td>
                          </tr>
                        ) : (
                          visits.map((visit) => (
                            <tr key={visit.id}>
                              <td>
                                <div className="fw-semibold">#{visit.id}</div>
                                <div className="small text-muted">
                                  {visit.visit_code || "No code"}
                                </div>
                              </td>
                              <td>
                                <div>{formatDate(visit.visit_date)}</div>
                                <div className="small text-muted">
                                  {formatDateTime(visit.start_time)}
                                </div>
                              </td>
                              <td>{visit.service?.name || "—"}</td>
                              <td className="text-capitalize">
                                {visit.visit_type
                                  ? visit.visit_type.replace("-", " ")
                                  : "—"}
                              </td>
                              <td>
                                <span
                                  className={`badge bg-${
                                    statusVariant[visit.status] || "secondary"
                                  }`}
                                >
                                  {formatStatus(visit.status)}
                                </span>
                              </td>
                              <td>
                                <div>{visit.dentist?.name || "—"}</div>
                                <div className="small text-muted">
                                  {visit.dentist?.code || ""}
                                </div>
                              </td>
                              <td className="text-end">
                                <button
                                  type="button"
                                  className="btn btn-outline-primary btn-sm"
                                  onClick={() => openVisitDetails(visit.id)}
                                >
                                  View details
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {visits.length > 0 && (
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 small">
                      <div>
                        Page {visitMeta?.current_page ?? 1} of {totalPages} ·{" "}
                        {visitMeta?.total ?? visits.length} visits
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          disabled={(visitMeta?.current_page ?? 1) <= 1}
                          onClick={() =>
                            setVisitPage((prev) => Math.max(prev - 1, 1))
                          }
                        >
                          Previous
                        </button>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          disabled={visitMeta?.current_page >= totalPages}
                          onClick={() =>
                            setVisitPage((prev) =>
                              Math.min(prev + 1, totalPages)
                            )
                          }
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {detailOpen && (
        <div className="visit-detail-backdrop" role="dialog" aria-modal="true">
          <div className="visit-detail-panel">
            <div className="d-flex justify-content-between align-items-start mb-3">
              <h5 className="mb-0">Visit details & dentist notes</h5>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={closeVisitDetails}
              >
                Close
              </button>
            </div>
            {detailLoading ? (
              <div className="text-center text-muted py-5">
                <div className="spinner-border text-primary" />
              </div>
            ) : visitDetail ? (
              <>
                <div className="visit-printable" aria-live="polite">
                  <div className="mb-3">
                    <div className="text-muted small">Visit ID</div>
                    <div className="fw-semibold">
                      #{visitDetail.visit?.id} ·{" "}
                      {visitDetail.visit?.visit_code || "No code"}
                    </div>
                  </div>
                  <div className="row g-3">
                    <div className="col-sm-6">
                      <div className="text-muted small">Service</div>
                      <div>{visitDetail.visit?.service?.name || "—"}</div>
                    </div>
                    <div className="col-sm-6">
                      <div className="text-muted small">Dentist</div>
                      <div>
                        {visitDetail.visit?.dentist?.name || "Unassigned"}
                      </div>
                      <div className="small text-muted">
                        {visitDetail.visit?.dentist?.email || ""}
                      </div>
                    </div>
                    <div className="col-sm-6">
                      <div className="text-muted small">Visit date</div>
                      <div>{formatDate(visitDetail.visit?.visit_date)}</div>
                    </div>
                    <div className="col-sm-6">
                      <div className="text-muted small">Time</div>
                      <div>
                        {formatDateTime(visitDetail.visit?.start_time)} –{" "}
                        {formatDateTime(visitDetail.visit?.end_time)}
                      </div>
                    </div>
                  </div>
                  <hr />
                  <div className="mb-3">
                    <div className="text-muted small">Dentist notes</div>
                    <p>{visitDetail.notes?.dentist_notes || "No notes"}</p>
                  </div>
                  <div className="mb-3">
                    <div className="text-muted small">Findings</div>
                    <p>{visitDetail.notes?.findings || "—"}</p>
                  </div>
                  <div className="mb-3">
                    <div className="text-muted small">Treatment plan</div>
                    <p>{visitDetail.notes?.treatment_plan || "—"}</p>
                  </div>
                  <div className="mb-3">
                    <div className="text-muted small">Teeth treated</div>
                    <p>{visitDetail.notes?.teeth_treated || "—"}</p>
                  </div>
                  <div className="small text-muted">
                    Last updated: {formatDateTime(visitDetail.notes?.updated_at)}
                  </div>
                </div>
                <div className="d-flex justify-content-between align-items-center mt-3">
                  <div className="text-muted small notes-privacy-hint">
                    Downloading notes is disabled. Printouts remain within the
                    clinic for confidentiality.
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handlePrint}
                  >
                    Print notes
                  </button>
                </div>
              </>
            ) : (
              <div className="text-muted">No details available.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientRecordsPage;

