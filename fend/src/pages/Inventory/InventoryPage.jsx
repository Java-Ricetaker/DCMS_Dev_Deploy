import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import InventoryItemForm from "./InventoryItemForm";
import ReceiveStockForm from "./ReceiveStockForm";
import ConsumeStockForm from "./ConsumeStockForm";
import AdjustStockForm from "./AdjustStockForm";
import Modal from "../../components/Modal";
import toast from "react-hot-toast";

/** Admin-only settings card with improved design */
function InventorySettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    staff_can_receive: false,
    near_expiry_days: 30,
    low_stock_debounce_hours: 24,
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/inventory/settings");
      setForm(data);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/api/inventory/settings", form);
      toast.success("Settings saved.");
    } catch (e) {
      toast.error(e?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-3">
        <div className="form-check">
          <input
            type="checkbox"
            className="form-check-input"
            checked={form.staff_can_receive}
            onChange={e => setForm(s => ({ ...s, staff_can_receive: e.target.checked }))}
          />
          <label className="form-check-label">
            Allow staff to receive stock
          </label>
        </div>
      </div>

      <div className="row">
        <div className="col-md-6 mb-3">
          <label className="form-label">Near-expiry days</label>
          <input
            className="form-control"
            type="number" min="1" max="365"
            value={form.near_expiry_days}
            onChange={e => setForm(s => ({ ...s, near_expiry_days: Number(e.target.value) }))}
          />
        </div>

        <div className="col-md-6 mb-3">
          <label className="form-label">Low-stock debounce (hours)</label>
          <input
            className="form-control"
            type="number" min="1" max="168"
            value={form.low_stock_debounce_hours}
            onChange={e => setForm(s => ({ ...s, low_stock_debounce_hours: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="d-flex justify-content-end">
        <button 
          className="btn btn-primary" 
          onClick={save} 
          disabled={saving}
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [searchTimeout, setSearchTimeout] = useState(null);

  // modal flags
  const [openAdd, setOpenAdd] = useState(false);
  const [openReceive, setOpenReceive] = useState(false);
  const [openConsume, setOpenConsume] = useState(false);
  const [openAdjust, setOpenAdjust] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);

  // item prefill when jumping from Adjust -> Receive
  const [prefillItemId, setPrefillItemId] = useState(null);
  const openReceiveForItem = (itemId) => {
    setPrefillItemId(itemId);
    setOpenAdjust(false);
    setOpenReceive(true);
  };

  const fetchItems = async (query = "") => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/inventory/items", { params: { q: query } });
      setItems(data.data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (value) => {
    setQ(value);
    
    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Only search if we have at least 2 characters or empty string
    if (value.length === 0 || value.length >= 2) {
      const timeout = setTimeout(() => {
        fetchItems(value);
      }, 300); // 300ms debounce
      setSearchTimeout(timeout);
    }
  };

  const fetchUser = async () => {
    try {
      const { data } = await api.get("/api/user");
      setUser(data);
    } catch (e) {
      console.error("Failed to load user", e);
    }
  };

  useEffect(() => {
    fetchItems();
    fetchUser();
  }, []);

  const totalSkus = useMemo(() => items.length, [items]);
  
  // Check if any modal is open
  const isAnyModalOpen = openAdd || openReceive || openConsume || openAdjust || openSettings;

  return (
    <div className="p-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="h3 mb-1">Inventory</h1>
          <p className="text-muted small">Manage your stock and supplies</p>
        </div>
        <div className="d-flex align-items-center gap-3">
          <div className="card border-0 bg-light">
            <div className="card-body py-2 px-3">
              <div className="h5 mb-0 text-primary">{totalSkus}</div>
              <div className="small text-muted">Total Items</div>
            </div>
          </div>
          {user?.role === "admin" && (
            <button 
              className={`btn btn-outline-secondary btn-sm ${isAnyModalOpen ? 'disabled' : ''}`}
              onClick={() => !isAnyModalOpen && setOpenSettings(true)}
              disabled={isAnyModalOpen}
              title="Inventory Settings"
            >
              <i className="bi bi-gear"></i>
            </button>
          )}
        </div>
      </div>

      {/* Search + actions */}
      <div className="d-flex flex-wrap gap-2 align-items-center mb-4">
        <div className="input-group flex-grow-1" style={{minWidth: '300px'}}>
          <span className="input-group-text">
            <i className="bi bi-search"></i>
          </span>
          <input
            className={`form-control ${isAnyModalOpen ? 'opacity-50' : ''}`}
            placeholder="Search items... (min 2 characters)"
            value={q}
            onChange={(e) => !isAnyModalOpen && handleSearchChange(e.target.value)}
            disabled={isAnyModalOpen}
          />
        </div>
        
        <button 
          className={`btn btn-outline-secondary ${isAnyModalOpen ? 'disabled' : ''}`} 
          onClick={() => !isAnyModalOpen && fetchItems(q)}
          disabled={isAnyModalOpen || (q.length > 0 && q.length < 2)}
        >
          Search
        </button>
        {q.length > 0 && q.length < 2 && (
          <div className="text-warning small mt-1">
            <i className="bi bi-info-circle me-1"></i>
            Please enter at least 2 characters to search
          </div>
        )}

        <div className="d-flex gap-2 ms-auto">
          <button 
            className={`btn btn-success btn-sm ${isAnyModalOpen ? 'disabled' : ''}`} 
            onClick={() => !isAnyModalOpen && setOpenAdd(true)}
            disabled={isAnyModalOpen}
          >
            + Add Item
          </button>
          <button 
            className={`btn btn-primary btn-sm ${isAnyModalOpen ? 'disabled' : ''}`} 
            onClick={() => !isAnyModalOpen && setOpenReceive(true)}
            disabled={isAnyModalOpen}
          >
            ⇪ Receive Stock
          </button>
          <button 
            className={`btn btn-warning btn-sm ${isAnyModalOpen ? 'disabled' : ''}`} 
            onClick={() => !isAnyModalOpen && setOpenConsume(true)}
            disabled={isAnyModalOpen}
          >
            − Consume
          </button>
          {user?.role === "admin" && (
            <button 
              className={`btn btn-secondary btn-sm ${isAnyModalOpen ? 'disabled' : ''}`} 
              onClick={() => !isAnyModalOpen && setOpenAdjust(true)}
              disabled={isAnyModalOpen}
            >
              ✎ Adjust
            </button>
          )}
        </div>
      </div>


      {/* Items table */}
      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="card-title mb-0">Items ({totalSkus})</h5>
          {loading && <span className="badge bg-secondary">Loading…</span>}
        </div>
        
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Type</th>
                  <th>Unit</th>
                  <th>Threshold</th>
                  <th>On Hand</th>
                  <th>Sellable</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const onHand = Number(it.total_on_hand || 0);
                  const threshold = it.low_stock_threshold ?? 0;
                  const isLowStock = onHand <= threshold;
                  
                  return (
                    <tr key={it.id}>
                      <td className="fw-medium">{it.name}</td>
                      <td className="font-monospace text-muted">{it.sku_code}</td>
                      <td>
                        <span className="badge bg-primary">{it.type}</span>
                      </td>
                      <td className="text-muted">{it.unit}</td>
                      <td className="text-muted">{threshold}</td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <span className={`fw-medium ${isLowStock ? 'text-danger' : 'text-success'}`}>
                            {onHand}
                          </span>
                          {isLowStock && (
                            <span className="badge bg-danger">Low</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {it.is_sellable ? (
                          <span className="badge bg-success" title={it.sellable_notes}>
                            <i className="fas fa-shopping-cart me-1"></i>
                            ₱{Number(it.patient_price || 0).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && !loading && (
                  <tr>
                    <td colSpan="7" className="text-center text-muted py-4">
                      No items yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal open={openAdd} onClose={() => setOpenAdd(false)} title="Add Item">
        <InventoryItemForm
          onCreated={() => {
            setOpenAdd(false);
            fetchItems(q);
          }}
        />
      </Modal>

      <Modal
        open={openReceive}
        onClose={() => { setOpenReceive(false); setPrefillItemId(null); }}
        title="Receive Stock"
      >
        <ReceiveStockForm
          items={items}
          initialItemId={prefillItemId}
          onReceived={() => {
            setOpenReceive(false);
            setPrefillItemId(null);
            fetchItems(q);
          }}
        />
      </Modal>

      <Modal open={openConsume} onClose={() => setOpenConsume(false)} title="Consume Stock">
        <ConsumeStockForm
          items={items}
          user={user}
          onConsumed={() => {
            setOpenConsume(false);
            fetchItems(q);
          }}
        />
      </Modal>

      <Modal open={openAdjust} onClose={() => setOpenAdjust(false)} title="Adjust Stock (Admin)">
        <AdjustStockForm
          items={items}
          onAdjusted={() => {
            setOpenAdjust(false);
            fetchItems(q);
          }}
          onNeedReceive={openReceiveForItem}
        />
      </Modal>

      <Modal open={openSettings} onClose={() => setOpenSettings(false)} title="Inventory Settings">
        <InventorySettingsCard />
      </Modal>
    </div>
  );
}
