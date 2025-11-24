import api from "./api";

const patientRecordsApi = {
  searchPatients(params = {}) {
    return api.get("/api/admin/patient-records/search", { params });
  },
  getPatientProfile(patientId, params = {}) {
    return api.get(`/api/admin/patient-records/${patientId}`, { params });
  },
  getPatientVisits(patientId, params = {}) {
    return api.get(`/api/admin/patient-records/${patientId}/visits`, {
      params,
    });
  },
  getVisitDetail(visitId) {
    return api.get(`/api/admin/patient-records/visits/${visitId}`);
  },
};

export default patientRecordsApi;

