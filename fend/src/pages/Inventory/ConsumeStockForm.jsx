import { useMemo, useState, useEffect } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

export default function ConsumeStockForm({ items = [], user = null, onConsumed }) {
  const isStaff = user?.role === "staff";

  const [form, setForm] = useState({
    item_id: "",
    quantity: "",
    ref_type: isStaff ? "visit" : "", // staff must consume against a finished visit
    ref_id: "",
    notes: "",
  });

  const selectedItem = useMemo(
    () => items.find((i) => i.id === Number(form.item_id)),
    [items, form.item_id]
  );

  const handle = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();

    const payload = {
      item_id: Number(form.item_id),
      quantity: Number(form.quantity),
    };

    // Only send nullable fields when present
    if (isStaff) {
      payload.ref_type = "visit";
      if (form.ref_id) payload.ref_id = Number(form.ref_id);
    } else {
      if (form.ref_type) payload.ref_type = form.ref_type;
      if (form.ref_id) payload.ref_id = Number(form.ref_id);
    }
    if (form.notes?.trim()) payload.notes = form.notes.trim();

    try {
      await api.post("/api/inventory/consume", payload);
      setForm((f) => ({ ...f, quantity: "", ref_id: "", notes: "" }));
      onConsumed?.();
      toast.success("Stock consumed.");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Consume failed");
    }
  };

  return (
    <form onSubmit={submit}>
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
            <option key={it.id} value={it.id}>
              {it.name} ({it.sku_code})
            </option>
          ))}
        </select>
      </div>

      <div className="row mb-3">
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

        {/* Reference */}
        <div className="col-md-6">
          {isStaff ? (
            <div>
              <label className="form-label">Visit ID (required for staff) *</label>
              <input
                className="form-control"
                type="number"
                min="1"
                placeholder="Finished Visit ID"
                value={form.ref_id}
                onChange={(e) => handle("ref_id", e.target.value)}
                required
              />
              <div className="form-text">
                Backend requires a <strong>finished</strong> visit for staff consumption.
              </div>
            </div>
          ) : (
            <div>
              <label className="form-label">Reference type (optional)</label>
              <select
                className="form-select"
                value={form.ref_type}
                onChange={(e) => handle("ref_type", e.target.value)}
              >
                <option value="">None</option>
                <option value="visit">Visit</option>
                <option value="appointment">Appointment</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {!isStaff && form.ref_type && (
        <div className="row mb-3">
          <div className="col-md-6">
            <label className="form-label">
              {form.ref_type === "visit" ? "Visit ID" : "Appointment ID"}
            </label>
            <input
              className="form-control"
              type="number"
              min="1"
              placeholder="e.g., 123"
              value={form.ref_id}
              onChange={(e) => handle("ref_id", e.target.value)}
            />
          </div>
        </div>
      )}

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
        <button type="submit" className="btn btn-warning">
          Consume Stock
        </button>
      </div>
    </form>
  );
}
