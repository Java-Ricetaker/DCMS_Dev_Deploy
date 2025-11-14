import { useState } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

export default function InventoryItemForm({ onCreated }) {
  const [form, setForm] = useState({
    name: "",
    sku_code: "",
    type: "supply",
    unit: "pcs",
    low_stock_threshold: 0,
    default_pack_size: "",
    is_controlled: false,
    is_sellable: false,
    patient_price: "",
    sellable_notes: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const handle = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/inventory/items", form);
      setForm({ name:"", sku_code:"", type:"supply", unit:"pcs", low_stock_threshold:0, default_pack_size:"", is_controlled:false, is_sellable: false, patient_price: "", sellable_notes: "", notes:"" });
      onCreated?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="row mb-3">
        <div className="col-md-6">
          <label className="form-label">Item Name *</label>
          <input 
            className="form-control" 
            placeholder="Item name" 
            value={form.name} 
            onChange={e=>handle('name', e.target.value)} 
            required 
          />
        </div>
        <div className="col-md-6">
          <label className="form-label">SKU Code *</label>
          <input 
            className="form-control" 
            placeholder="SKU code" 
            value={form.sku_code} 
            onChange={e=>handle('sku_code', e.target.value)} 
            required 
          />
        </div>
      </div>
      
      <div className="row mb-3">
        <div className="col-md-4">
          <label className="form-label">Type</label>
          <select className="form-select" value={form.type} onChange={e=>handle('type', e.target.value)}>
            <option value="drug">Drug</option>
            <option value="equipment">Equipment</option>
            <option value="supply">Supply</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label">Unit</label>
          <input 
            className="form-control" 
            placeholder="pcs/ml/g" 
            value={form.unit} 
            onChange={e=>handle('unit', e.target.value)} 
          />
        </div>
        <div className="col-md-4">
          <label className="form-label">Low-stock Threshold</label>
          <input 
            className="form-control" 
            type="number" 
            min="0" 
            placeholder="0" 
            value={form.low_stock_threshold} 
            onChange={e=>handle('low_stock_threshold', e.target.value)} 
          />
        </div>
      </div>
      
      <div className="row mb-3">
        <div className="col-md-6">
          <label className="form-label">Default Pack Size (optional)</label>
          <input 
            className="form-control" 
            type="number" 
            min="0" 
            step="0.001" 
            placeholder="e.g., 100" 
            value={form.default_pack_size} 
            onChange={e=>handle('default_pack_size', e.target.value)} 
          />
        </div>
        <div className="col-md-6 d-flex align-items-end">
          <div className="form-check">
            <input 
              type="checkbox" 
              className="form-check-input" 
              checked={form.is_controlled} 
              onChange={e=>handle('is_controlled', e.target.checked)} 
            />
            <label className="form-check-label">
              Controlled item
            </label>
          </div>
        </div>
      </div>
      
      {/* Sellable Item Section */}
      <div className="row mb-3">
        <div className="col-12">
          <div className="form-check">
            <input 
              type="checkbox" 
              className="form-check-input" 
              checked={form.is_sellable} 
              onChange={e=>handle('is_sellable', e.target.checked)} 
            />
            <label className="form-check-label fw-semibold">
              <i className="fas fa-shopping-cart me-2"></i>
              This item can be sold to patients separately (not included in procedure)
            </label>
          </div>
        </div>
      </div>
      
      {form.is_sellable && (
        <div className="row mb-3">
          <div className="col-md-6">
            <label className="form-label">
              Patient Price (₱) <span className="text-danger">*</span>
            </label>
            <div className="input-group">
              <span className="input-group-text">₱</span>
              <input 
                className="form-control" 
                type="number" 
                step="0.01"
                min="0" 
                placeholder="0.00" 
                value={form.patient_price} 
                onChange={e=>handle('patient_price', e.target.value)} 
                required={form.is_sellable}
              />
            </div>
            <small className="text-muted">Price that patients will pay for this item</small>
          </div>
          <div className="col-md-6">
            <label className="form-label">Sellable Notes (optional)</label>
            <textarea 
              className="form-control" 
              rows={2} 
              placeholder="e.g., Antibiotic for post-procedure infection prevention" 
              value={form.sellable_notes} 
              onChange={e=>handle('sellable_notes', e.target.value)} 
            />
            <small className="text-muted">Notes shown to staff when selecting this item</small>
          </div>
        </div>
      )}
      
      <div className="mb-3">
        <label className="form-label">Notes</label>
        <textarea 
          className="form-control" 
          rows={3} 
          placeholder="Additional notes..." 
          value={form.notes} 
          onChange={e=>handle('notes', e.target.value)} 
        />
      </div>
      
      <div className="d-flex justify-content-end">
        <button 
          type="submit"
          disabled={saving} 
          className="btn btn-primary"
        >
          {saving ? "Saving..." : "Save Item"}
        </button>
      </div>
    </form>
  );
}
