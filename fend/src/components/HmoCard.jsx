import { useEffect, useMemo, useState } from "react";
import api from "../api/api";
import "./HmoCard.css";
import toast from "react-hot-toast";

/**
 * HmoCard.jsx
 * Role-aware HMO manager as a drop-in card for Patient Profile or Edit Visit pages.
 *
 * Props:
 * - patientId: number (required) — the patient whose HMO list we manage
 * - currentUserRole?: 'admin' | 'staff' | 'patient' (optional if you use Auth context)
 * - currentUserPatientId?: number | null — set when role is 'patient' so we can detect self-access
 * - compact?: boolean — smaller paddings for tight layouts (e.g., inside Visit editor)
 * - onChange?: (items: any[]) => void — callback after create/update/delete
 *
 * API endpoints expected (Laravel 12):
 *   GET    /api/patients/{patient}/hmos
 *   POST   /api/patients/{patient}/hmos
 *   PUT    /api/patients/{patient}/hmos/{hmo}
 *   DELETE /api/patients/{patient}/hmos/{hmo}
 *
 * Security & behavior notes:
 * - Member ID / policy are encrypted at-rest by backend casts.
 * - Frontend only controls basic CRUD; backend policies should still enforce who can manage what.
 * - UI permissions:
 *    • Patient can manage only their own HMOs (patientId === currentUserPatientId)
 *    • Staff/Admin can manage any patient’s HMOs (subject to backend)
 */
export default function HmoCard({
  patientId,
  currentUserRole,
  currentUserPatientId = null,
  compact = false,
  onChange,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const canManage = useMemo(() => {
    if (currentUserRole === "admin" || currentUserRole === "staff") return true;
    if (currentUserRole === "patient") return Number(patientId) === Number(currentUserPatientId);
    return false; // default lock-down if unknown role
  }, [currentUserRole, patientId, currentUserPatientId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/api/patients/${patientId}/hmos`);
        if (mounted) {
          setItems(data || []);
          onChange && onChange(data || []);
        }
      } catch (e) {
        if (mounted) setError(parseErr(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, [patientId]);

  const onCreate = () => {
    setEditingItem(null);
    setShowForm(true);
  };

  const onEdit = (item) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleSaved = (savedItem, mode) => {
    setShowForm(false);
    setEditingItem(null);
    setItems((prev) => {
      const next =
        mode === "create"
          ? normalizeAndSort([savedItem, ...prev])
          : normalizeAndSort(prev.map((it) => (it.id === savedItem.id ? savedItem : it)));
      onChange && onChange(next);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/api/patients/${patientId}/hmos/${confirmDelete.id}`);
      setItems((prev) => {
        const next = prev.filter((it) => it.id !== confirmDelete.id);
        onChange && onChange(next);
        return next;
      });
    } catch (e) {
      toast.error(parseErr(e));
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div
      className={`w-full ${compact ? "p-3" : "p-4"} rounded-2xl shadow-sm border hmo-card`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-lg font-semibold hmo-title">HMO</h3>
        {canManage && (
          <button
            onClick={onCreate}
            className="px-3 py-1.5 rounded-xl text-sm font-medium text-white transition-colors duration-200"
            style={{ backgroundColor: '#2563eb' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#1d4ed8'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#2563eb'}
          >
            + Add HMO
          </button>
        )}
      </div>

      {loading && <div className="text-sm text-muted">Loading HMOs…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !items?.length && (
        <div className="text-sm text-muted">No HMO on file.</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items?.map((it) => (
          <HmoItemCard
            key={it.id}
            item={it}
            onEdit={() => onEdit(it)}
            onAskDelete={() => setConfirmDelete(it)}
            canManage={canManage}
          />
        ))}
      </div>

      {showForm && (
        <HmoFormModal
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
          patientId={patientId}
          initial={editingItem}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          title="Delete HMO?"
          message={`This will remove ${confirmDelete.provider_name} from this patient. You can restore from audit logs in backend if implemented.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function HmoItemCard({ item, onEdit, onAskDelete, canManage }) {
  return (
    <div className="rounded-xl border p-3 hmo-card" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium hmo-provider-name">{item.provider_name}</span>
            {item.is_primary ? (
              <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                Primary
              </span>
            ) : null}
          </div>
          <div className="text-sm mt-2 space-y-1">
            <div>
              <span className="hmo-label">HMO Number:</span>{" "}
              <span className="hmo-value">{item.hmo_number}</span>
            </div>
            <div>
              <span className="hmo-label">Name on Card:</span>{" "}
              <span className="hmo-value">{item.patient_fullname_on_card}</span>
            </div>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="px-2.5 py-1 text-xs rounded-lg text-white transition-colors duration-200"
              style={{ backgroundColor: '#2563eb' }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#1d4ed8'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#2563eb'}
            >
              Edit
            </button>
            <button
              onClick={onAskDelete}
              className="px-2.5 py-1 text-xs rounded-lg text-white transition-colors duration-200"
              style={{ backgroundColor: '#dc2626' }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#b91c1c'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#dc2626'}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function HmoFormModal({ onClose, onSaved, patientId, initial }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(() => ({
    provider_name: initial?.provider_name || "",
    hmo_number: initial?.hmo_number || "",
    patient_fullname_on_card: initial?.patient_fullname_on_card || "",
    is_primary: !!initial?.is_primary,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSubmitting(true);
    setErr("");
    try {
      let res;
      const payload = {
        provider_name: form.provider_name,
        hmo_number: form.hmo_number,
        patient_fullname_on_card: form.patient_fullname_on_card,
        is_primary: form.is_primary,
      };
      if (isEdit) {
        res = await api.put(`/api/patients/${patientId}/hmos/${initial.id}`, payload);
        onSaved(res.data, "update");
      } else {
        res = await api.post(`/api/patients/${patientId}/hmos`, payload);
        onSaved(res.data, "create");
      }
    } catch (e) {
      setErr(parseErr(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl shadow-xl border p-4 hmo-card" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-base font-semibold hmo-title">{isEdit ? "Edit HMO" : "Add HMO"}</h4>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full button-close transition-colors duration-200 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {err && <div className="mb-3 text-sm text-red-600">{err}</div>}

        <div className="grid grid-cols-1 gap-3">
          <TextField
            label="Provider Name"
            required
            value={form.provider_name}
            onChange={(v) => setForm({ ...form, provider_name: v })}
          />
          <TextField
            label="HMO Number"
            required
            value={form.hmo_number}
            onChange={(v) => setForm({ ...form, hmo_number: v })}
          />
          <TextField
            label="Patient Full Name on Card"
            required
            value={form.patient_fullname_on_card}
            onChange={(v) => setForm({ ...form, patient_fullname_on_card: v })}
          />
          <div className="flex items-center gap-2 pt-2">
            <input
              id="is_primary"
              type="checkbox"
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border rounded"
              style={{
                borderColor: 'var(--input-border)',
                backgroundColor: 'var(--input-bg)',
              }}
              checked={form.is_primary}
              onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
            />
            <label htmlFor="is_primary" className="text-sm hmo-form-label">
              Mark as Primary
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-xl text-white transition-colors duration-200"
            style={{ backgroundColor: '#6b7280' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#4b5563'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#6b7280'}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={submitting || !form.provider_name || !form.hmo_number || !form.patient_fullname_on_card}
            className="px-3 py-1.5 text-sm rounded-xl text-white transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: (submitting || !form.provider_name || !form.hmo_number || !form.patient_fullname_on_card) ? '#9ca3af' : '#2563eb' }}
            onMouseEnter={(e) => {
              if (!submitting && form.provider_name && form.hmo_number && form.patient_fullname_on_card) {
                e.target.style.backgroundColor = '#1d4ed8';
              }
            }}
            onMouseLeave={(e) => {
              if (!submitting && form.provider_name && form.hmo_number && form.patient_fullname_on_card) {
                e.target.style.backgroundColor = '#2563eb';
              }
            }}
          >
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ title, message, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl shadow-xl border p-4 hmo-card" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)' }}>
        <h4 className="text-base font-semibold mb-2 hmo-title">{title}</h4>
        <p className="text-sm text-secondary mb-4">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-xl text-white transition-colors duration-200"
            style={{ backgroundColor: '#6b7280' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#4b5563'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#6b7280'}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded-xl text-white transition-colors duration-200"
            style={{ backgroundColor: '#dc2626' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#b91c1c'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#dc2626'}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, required }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <input
        type="text"
        className="w-full mt-1 rounded-xl border p-2 text-sm input-field focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        style={{
          backgroundColor: 'var(--input-bg)',
          borderColor: 'var(--input-border)',
          color: 'var(--input-text)',
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}


function Label({ children, required = false }) {
  return (
    <label className="text-sm hmo-form-label">
      {children} {required && <span className="text-red-600">*</span>}
    </label>
  );
}


function parseErr(e) {
  const msg = e?.response?.data?.message || e?.message || "Request failed";
  const errs = e?.response?.data?.errors;
  if (errs) {
    try {
      const first = Object.values(errs)[0];
      if (Array.isArray(first) && first.length) return `${msg}: ${first[0]}`;
    } catch (_) {}
  }
  return msg;
}

function normalizeAndSort(list) {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    const pa = (a.provider_name || "").toLowerCase();
    const pb = (b.provider_name || "").toLowerCase();
    return pa.localeCompare(pb);
  });
}

