import { useEffect, useState } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

function toDateTimeLocal(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
function todayYmd(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ReceiveStockForm({
  items = [],
  onReceived,
  initialItemId,
}) {
  const [form, setForm] = useState({
    item_id: "",
    qty_received: "",
    received_at: toDateTimeLocal(), // local yyyy-mm-ddThh:mm
    cost_per_unit: "",
    lot_number: "",
    batch_number: "",
    expiry_date: "",
    supplier_id: "",
    invoice_no: "",
    invoice_date: "",
    pack_size: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  // supplier modal state
  const [suppliers, setSuppliers] = useState([]);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  // Optional prefill for item (used when jumping from Adjust)
  useEffect(() => {
    if (initialItemId) {
      setForm((s) => ({ ...s, item_id: String(initialItemId) }));
    }
  }, [initialItemId]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/inventory/suppliers");
        setSuppliers(data);
      } catch (e) {
        console.error("Failed to load suppliers", e);
      }
    })();
  }, []);

  const item = items.find((i) => i.id === Number(form.item_id));
  const handle = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/inventory/receive", {
        ...form,
        // convert datetime-local to "YYYY-MM-DD HH:mm:ss"
        received_at: form.received_at
          ? form.received_at.replace("T", " ") + ":00"
          : null,
      });
      setForm((f) => ({
        ...f,
        qty_received: "",
        cost_per_unit: "",
        lot_number: "",
        batch_number: "",
        expiry_date: "",
        invoice_no: "",
        invoice_date: "",
        pack_size: "",
        notes: "",
      }));
      onReceived?.();
      toast.success("Stock received.");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Receive failed");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    !saving &&
    form.item_id &&
    form.qty_received &&
    form.received_at &&
    form.batch_number && // now required in UI
    (item?.type !== "drug" || (form.lot_number && form.expiry_date));

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
            <option key={it.id} value={it.id}>
              {it.name} ({it.sku_code})
            </option>
          ))}
        </select>
      </div>

      <div className="row mb-3">
        {/* Quantity received */}
        <div className="col-md-4">
          <label className="form-label">Quantity received *</label>
          <input
            className="form-control"
            type="number"
            step="0.001"
            min="0.001"
            placeholder="e.g., 10"
            value={form.qty_received}
            onChange={(e) => handle("qty_received", e.target.value)}
            required
          />
        </div>

        {/* Date & time received */}
        <div className="col-md-4">
          <label className="form-label">Date & time received *</label>
          <input
            className="form-control"
            type="datetime-local"
            value={form.received_at}
            onChange={(e) => handle("received_at", e.target.value)}
            required
          />
          <div className="form-text">
            Must be within the allowed backdate window (≤ 24 hours; not in the future).
          </div>
        </div>

        {/* Cost per unit */}
        <div className="col-md-4">
          <label className="form-label">Cost per unit (optional)</label>
          <input
            className="form-control"
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g., 12.50"
            value={form.cost_per_unit}
            onChange={(e) => handle("cost_per_unit", e.target.value)}
          />
        </div>
      </div>

      {item?.type === "drug" && (
        <div className="alert alert-info mb-3">
          <small>For <strong>drugs</strong>, <strong>Lot number</strong> and <strong>Expiry date</strong> are required.</small>
        </div>
      )}

      <div className="row mb-3">
        {/* Lot number */}
        <div className="col-md-4">
          <label className="form-label">
            Lot number{item?.type === "drug" ? " *" : ""}
          </label>
          <input
            className="form-control"
            placeholder="e.g., LOT-ABC-123"
            value={form.lot_number}
            onChange={(e) => handle("lot_number", e.target.value)}
            required={item?.type === "drug"}
          />
        </div>

        {/* Batch number (now required) */}
        <div className="col-md-4">
          <label className="form-label">Batch number *</label>
          <input
            className="form-control"
            placeholder="e.g., BATCH-2025-09"
            value={form.batch_number}
            onChange={(e) => handle("batch_number", e.target.value)}
            required
          />
        </div>

        {/* Expiry date */}
        <div className="col-md-4">
          <label className="form-label">
            Expiry date{item?.type === "drug" ? " *" : ""}
          </label>
          <input
            className="form-control"
            type="date"
            min={todayYmd()} // must not be in the past
            value={form.expiry_date}
            onChange={(e) => handle("expiry_date", e.target.value)}
            required={item?.type === "drug"}
          />
          <div className="form-text">
            If the item is a <strong>drug</strong>, expiry is required and must be a <strong>future</strong> date.
          </div>
        </div>
      </div>

      <div className="row mb-3">
        {/* Invoice no. */}
        <div className="col-md-4">
          <label className="form-label">Invoice no. (optional)</label>
          <input
            className="form-control"
            placeholder="e.g., INV-000123"
            value={form.invoice_no}
            onChange={(e) => handle("invoice_no", e.target.value)}
          />
        </div>

        {/* Invoice date */}
        <div className="col-md-4">
          <label className="form-label">Invoice date (optional)</label>
          <input
            className="form-control"
            type="date"
            value={form.invoice_date}
            onChange={(e) => handle("invoice_date", e.target.value)}
          />
        </div>

        {/* Pack size */}
        <div className="col-md-4">
          <label className="form-label">Pack size note (optional)</label>
          <input
            className="form-control"
            placeholder="e.g., 1 box = 100 pcs"
            value={form.pack_size}
            onChange={(e) => handle("pack_size", e.target.value)}
          />
        </div>
      </div>

      {/* Supplier with Add button */}
      <div className="mb-3">
        <label className="form-label">Supplier (optional)</label>
        <div className="input-group">
          <select
            className="form-select"
            value={form.supplier_id}
            onChange={(e) => handle("supplier_id", e.target.value)}
          >
            <option value="">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setShowSupplierModal(true)}
            title="Add new supplier"
          >
            + Add
          </button>
        </div>
        <div className="form-text">
          Linking a supplier improves audit trail and costing.
        </div>
      </div>

      {/* Notes */}
      <div className="mb-3">
        <label className="form-label">Notes (optional)</label>
        <textarea
          className="form-control"
          rows={3}
          placeholder="Additional remarks…"
          value={form.notes}
          onChange={(e) => handle("notes", e.target.value)}
        />
      </div>

      <div className="d-flex justify-content-end">
        <button 
          type="submit"
          disabled={!canSubmit} 
          className="btn btn-primary"
        >
          {saving ? "Receiving…" : "Receive Stock"}
        </button>
      </div>

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div
          className="modal fade show d-block"
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 2100,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            overflowY: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowSupplierModal(false);
          }}
        >
          <div className="modal-dialog modal-dialog-centered" style={{
            margin: "0 auto",
            maxHeight: "calc(100vh - 2rem)",
            width: "100%"
          }}>
            <div className="modal-content" style={{
              display: "flex",
              flexDirection: "column",
              maxHeight: "calc(100vh - 2rem)",
              overflow: "hidden"
            }}>
              <div className="modal-header flex-shrink-0" style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                backgroundColor: "#fff",
                borderBottom: "1px solid #dee2e6"
              }}>
                <h5 className="modal-title">Add Supplier</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowSupplierModal(false)}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body flex-grow-1" style={{
                overflowY: "auto",
                overflowX: "hidden",
                flex: "1 1 auto",
                minHeight: 0
              }}>
                <div className="mb-3">
                  <label className="form-label">Name *</label>
                  <input
                    className="form-control"
                    value={newSupplier.name}
                    onChange={(e) =>
                      setNewSupplier((s) => ({ ...s, name: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label">Contact person</label>
                    <input
                      className="form-control"
                      value={newSupplier.contact_person || ""}
                      onChange={(e) =>
                        setNewSupplier((s) => ({
                          ...s,
                          contact_person: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Phone</label>
                    <input
                      className="form-control"
                      value={newSupplier.phone || ""}
                      onChange={(e) =>
                        setNewSupplier((s) => ({ ...s, phone: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-control"
                      value={newSupplier.email || ""}
                      onChange={(e) =>
                        setNewSupplier((s) => ({ ...s, email: e.target.value }))
                      }
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Address</label>
                    <input
                      className="form-control"
                      value={newSupplier.address || ""}
                      onChange={(e) =>
                        setNewSupplier((s) => ({ ...s, address: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={newSupplier.notes || ""}
                    onChange={(e) =>
                      setNewSupplier((s) => ({ ...s, notes: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="modal-footer flex-shrink-0" style={{
                position: "sticky",
                bottom: 0,
                zIndex: 1,
                backgroundColor: "#fff",
                borderTop: "1px solid #dee2e6"
              }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowSupplierModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={savingSupplier || !newSupplier.name}
                  onClick={async () => {
                    try {
                      setSavingSupplier(true);
                      const { data } = await api.post(
                        "/api/inventory/suppliers",
                        newSupplier
                      );
                      // add to list and select it
                      setSuppliers((prev) => [...prev, data]);
                      setForm((s) => ({ ...s, supplier_id: String(data.id) }));
                      setShowSupplierModal(false);
                      setNewSupplier({
                        name: "",
                        contact_person: "",
                        phone: "",
                        email: "",
                        address: "",
                        notes: "",
                      });
                    } catch (err) {
                      toast.error(
                        err?.response?.data?.message || "Failed to add supplier"
                      );
                    } finally {
                      setSavingSupplier(false);
                    }
                  }}
                >
                  {savingSupplier ? "Saving…" : "Save Supplier"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
