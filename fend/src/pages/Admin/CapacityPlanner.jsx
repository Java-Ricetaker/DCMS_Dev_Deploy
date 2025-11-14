// File: src/pages/Admin/CapacityPlanner.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

// Utilities
const todayYMD = () => new Date().toISOString().slice(0, 10);
const toYMD = (v) => {
  if (!v) return "";
  const s = String(v);
  return s.includes("T") ? s.split("T")[0] : s.slice(0, 10);
};

export default function CapacityPlanner() {
  const [rows, setRows] = useState([]); // working copy
  const [origRows, setOrigRows] = useState([]); // snapshot for change detection
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const from = useMemo(() => todayYMD(), []);
  const days = 14;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get("/api/clinic-calendar/daily", {
          params: { from, days },
        });
        const list = Array.isArray(res.data) ? res.data : [];
        const normalized = list.map((r) => ({
          date: toYMD(r.date),
          active_dentists: Number.isFinite(+r.active_dentists)
            ? +r.active_dentists
            : 0,
          max_parallel:
            r.max_parallel === null || r.max_parallel === undefined
              ? ""
              : String(r.max_parallel),
          is_closed: !!r.is_closed,
          note: r.note ?? "",
        }));
        setRows(normalized);
        setOrigRows(normalized); // take snapshot
      } catch (e) {
        console.error(e);
        setError(e?.response?.data?.message || "Failed to load capacity.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [from]);

  const updateRow = (i, patch) =>
    setRows((old) => old.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // Detect field changes vs orig snapshot
  const changed = (row, orig) => {
    if (!orig) return true;
    return (
      row.is_closed !== orig.is_closed ||
      (row.max_parallel ?? "") !== (orig.max_parallel ?? "") ||
      (row.note ?? "") !== (orig.note ?? "")
    );
  };

  // Save one row (handles closure toggle + capacity)
  const saveOne = async (row, orig) => {
    // If nothing changed, skip
    if (!changed(row, orig)) return;

    const statusChanged = row.is_closed !== orig.is_closed;

    // 1) If status changed, toggle closure first
    if (statusChanged) {
      await api.put(`/api/clinic-calendar/${row.date}/closure`, {
        closed: row.is_closed, // true = close, false = reopen
        message: row.note?.trim() || null, // reuse note as closure reason
      });
    }

    // 2) If day is open (either stayed open or was reopened), save capacity/note
    //    If day is closed, skip capacity (closure/manual row owns it).
    if (!row.is_closed) {
      await api.put(`/api/clinic-calendar/day/${row.date}`, {
        max_parallel:
          row.max_parallel === "" || row.max_parallel === null
            ? null
            : Number(row.max_parallel),
        note: row.note?.trim() || null,
      });
    }
  };

  const saveAll = async () => {
    setSaving(true);
    setError("");
    try {
      // Map rows to their original counterparts by date
      const origByDate = Object.fromEntries(origRows.map((o) => [o.date, o]));
      await Promise.all(rows.map((r) => saveOne(r, origByDate[r.date])));
      toast.success("Changes saved.");
      // Refresh snapshot so subsequent saves only send new changes
      setOrigRows(rows);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-2">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="m-0">📊 Capacity (next 14 days)</h3>
        <button
          className="btn btn-dark"
          disabled={saving || loading}
          onClick={saveAll}
        >
          {saving ? "Saving…" : "Save All"}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger py-2" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-bordered align-middle">
            <thead className="table-light">
              <tr>
                <th style={{ minWidth: 115 }}>Date</th>
                <th>Weekday</th>
                <th className="text-center">Active Dentists</th>
                <th style={{ minWidth: 180 }}>Max same‑time appts</th>
                <th className="text-center" style={{ minWidth: 120 }}>
                  Status
                </th>
                <th>Note / Reason</th>
                <th className="text-center">Effective capacity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const wd = new Date(r.date).toLocaleDateString(undefined, {
                  weekday: "short",
                });
                const dentists = Number.isFinite(+r.active_dentists)
                  ? +r.active_dentists
                  : 0;
                const cap =
                  r.max_parallel === "" || r.max_parallel === null
                    ? Infinity
                    : Math.max(0, Number(r.max_parallel));
                const effective = r.is_closed ? 0 : Math.min(dentists, cap);

                return (
                  <tr key={r.date}>
                    <td className="fw-medium">{r.date}</td>
                    <td>{wd}</td>
                    <td className="text-center">{dentists}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        className="form-control form-control-sm"
                        value={r.max_parallel}
                        placeholder={`${dentists} (default)`}
                        onChange={(e) =>
                          updateRow(i, { max_parallel: e.target.value })
                        }
                        disabled={r.is_closed}
                        aria-label={`Max same-time appts for ${r.date}`}
                      />
                      <div className="form-text">
                        Leave blank to default to day’s active dentists (
                        {dentists}).
                      </div>
                      {r.max_parallel !== "" &&
                        Number(r.max_parallel) > dentists &&
                        !r.is_closed && (
                          <small className="text-danger">
                            Cap exceeds available dentists — effective capacity
                            won’t exceed {dentists}.
                          </small>
                        )}
                    </td>

                    {/* Status dropdown */}
                    <td className="text-center">
                      <select
                        className="form-select form-select-sm"
                        value={r.is_closed ? "closed" : "open"}
                        onChange={(e) =>
                          updateRow(i, {
                            is_closed: e.target.value === "closed",
                          })
                        }
                        aria-label={`Status for ${r.date}`}
                      >
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                      </select>
                    </td>

                    {/* Note stays editable even when closed (closure reason) */}
                    <td>
                      <input
                        className="form-control form-control-sm"
                        value={r.note}
                        onChange={(e) => updateRow(i, { note: e.target.value })}
                        placeholder={
                          r.is_closed
                            ? "Reason for closure (shown to users)"
                            : "Optional note"
                        }
                      />
                    </td>

                    <td className="text-center">
                      {cap === Infinity
                        ? r.is_closed
                          ? 0
                          : dentists
                        : effective}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-3">
                    No days found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
