import { useEffect, useState } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

export default function InventorySettingsCard() {
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

  useEffect(() => { load(); }, []);

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

  if (loading) return <div className="border rounded-xl p-4">Loading settings…</div>;

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <h2 className="font-medium">Inventory Settings</h2>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.staff_can_receive}
          onChange={e => setForm(s => ({ ...s, staff_can_receive: e.target.checked }))}
        />
        <span>Allow staff to receive stock</span>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2">
          <span>Near-expiry days</span>
          <input
            className="border rounded px-2 py-1 w-24"
            type="number" min="1" max="365"
            value={form.near_expiry_days}
            onChange={e => setForm(s => ({ ...s, near_expiry_days: Number(e.target.value) }))}
          />
        </label>

        <label className="flex items-center gap-2">
          <span>Low-stock debounce (hours)</span>
          <input
            className="border rounded px-2 py-1 w-24"
            type="number" min="1" max="168"
            value={form.low_stock_debounce_hours}
            onChange={e => setForm(s => ({ ...s, low_stock_debounce_hours: Number(e.target.value) }))}
          />
        </label>
      </div>

      <button className="border rounded px-3 py-2" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}
