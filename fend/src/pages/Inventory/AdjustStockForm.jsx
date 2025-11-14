import { useEffect, useState } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

const REASONS = [
  "damaged",
  "expired",
  "count_correction",
  "return_to_supplier",
  "stock_take_variance",
  "theft",
  "other",
];

const onlyDate = (v) => {
  if (!v) return "";
  const s = String(v);
  return s.includes("T") ? s.split("T")[0] : s;
};

export default function AdjustStockForm({ items = [], onAdjusted, onNeedReceive }) {
  const [form, setForm] = useState({
    item_id: "",
    batch_id: "",
    direction: "decrease",
    quantity: "",
    adjust_reason: "damaged",
    notes: "",
    custom_reason: "",
  });

  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  const handle = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  // Load batches when item changes
  useEffect(() => {
    const id = Number(form.item_id);

    // reset current batch selection on item change
    setForm((s) => ({ ...s, batch_id: "" }));

    if (!id) {
      setBatches([]);
      return;
    }

    (async () => {
      setLoadingBatches(true);
      try {
        const { data } = await api.get(`/api/inventory/items/${id}/batches`);
        const list = Array.isArray(data?.batches) ? data.batches : [];

        // FEFO-ish sorting (defensive; backend already sorts)
        const sorted = [...list].sort((a, b) => {
          const ax = a.expiry_date ? 0 : 1;
          const bx = b.expiry_date ? 0 : 1;
          if (ax !== bx) return ax - bx;
          const ae = a.expiry_date || "";
          const be = b.expiry_date || "";
          if (ae !== be) return ae.localeCompare(be);
          const ar = a.received_at || "";
          const br = b.received_at || "";
          return ar.localeCompare(br);
        });

        setBatches(sorted);

        // ✅ Auto-select the first batch if none selected yet
        if (sorted.length) {
          setForm((prev) =>
            prev.batch_id ? prev : { ...prev, batch_id: String(sorted[0].id) }
          );
        }
      } catch {
        setBatches([]);
      } finally {
        setLoadingBatches(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.item_id]);

  const canSubmit =
    Number(form.item_id) > 0 &&
    Number(form.batch_id) > 0 &&
    Number(form.quantity) > 0 &&
    Boolean(form.adjust_reason) &&
    !loadingBatches;

  const submit = async (e) => {
    e.preventDefault();

    // Guard: ensure selected batch belongs to selected item (from fetched list)
    const b = batches.find((x) => String(x.id) === String(form.batch_id));
    if (!b) {
      toast.error("Please select a valid batch.");
      return;
    }

    let notes = form.notes?.trim() || "";
    if (form.adjust_reason === "other" && form.custom_reason.trim()) {
      notes = notes ? `${form.custom_reason.trim()} — ${notes}` : form.custom_reason.trim();
    }

    const payload = {
      item_id: Number(form.item_id),
      batch_id: Number(form.batch_id),
      direction: form.direction,
      quantity: Number(form.quantity),
      adjust_reason: form.adjust_reason,
      ...(notes ? { notes } : {}),
    };

    try {
      await api.post("/api/inventory/adjust", payload);
      setForm((f) => ({ ...f, quantity: "", notes: "", custom_reason: "" }));
      onAdjusted?.();
      toast.success("Inventory adjusted.");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Adjust failed");
    }
  };

  return (
    <form onSubmit={submit}>
      {/* Item */}
      <div className="mb-3">
        <label className="form-label">Item *</label>
        <select
          className="form-select"
          value={form.item_id}
          onChange={(e) => handle("item_id", e.target.value)}
          required
        >
          <option value="">Select item…</option>
          {items.map((it) => (
            <option key={it.id} value={String(it.id)}>
              {it.name} ({it.sku_code})
            </option>
          ))}
        </select>
      </div>

      {/* Batch (dropdown) */}
      <div className="mb-3">
        <label className="form-label">
          Batch {loadingBatches && <span className="text-muted small">(loading…)</span>}
        </label>
        <select
          className="form-select"
          value={form.batch_id}
          onChange={(e) => handle("batch_id", e.target.value)}
          required
          disabled={!form.item_id || loadingBatches || batches.length === 0}
        >
          {/* Real placeholder to avoid "" → 0 coercion */}
          <option value="" disabled>
            {loadingBatches ? "Loading…" : "Select batch…"}
          </option>
          {batches.map((b) => (
            <option key={b.id} value={String(b.id)}>
              #{b.id}
              {b.lot_number ? ` • Lot ${b.lot_number}` : ""}
              {b.expiry_date ? ` • Exp ${onlyDate(b.expiry_date)}` : ""}
              {` • On hand ${b.qty_on_hand}`}
            </option>
          ))}
        </select>

        {/* Helper to create a batch via Receive */}
        {form.item_id && batches.length === 0 && !loadingBatches && (
          <div className="form-text">
            No batches yet.{" "}
            <button
              type="button"
              className="btn btn-link p-0 text-decoration-underline"
              onClick={() => onNeedReceive?.(Number(form.item_id))}
            >
              Create one via Receive
            </button>
            .
          </div>
        )}
      </div>

      {/* Direction + Qty */}
      <div className="row mb-3">
        <div className="col-md-6">
          <label className="form-label">Direction *</label>
          <select
            className="form-select"
            value={form.direction}
            onChange={(e) => handle("direction", e.target.value)}
            required
          >
            <option value="decrease">Decrease</option>
            <option value="increase">Increase</option>
          </select>
        </div>

        <div className="col-md-6">
          <label className="form-label">Quantity *</label>
          <input
            className="form-control"
            type="number"
            step="0.001"
            min="0.001"
            placeholder="e.g., 1"
            value={form.quantity}
            onChange={(e) => handle("quantity", e.target.value)}
            required
          />
        </div>
      </div>

      {/* Reason */}
      <div className="row mb-3">
        <div className="col-md-6">
          <label className="form-label">Reason *</label>
          <select
            className="form-select"
            value={form.adjust_reason}
            onChange={(e) => handle("adjust_reason", e.target.value)}
            required
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </option>
            ))}
          </select>
        </div>

        {form.adjust_reason === "other" && (
          <div className="col-md-6">
            <label className="form-label">Describe reason *</label>
            <input
              className="form-control"
              placeholder="e.g., audit note"
              value={form.custom_reason}
              onChange={(e) => handle("custom_reason", e.target.value)}
              required
            />
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="mb-3">
        <label className="form-label">Notes (optional)</label>
        <textarea
          className="form-control"
          rows={3}
          placeholder="Additional notes..."
          value={form.notes}
          onChange={(e) => handle("notes", e.target.value)}
        />
      </div>

      <div className="d-flex justify-content-end">
        <button 
          type="submit"
          className="btn btn-secondary" 
          disabled={!canSubmit}
        >
          Adjust Stock
        </button>
      </div>
    </form>
  );
}
