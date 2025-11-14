import { useEffect, useState } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

function ClinicCalendarManager() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newIsOpen, setNewIsOpen] = useState(true);
  const [newOpenTime, setNewOpenTime] = useState("");
  const [newCloseTime, setNewCloseTime] = useState("");
  const [newNote, setNewNote] = useState("");
  const [existingOverride, setExistingOverride] = useState(null);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState(null);

  useEffect(() => { fetchEntries(); }, []);

  const fetchEntries = async () => {
    try {
      const res = await api.get("/api/clinic-calendar");
      setEntries(res.data);
    } catch (err) {
      console.error("Failed to fetch clinic calendar", err);
    } finally {
      setLoading(false);
    }
  };

  // OPTIONAL: resolve the date to prefill from weekly defaults or existing override
  useEffect(() => {
    const fetchResolvedSchedule = async () => {
      if (!newDate) return;
      try {
        const res = await api.get("/api/clinic-calendar/resolve", { params: { date: newDate }});
        const { source, data } = res.data; // expect { source: 'override'|'weekly', data: {...} }
        if (source === "override") {
          setExistingOverride(data);
          setNewIsOpen(!!data.is_open);
          setNewOpenTime(data.open_time ?? "");
          setNewCloseTime(data.close_time ?? "");
          setNewNote(data.note ?? "");
          toast("⚠️ This date already has an override. You are editing it.", { icon: "⚠️" });
        } else {
          setExistingOverride(null);
          setNewIsOpen(!!data.is_open);
          setNewOpenTime(data.open_time ?? "");
          setNewCloseTime(data.close_time ?? "");
          setNewNote(data.note ?? "");
        }
      } catch (err) {
        // If /resolve is not implemented, you can ignore this block or remove it.
        console.warn("Resolve not available; continuing without it.");
      }
    };
    fetchResolvedSchedule();
  }, [newDate]);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        date: newDate,
        is_open: newIsOpen,
        open_time: newIsOpen ? normTime(newOpenTime) : null,
        close_time: newIsOpen ? normTime(newCloseTime) : null,
        note: newNote || null,
        // DO NOT send dentist_count or capacity here
      };

      if (existingOverride) {
        await api.put(`/api/clinic-calendar/${existingOverride.id}`, payload);
      } else {
        await api.post("/api/clinic-calendar", payload);
      }

      // reset
      setShowAddModal(false);
      setNewDate(""); setNewIsOpen(true);
      setNewOpenTime(""); setNewCloseTime(""); setNewNote("");
      setExistingOverride(null);
      fetchEntries();
    } catch (err) {
      console.error("Failed to add/update entry", err);
      toast.error("Failed to save entry. Maybe the date already exists?");
    }
  };

  const openEditModal = (entry) => {
    setEditEntry({
      ...entry,
      open_time: entry.open_time ?? "",
      close_time: entry.close_time ?? "",
    });
    setShowEditModal(true);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/api/clinic-calendar/${editEntry.id}`, {
        is_open: !!editEntry.is_open,
        open_time: editEntry.is_open ? normTime(editEntry.open_time) : null,
        close_time: editEntry.is_open ? normTime(editEntry.close_time) : null,
        note: editEntry.note || null,
        // DO NOT send dentist_count or capacity here
      });
      setShowEditModal(false);
      setEditEntry(null);
      fetchEntries();
    } catch (err) {
      console.error("Failed to update entry", err);
      toast.error("Update failed.");
    }
  };

  const openDeleteModal = (entry) => { setDeleteEntry(entry); setShowDeleteModal(true); };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/clinic-calendar/${deleteEntry.id}`);
      setShowDeleteModal(false);
      setDeleteEntry(null);
      fetchEntries();
    } catch (err) {
      console.error("Failed to delete entry", err);
      toast.error("Deletion failed.");
    }
  };

  // Normalize time like "08:00" or "08:00:00" -> "HH:MM"
  const normTime = (t) => (t ? String(t).slice(0,5) : null);

  return (
    <div 
      className="clinic-calendar-manager-page"
      style={{
        width: '100%',
        maxWidth: '100%',
        padding: '0',
        boxSizing: 'border-box'
      }}
    >
      {/* Header Section */}
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center mb-4 gap-3" style={{ width: '100%', maxWidth: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="m-0 fw-bold" style={{ color: '#1e293b' }}>
            📅 Clinic Calendar Manager
          </h2>
          <p className="text-muted mb-0 mt-1">Manage clinic operating hours and special dates</p>
        </div>
        <button 
          className="btn border-0 shadow-sm flex-shrink-0" 
          onClick={() => setShowAddModal(true)}
          style={{
            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            color: '#1e293b',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '12px 24px',
            fontWeight: '600',
            transition: 'all 0.3s ease'
          }}
        >
          <i className="bi bi-plus-circle me-2"></i>
          Add Entry
        </button>
      </div>

      {/* Calendar Table */}
      <div className="card border-0 shadow-sm" style={{ borderRadius: '16px', width: '100%', maxWidth: '100%' }}>
        <div className="card-body p-0" style={{ width: '100%', maxWidth: '100%' }}>
          {loading ? (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
              <div className="text-center">
                <div className="spinner-border text-primary mb-3" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="text-muted">Loading calendar entries...</p>
              </div>
            </div>
          ) : (
            <div className="table-responsive" style={{ width: '100%', maxWidth: '100%', margin: 0 }}>
              <table className="table table-hover mb-0" style={{ width: '100%', maxWidth: '100%', margin: 0, tableLayout: 'fixed' }}>
                <thead className="table-primary">
                  <tr>
                    <th className="fw-semibold px-3 py-3 border-0" style={{ fontSize: '1.1rem', width: '18%' }}>
                      <i className="bi bi-calendar-date me-2"></i>Date
                    </th>
                    <th className="fw-semibold px-3 py-3 border-0" style={{ fontSize: '1.1rem', width: '12%' }}>
                      <i className="bi bi-toggle-on me-2"></i>Status
                    </th>
                    <th className="fw-semibold px-3 py-3 border-0" style={{ fontSize: '1.1rem', width: '15%' }}>
                      <i className="bi bi-clock me-2"></i>Opening
                    </th>
                    <th className="fw-semibold px-3 py-3 border-0" style={{ fontSize: '1.1rem', width: '15%' }}>
                      <i className="bi bi-clock-history me-2"></i>Closing
                    </th>
                    <th className="fw-semibold px-3 py-3 border-0" style={{ fontSize: '1.1rem', width: '25%' }}>
                      <i className="bi bi-chat-text me-2"></i>Note
                    </th>
                    <th className="fw-semibold px-3 py-3 border-0 text-center" style={{ fontSize: '1.1rem', width: '15%' }}>
                      <i className="bi bi-gear me-2"></i>Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center text-muted border-0" style={{ height: '400px' }}>
                        <div className="d-flex flex-column align-items-center justify-content-center py-5">
                          <div className="bg-light rounded-circle mb-4 d-flex align-items-center justify-content-center" 
                               style={{ width: '120px', height: '120px', fontSize: '3rem' }}>
                            📅
                          </div>
                          <h3 className="text-muted mb-3">No calendar entries</h3>
                          <p className="text-muted mb-4 fs-5">Start by adding your first calendar entry.</p>
                          <button 
                            className="btn border-0 shadow-sm"
                            onClick={() => setShowAddModal(true)}
                            style={{
                              background: 'linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%)',
                              color: 'white',
                              borderRadius: '12px',
                              padding: '12px 24px',
                              fontWeight: '600',
                              transition: 'all 0.3s ease'
                            }}
                          >
                            <i className="bi bi-plus-circle me-2"></i>
                            Add First Entry
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <tr key={entry.id} className="align-middle" style={{ height: '60px' }}>
                        <td className="px-3 py-3 fw-medium border-0" style={{ fontSize: '1rem' }}>
                          <div className="d-flex align-items-center">
                            <div className="bg-primary rounded-circle me-2 d-flex align-items-center justify-content-center" 
                                 style={{ width: '32px', height: '32px', fontSize: '1rem' }}>
                              📅
                            </div>
                            <div>
                              <div className="fw-bold text-dark">{new Date(entry.date).toLocaleDateString()}</div>
                              <small className="text-muted">Calendar Date</small>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 border-0" style={{ fontSize: '1rem' }}>
                          <div className="d-flex flex-column align-items-start">
                            {entry.is_open ? (
                              <span className="badge bg-success">✅ Open</span>
                            ) : (
                              <span className="badge bg-danger">❌ Closed</span>
                            )}
                            <small className="text-muted mt-1">Operating Status</small>
                          </div>
                        </td>
                        <td className="px-3 py-3 border-0" style={{ fontSize: '1rem' }}>
                          <div className="d-flex flex-column">
                            <span className="fw-semibold text-dark">{entry.open_time?.slice(0,5) || "—"}</span>
                            <small className="text-muted">Opening Time</small>
                          </div>
                        </td>
                        <td className="px-3 py-3 border-0" style={{ fontSize: '1rem' }}>
                          <div className="d-flex flex-column">
                            <span className="fw-semibold text-dark">{entry.close_time?.slice(0,5) || "—"}</span>
                            <small className="text-muted">Closing Time</small>
                          </div>
                        </td>
                        <td className="px-3 py-3 border-0" style={{ fontSize: '1rem' }}>
                          <div className="text-truncate" title={entry.note || "—"}>
                            {entry.note || "—"}
                          </div>
                        </td>
                        <td className="px-3 py-3 border-0 text-center" style={{ fontSize: '1rem' }}>
                          <div className="btn-group" role="group">
                            <button 
                              className="btn btn-sm btn-warning me-1" 
                              onClick={() => openEditModal(entry)}
                              style={{ borderRadius: '8px' }}
                              title="Edit entry"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button 
                              className="btn btn-sm btn-danger" 
                              onClick={() => openDeleteModal(entry)}
                              style={{ borderRadius: '8px' }}
                              title="Delete entry"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,0.5)", zIndex: 1055 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow" style={{ borderRadius: '16px' }}>
              <div className="modal-header bg-primary text-white border-0" style={{ borderRadius: '16px 16px 0 0' }}>
                <h5 className="modal-title fw-semibold">
                  <i className="bi bi-plus-circle me-2"></i>
                  Add Clinic Calendar Entry
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowAddModal(false)} />
              </div>
              <div className="modal-body p-4">
                <form onSubmit={handleAdd}>
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-calendar-date me-1"></i>
                        Date
                      </label>
                      <input
                        type="date"
                        className="form-control border-0 shadow-sm"
                        style={{ borderRadius: '12px', padding: '12px 16px' }}
                        required
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        disabled={!!existingOverride}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-toggle-on me-1"></i>
                        Open Status
                      </label>
                      <select
                        className="form-select border-0 shadow-sm"
                        style={{ borderRadius: '12px', padding: '12px 16px' }}
                        value={newIsOpen ? "true" : "false"}
                        onChange={(e) => setNewIsOpen(e.target.value === "true")}
                      >
                        <option value="true">Open</option>
                        <option value="false">Closed</option>
                      </select>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-clock me-1"></i>
                        Opening Time
                      </label>
                      <input
                        type="time"
                        className="form-control border-0 shadow-sm"
                        style={{ borderRadius: '12px', padding: '12px 16px' }}
                        value={newOpenTime}
                        onChange={(e) => setNewOpenTime(e.target.value)}
                        required={newIsOpen}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-clock-history me-1"></i>
                        Closing Time
                      </label>
                      <input
                        type="time"
                        className="form-control border-0 shadow-sm"
                        style={{ borderRadius: '12px', padding: '12px 16px' }}
                        value={newCloseTime}
                        onChange={(e) => setNewCloseTime(e.target.value)}
                        required={newIsOpen}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-chat-text me-1"></i>
                        Note
                      </label>
                      <input
                        type="text"
                        className="form-control border-0 shadow-sm"
                        style={{ borderRadius: '12px', padding: '12px 16px' }}
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Optional note about this date"
                      />
                    </div>
                  </div>

                  <div className="d-flex justify-content-end gap-2 mt-4">
                    <button
                      type="button"
                      className="btn border-0 shadow-sm"
                      style={{
                        background: 'linear-gradient(135deg, #6c757d 0%, #495057 100%)',
                        color: 'white',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        fontWeight: '600',
                        transition: 'all 0.3s ease'
                      }}
                      onClick={() => {
                        setShowAddModal(false);
                        setNewDate(""); setNewIsOpen(true);
                        setNewOpenTime(""); setNewCloseTime(""); setNewNote("");
                        setExistingOverride(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="btn border-0 shadow-sm"
                      style={{
                        background: 'linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%)',
                        color: 'white',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        fontWeight: '600',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <i className="bi bi-check-circle me-2"></i>
                      Save Entry
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editEntry && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,0.5)", zIndex: 1055 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow" style={{ borderRadius: '16px' }}>
              <div className="modal-header bg-warning text-dark border-0" style={{ borderRadius: '16px 16px 0 0' }}>
                <h5 className="modal-title fw-semibold">
                  <i className="bi bi-pencil-square me-2"></i>
                  Edit Clinic Calendar Entry
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowEditModal(false)} />
              </div>
              <div className="modal-body p-4">
                <form onSubmit={handleEdit}>
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-calendar-date me-1"></i>
                        Date
                      </label>
                      <input 
                        type="date" 
                        className="form-control border-0 shadow-sm" 
                        style={{ borderRadius: '12px', padding: '12px 16px' }}
                        value={editEntry.date.slice(0,10)} 
                        disabled 
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-toggle-on me-1"></i>
                        Open Status
                      </label>
                      <select
                        className="form-select border-0 shadow-sm"
                        style={{ borderRadius: '12px', padding: '12px 16px' }}
                        value={editEntry.is_open ? "true" : "false"}
                        onChange={(e) =>
                          setEditEntry({ ...editEntry, is_open: e.target.value === "true" })
                        }
                      >
                        <option value="true">Open</option>
                        <option value="false">Closed</option>
                      </select>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-clock me-1"></i>
                        Opening Time
                      </label>
                      <input
                        type="time"
                        className="form-control border-0 shadow-sm"
                        style={{ borderRadius: '12px', padding: '12px 16px' }}
                        value={editEntry.open_time || ""}
                        onChange={(e) => setEditEntry({ ...editEntry, open_time: e.target.value })}
                        disabled={!editEntry.is_open}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-clock-history me-1"></i>
                        Closing Time
                      </label>
                      <input
                        type="time"
                        className="form-control border-0 shadow-sm"
                        style={{ borderRadius: '12px', padding: '12px 16px' }}
                        value={editEntry.close_time || ""}
                        onChange={(e) => setEditEntry({ ...editEntry, close_time: e.target.value })}
                        disabled={!editEntry.is_open}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-chat-text me-1"></i>
                        Note
                      </label>
                      <input
                        type="text"
                        className="form-control border-0 shadow-sm"
                        style={{ borderRadius: '12px', padding: '12px 16px' }}
                        value={editEntry.note || ""}
                        onChange={(e) => setEditEntry({ ...editEntry, note: e.target.value })}
                        placeholder="Optional note about this date"
                      />
                    </div>
                  </div>

                  <div className="d-flex justify-content-end gap-2 mt-4">
                    <button 
                      type="button" 
                      className="btn border-0 shadow-sm"
                      style={{
                        background: 'linear-gradient(135deg, #6c757d 0%, #495057 100%)',
                        color: 'white',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        fontWeight: '600',
                        transition: 'all 0.3s ease'
                      }}
                      onClick={() => setShowEditModal(false)}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="btn border-0 shadow-sm"
                      style={{
                        background: 'linear-gradient(135deg, #ffc107 0%, #e0a800 100%)',
                        color: 'white',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        fontWeight: '600',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <i className="bi bi-check-circle me-2"></i>
                      Update Entry
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && deleteEntry && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,0.5)", zIndex: 1055 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow" style={{ borderRadius: '16px' }}>
              <div className="modal-header bg-danger text-white border-0" style={{ borderRadius: '16px 16px 0 0' }}>
                <h5 className="modal-title fw-semibold">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  Confirm Deletion
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowDeleteModal(false)} />
              </div>
              <div className="modal-body p-4">
                <div className="text-center mb-4">
                  <div className="bg-danger rounded-circle mx-auto mb-3 d-flex align-items-center justify-content-center" 
                       style={{ width: '80px', height: '80px', fontSize: '2rem' }}>
                    <i className="bi bi-trash text-white"></i>
                  </div>
                  <h5 className="fw-bold">Are you sure?</h5>
                  <p className="text-muted">
                    You are about to delete the calendar entry for <strong>{deleteEntry.date.slice(0, 10)}</strong>.
                  </p>
                  <p className="text-danger fw-semibold">This action cannot be undone.</p>
                </div>
                <div className="d-flex justify-content-center gap-2">
                  <button 
                    className="btn border-0 shadow-sm"
                    style={{
                      background: 'linear-gradient(135deg, #6c757d 0%, #495057 100%)',
                      color: 'white',
                      borderRadius: '12px',
                      padding: '12px 24px',
                      fontWeight: '600',
                      transition: 'all 0.3s ease'
                    }}
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn border-0 shadow-sm"
                    style={{
                      background: 'linear-gradient(135deg, #dc3545 0%, #b02a37 100%)',
                      color: 'white',
                      borderRadius: '12px',
                      padding: '12px 24px',
                      fontWeight: '600',
                      transition: 'all 0.3s ease'
                    }}
                    onClick={handleDelete}
                  >
                    <i className="bi bi-trash me-2"></i>
                    Delete Entry
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClinicCalendarManager;
