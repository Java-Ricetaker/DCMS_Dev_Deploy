import { useState, useEffect } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

const computeAge = (dateStr) => {
  if (!dateStr) return "";

  const birthDate = new Date(dateStr);
  if (Number.isNaN(birthDate.getTime())) {
    return "";
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  if (age < 0) {
    return 0;
  }

  if (age > 150) {
    return 150;
  }

  return age;
};

const sanitizeAge = (value) => {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return "";
  }

  const rounded = Math.round(numeric);
  if (rounded < 0) return 0;
  if (rounded > 150) return 150;
  return rounded;
};

export default function MedicalHistoryFormModal({ visit, onClose, onSuccess }) {
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [previousHistoryExists, setPreviousHistoryExists] = useState(false);
  const [previousHistoryDate, setPreviousHistoryDate] = useState(null);

  useEffect(() => {
    loadFormData();
  }, [visit]);

  const loadFormData = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/api/visits/${visit.id}/medical-history-form`);
      const data = response.data.form_data || {};
      const calculatedAge = computeAge(data.date_of_birth);
      const resolvedAge =
        calculatedAge !== ""
          ? calculatedAge
          : sanitizeAge(data.age);

      setFormData({
        ...data,
        age: resolvedAge,
      });
      setPreviousHistoryExists(response.data.previous_history_exists || false);
      setPreviousHistoryDate(response.data.previous_history_date || null);
    } catch (err) {
      console.error("Failed to load medical history form:", err);
      setError(err.response?.data?.message || "Failed to load form data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    if (field === "date_of_birth") {
      const calculatedAge = computeAge(value);
      setFormData(prev => ({
        ...prev,
        date_of_birth: value,
        age: value ? (calculatedAge === "" ? "" : calculatedAge) : "",
      }));
      return;
    }

    if (field === "age") {
      setFormData(prev => ({
        ...prev,
        age: sanitizeAge(value),
      }));
      return;
    }

    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (field, checked) => {
    setFormData(prev => ({ ...prev, [field]: checked }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await api.post(`/api/visits/${visit.id}/medical-history`, formData);
      
      // Show success message with visit code
      toast.success(`Medical history completed successfully!\n\nVisit Code: ${response.data.visit.visit_code}\n\nYou can now send this code to the dentist.`);
      
      if (onSuccess) {
        onSuccess(response.data);
      }
      
      onClose();
    } catch (err) {
      console.error("Failed to submit medical history:", err);
      if (err.response?.data?.errors) {
        // Validation errors
        const errors = Object.values(err.response.data.errors).flat().join("\n");
        setError(errors);
      } else {
        setError(err.response?.data?.message || "Failed to submit medical history. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="modal show d-block" tabIndex="-1" style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        zIndex: 1050,
      }}>
        <div className="modal-dialog modal-xl modal-dialog-scrollable" style={{
          margin: "1rem auto",
          maxHeight: "calc(100vh - 2rem)",
        }}>
          <div className="modal-content">
            <div className="modal-body text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <div className="mt-3">Loading medical history form...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

    return (
    <div className="modal show d-block" tabIndex="-1" style={{       
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      zIndex: 1050,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
    }}>
      <div className="modal-dialog modal-xl modal-dialog-scrollable" style={{
        margin: "1rem auto",
        maxHeight: "calc(100vh - 2rem)",
      }}>
        <div className="modal-content" style={{
          maxHeight: "calc(100vh - 2rem)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <div className="modal-header flex-shrink-0" style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "#fff" }}>
            <h5 className="modal-title">
              <i className="bi bi-file-medical me-2"></i>
              Dental and Medical History Form
            </h5>
            <button
              className="btn-close"
              onClick={onClose}
              disabled={submitting}
            ></button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
            <div className="modal-body" style={{ overflowY: "auto", overflowX: "hidden", flex: "1 1 auto", minHeight: 0 }}>
              {/* Alert for previous history */}
              {previousHistoryExists && (
                <div className="alert alert-info">
                  <i className="bi bi-info-circle me-2"></i>
                  <strong>Previous medical history found.</strong> Please review and update all information if the patient has visited other clinics or if there have been any changes.
                  {previousHistoryDate && (
                    <div className="mt-2">
                      <small>Last completed: {new Date(previousHistoryDate).toLocaleDateString()}</small>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="alert alert-danger">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {error}
                </div>
              )}

              {/* Patient Information */}
              <div className="card mb-4">
                <div className="card-header bg-primary text-white">
                  <h6 className="mb-0"><i className="bi bi-person me-2"></i>Patient Information</h6>
                </div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Full Name *</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.full_name || ""}
                        onChange={(e) => handleInputChange("full_name", e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-md-3 mb-3">
                      <label className="form-label">Age</label>
                      <input
                        type="number"
                        className="form-control"
                        value={formData.age || ""}
                        onChange={(e) => handleInputChange("age", e.target.value)}
                        min="0"
                        max="150"
                      />
                    </div>
                    <div className="col-md-3 mb-3">
                      <label className="form-label">Sex</label>
                      <select
                        className="form-select"
                        value={formData.sex || ""}
                        onChange={(e) => handleInputChange("sex", e.target.value)}
                      >
                        <option value="">Select</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Address</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.address || ""}
                        onChange={(e) => handleInputChange("address", e.target.value)}
                      />
                    </div>
                    <div className="col-md-3 mb-3">
                      <label className="form-label">Contact Number</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.contact_number || ""}
                        onChange={(e) => handleInputChange("contact_number", e.target.value)}
                      />
                    </div>
                    <div className="col-md-3 mb-3">
                      <label className="form-label">Date of Birth</label>
                      <input
                        type="date"
                        className="form-control"
                        value={formData.date_of_birth || ""}
                        onChange={(e) => handleInputChange("date_of_birth", e.target.value)}
                      />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Occupation</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.occupation || ""}
                        onChange={(e) => handleInputChange("occupation", e.target.value)}
                      />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Email</label>
                      <input
                        type="email"
                        className="form-control"
                        value={formData.email || ""}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                      />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Previous Dentist</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.previous_dentist || ""}
                        onChange={(e) => handleInputChange("previous_dentist", e.target.value)}
                      />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Last Dental Visit</label>
                      <input
                        type="date"
                        className="form-control"
                        value={formData.last_dental_visit || ""}
                        onChange={(e) => handleInputChange("last_dental_visit", e.target.value)}
                      />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Physician Name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.physician_name || ""}
                        onChange={(e) => handleInputChange("physician_name", e.target.value)}
                      />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Physician Address</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.physician_address || ""}
                        onChange={(e) => handleInputChange("physician_address", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Health Questions */}
              <div className="card mb-4">
                <div className="card-header bg-primary text-white">
                  <h6 className="mb-0"><i className="bi bi-heart-pulse me-2"></i>Health Questions</h6>
                </div>
                <div className="card-body">
                  <div className="mb-3">
                    <label className="form-check-label">
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        checked={formData.in_good_health || false}
                        onChange={(e) => handleCheckboxChange("in_good_health", e.target.checked)}
                      />
                      Are you in good health?
                    </label>
                  </div>
                  <div className="mb-3">
                    <label className="form-check-label">
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        checked={formData.under_medical_treatment || false}
                        onChange={(e) => handleCheckboxChange("under_medical_treatment", e.target.checked)}
                      />
                      Are you under medical treatment now?
                    </label>
                    {formData.under_medical_treatment && (
                      <textarea
                        className="form-control mt-2"
                        rows="2"
                        placeholder="Please provide details..."
                        value={formData.medical_treatment_details || ""}
                        onChange={(e) => handleInputChange("medical_treatment_details", e.target.value)}
                      />
                    )}
                  </div>
                  <div className="mb-3">
                    <label className="form-check-label">
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        checked={formData.serious_illness_surgery || false}
                        onChange={(e) => handleCheckboxChange("serious_illness_surgery", e.target.checked)}
                      />
                      Have you had any serious illness or operation?
                    </label>
                    {formData.serious_illness_surgery && (
                      <textarea
                        className="form-control mt-2"
                        rows="2"
                        placeholder="Please provide details..."
                        value={formData.illness_surgery_details || ""}
                        onChange={(e) => handleInputChange("illness_surgery_details", e.target.value)}
                      />
                    )}
                  </div>
                  <div className="mb-3">
                    <label className="form-check-label">
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        checked={formData.hospitalized || false}
                        onChange={(e) => handleCheckboxChange("hospitalized", e.target.checked)}
                      />
                      Have you been hospitalized in the past 2 years?
                    </label>
                    {formData.hospitalized && (
                      <textarea
                        className="form-control mt-2"
                        rows="2"
                        placeholder="Please provide details..."
                        value={formData.hospitalization_details || ""}
                        onChange={(e) => handleInputChange("hospitalization_details", e.target.value)}
                      />
                    )}
                  </div>
                  <div className="mb-3">
                    <label className="form-check-label">
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        checked={formData.taking_medications || false}
                        onChange={(e) => handleCheckboxChange("taking_medications", e.target.checked)}
                      />
                      Are you taking any medications?
                    </label>
                    {formData.taking_medications && (
                      <textarea
                        className="form-control mt-2"
                        rows="2"
                        placeholder="Please list all medications..."
                        value={formData.medications_list || ""}
                        onChange={(e) => handleInputChange("medications_list", e.target.value)}
                      />
                    )}
                  </div>
                  <div className="mb-3">
                    <label className="form-check-label">
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        checked={formData.uses_tobacco || false}
                        onChange={(e) => handleCheckboxChange("uses_tobacco", e.target.checked)}
                      />
                      Do you use tobacco?
                    </label>
                  </div>
                  <div className="mb-3">
                    <label className="form-check-label">
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        checked={formData.uses_alcohol_drugs || false}
                        onChange={(e) => handleCheckboxChange("uses_alcohol_drugs", e.target.checked)}
                      />
                      Do you use alcohol or drugs?
                    </label>
                  </div>
                </div>
              </div>

              {/* Allergies */}
              <div className="card mb-4">
                <div className="card-header bg-danger text-white">
                  <h6 className="mb-0"><i className="bi bi-exclamation-triangle me-2"></i>Allergies</h6>
                </div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-check-label">
                        <input
                          type="checkbox"
                          className="form-check-input me-2"
                          checked={formData.allergic_local_anesthetic || false}
                          onChange={(e) => handleCheckboxChange("allergic_local_anesthetic", e.target.checked)}
                        />
                        Local Anesthetic
                      </label>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-check-label">
                        <input
                          type="checkbox"
                          className="form-check-input me-2"
                          checked={formData.allergic_penicillin || false}
                          onChange={(e) => handleCheckboxChange("allergic_penicillin", e.target.checked)}
                        />
                        Penicillin
                      </label>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-check-label">
                        <input
                          type="checkbox"
                          className="form-check-input me-2"
                          checked={formData.allergic_sulfa || false}
                          onChange={(e) => handleCheckboxChange("allergic_sulfa", e.target.checked)}
                        />
                        Sulfa Drugs
                      </label>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-check-label">
                        <input
                          type="checkbox"
                          className="form-check-input me-2"
                          checked={formData.allergic_aspirin || false}
                          onChange={(e) => handleCheckboxChange("allergic_aspirin", e.target.checked)}
                        />
                        Aspirin
                      </label>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-check-label">
                        <input
                          type="checkbox"
                          className="form-check-input me-2"
                          checked={formData.allergic_latex || false}
                          onChange={(e) => handleCheckboxChange("allergic_latex", e.target.checked)}
                        />
                        Latex
                      </label>
                    </div>
                    <div className="col-md-12 mb-3">
                      <label className="form-label">Other Allergies</label>
                      <textarea
                        className="form-control"
                        rows="2"
                        placeholder="Please specify..."
                        value={formData.allergic_others || ""}
                        onChange={(e) => handleInputChange("allergic_others", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* For Women Only */}
              {formData.sex === "female" && (
                <div className="card mb-4">
                  <div className="card-header bg-info text-white">
                    <h6 className="mb-0"><i className="bi bi-gender-female me-2"></i>For Women Only</h6>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <label className="form-check-label">
                        <input
                          type="checkbox"
                          className="form-check-input me-2"
                          checked={formData.is_pregnant || false}
                          onChange={(e) => handleCheckboxChange("is_pregnant", e.target.checked)}
                        />
                        Are you pregnant?
                      </label>
                    </div>
                    <div className="mb-3">
                      <label className="form-check-label">
                        <input
                          type="checkbox"
                          className="form-check-input me-2"
                          checked={formData.is_nursing || false}
                          onChange={(e) => handleCheckboxChange("is_nursing", e.target.checked)}
                        />
                        Are you nursing?
                      </label>
                    </div>
                    <div className="mb-3">
                      <label className="form-check-label">
                        <input
                          type="checkbox"
                          className="form-check-input me-2"
                          checked={formData.taking_birth_control || false}
                          onChange={(e) => handleCheckboxChange("taking_birth_control", e.target.checked)}
                        />
                        Are you taking birth control pills?
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Vital Information */}
              <div className="card mb-4">
                <div className="card-header bg-success text-white">
                  <h6 className="mb-0"><i className="bi bi-clipboard-pulse me-2"></i>Vital Information</h6>
                </div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-md-4 mb-3">
                      <label className="form-label">Blood Type</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g., O+, A-, etc."
                        value={formData.blood_type || ""}
                        onChange={(e) => handleInputChange("blood_type", e.target.value)}
                      />
                    </div>
                    <div className="col-md-4 mb-3">
                      <label className="form-label">Blood Pressure</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g., 120/80"
                        value={formData.blood_pressure || ""}
                        onChange={(e) => handleInputChange("blood_pressure", e.target.value)}
                      />
                    </div>
                    <div className="col-md-4 mb-3">
                      <label className="form-label">Bleeding Time</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.bleeding_time || ""}
                        onChange={(e) => handleInputChange("bleeding_time", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Medical Conditions */}
              <div className="card mb-4">
                <div className="card-header bg-warning text-dark">
                  <h6 className="mb-0"><i className="bi bi-clipboard2-pulse me-2"></i>Medical Conditions</h6>
                </div>
                <div className="card-body">
                  <div className="row">
                    {[
                      "high_blood_pressure",
                      "low_blood_pressure",
                      "heart_disease",
                      "heart_murmur",
                      "chest_pain",
                      "stroke",
                      "diabetes",
                      "hepatitis",
                      "tuberculosis",
                      "kidney_disease",
                      "cancer",
                      "asthma",
                      "anemia",
                      "arthritis",
                      "epilepsy",
                      "aids_hiv",
                      "stomach_troubles",
                      "thyroid_problems",
                      "hay_fever",
                      "head_injuries",
                      "rapid_weight_loss",
                      "joint_replacement",
                      "radiation_therapy",
                      "swollen_ankles",
                    ].map((condition) => (
                      <div key={condition} className="col-md-6 mb-2">
                        <label className="form-check-label">
                          <input
                            type="checkbox"
                            className="form-check-input me-2"
                            checked={formData[condition] || false}
                            onChange={(e) => handleCheckboxChange(condition, e.target.checked)}
                          />
                          {condition.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <label className="form-label">Other Conditions</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      placeholder="Please specify any other medical conditions..."
                      value={formData.other_conditions || ""}
                      onChange={(e) => handleInputChange("other_conditions", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer flex-shrink-0" style={{ position: "sticky", bottom: 0, backgroundColor: "#fff", borderTop: "1px solid #dee2e6" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Submitting...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check-circle me-2"></i>
                    Submit Medical History
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
