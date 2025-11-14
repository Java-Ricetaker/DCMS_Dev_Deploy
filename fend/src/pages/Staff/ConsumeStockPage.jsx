import { useEffect, useState } from "react";
import { useLocation, useParams, Navigate } from "react-router-dom";
import api from "../../api/api";
import toast from "react-hot-toast";

export default function ConsumeStockPage() {
  const { id } = useParams();            // visit id
  const loc = useLocation();
  const [visit, setVisit] = useState(null);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ item_id: "", quantity: "", notes: "" });

  // We expect whoever navigated here to pass visitFinished: true in state
  const visitFinished = loc.state?.visitFinished === true;

  useEffect(() => {
    (async () => {
      try {
        // optional: fetch visit to verify finished server-side
        const { data } = await api.get(`/visits/${id}`); // make sure this exists or remove
        setVisit(data);
        const itemsRes = await api.get("/inventory/items");
        setItems(itemsRes.data.data || []);
      } catch (e) {
        // ignore for now
      }
    })();
  }, [id]);

  if (!visitFinished) {
    // if someone manually hits URL, kick them out
    return <Navigate to="/staff" replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/inventory/consume", {
        item_id: Number(form.item_id),
        quantity: Number(form.quantity),
        ref_type: "visit",
        ref_id: Number(id),
        notes: form.notes || null,
      });
      toast.success("Stock consumed.");
      setForm({ item_id: "", quantity: "", notes: "" });
    } catch (err) {
      toast.error(err?.response?.data?.message || "Consume failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Consume Stock for Visit #{id}</h1>
      <form onSubmit={submit} className="space-y-3">
        <select className="border rounded px-3 py-2" value={form.item_id}
          onChange={e => setForm(s=>({...s, item_id: e.target.value}))} required>
          <option value="">Select item…</option>
          {items.map(it => <option key={it.id} value={it.id}>{it.name} ({it.sku_code})</option>)}
        </select>
        <input className="border rounded px-3 py-2" type="number" min="0.001" step="0.001"
          placeholder="Quantity" value={form.quantity}
          onChange={e => setForm(s=>({...s, quantity: e.target.value}))} required />
        <textarea className="border rounded px-3 py-2" rows={2}
          placeholder="Notes (optional)" value={form.notes}
          onChange={e => setForm(s=>({...s, notes: e.target.value}))} />
        <button disabled={saving} className="border rounded px-3 py-2">
          {saving ? "Saving…" : "Consume"}
        </button>
      </form>
    </div>
  );
}
