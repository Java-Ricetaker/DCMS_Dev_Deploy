import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";
import ConfirmationModal from "../../components/ConfirmationModal";
import "./ArchivedPatients.css";

const PER_PAGE = 10;

const ArchivedPatients = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [reactivateTarget, setReactivateTarget] = useState(null);
  const [reactivatingId, setReactivatingId] = useState(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 350);

    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    let isMounted = true;

    const fetchRecords = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("page", currentPage);
        params.set("per_page", PER_PAGE);
        if (debouncedSearch) params.set("search", debouncedSearch);

        const response = await api.get(
          `/api/admin/archived-patients?${params.toString()}`
        );
        if (!isMounted) return;

        const payload = response.data || {};
        const data = payload.data || [];

        // If current page is empty but there are previous pages, go back one page
        if (data.length === 0 && payload.current_page > 1) {
          setCurrentPage((prev) => Math.max(1, prev - 1));
          return;
        }

        setRecords(data);
        setPagination({
          current_page: payload.current_page || 1,
          last_page: payload.last_page || 1,
          total: payload.total || data.length,
        });
      } catch (err) {
        if (!isMounted) return;
        console.error("Failed to load archived patients", err);
        setError(
          err.response?.data?.message ||
            "Unable to load archived patients right now."
        );
        setRecords([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchRecords();

    return () => {
      isMounted = false;
    };
  }, [currentPage, debouncedSearch, refreshKey]);

  const totalPages = useMemo(() => pagination.last_page || 1, [pagination]);

  const openReactivateModal = (record) => {
    setReactivateTarget(record);
  };

  const closeReactivateModal = () => {
    setReactivateTarget(null);
  };

  const confirmReactivate = async () => {
    if (!reactivateTarget) return;
    setReactivatingId(reactivateTarget.id);

    try {
      await api.post(
        `/api/admin/archived-patients/${reactivateTarget.id}/reactivate`
      );
      toast.success("Patient account reactivated.");
      closeReactivateModal();
      setRefreshKey((key) => key + 1);
    } catch (err) {
      console.error("Failed to reactivate patient", err);
      toast.error(
        err.response?.data?.message ||
          "Unable to reactivate patient. Please try again."
      );
    } finally {
      setReactivatingId(null);
    }
  };

  const renderTableBody = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan={6} className="text-center py-5 text-muted">
            <div className="spinner-border text-primary me-2" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            Loading archived accounts…
          </td>
        </tr>
      );
    }

    if (error) {
      return (
        <tr>
          <td colSpan={6} className="text-center py-4 text-danger">
            {error}
          </td>
        </tr>
      );
    }

    if (records.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="text-center py-4 text-muted">
            No archived patient accounts found.
          </td>
        </tr>
      );
    }

    return records.map((record) => {
      const fullName = `${record.first_name || ""} ${
        record.last_name || ""
      }`.trim();
      return (
        <tr key={record.id}>
          <td>
            <div className="fw-semibold">{fullName || "Unnamed Patient"}</div>
            {record.middle_name && (
              <div className="small text-muted">{record.middle_name}</div>
            )}
          </td>
          <td>
            <div>{record.email || "—"}</div>
            <div className="small text-muted">
              {record.contact_number || ""}
            </div>
          </td>
          <td>
            {record.last_visit_date ? (
              <span className="badge bg-light text-dark">
                {record.last_visit_date}
              </span>
            ) : (
              <span className="text-muted">No visits recorded</span>
            )}
          </td>
          <td>
            <div>{record.archived_at || "—"}</div>
            <div className="small text-muted">
              {record.archived_reason || "Inactive for 5+ years"}
            </div>
          </td>
          <td>
            {record.archived_by ? (
              <div className="small">
                {record.archived_by.name}
                <div className="text-muted">{record.archived_by.email}</div>
              </div>
            ) : (
              <span className="text-muted">System</span>
            )}
          </td>
          <td className="text-end">
            <button
              type="button"
              className="btn btn-sm btn-outline-success"
              onClick={() => openReactivateModal(record)}
              disabled={reactivatingId === record.id}
            >
              {reactivatingId === record.id ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                  />
                  Working…
                </>
              ) : (
                <>
                  <i className="bi bi-arrow-counterclockwise me-1"></i>
                  Reactivate
                </>
              )}
            </button>
          </td>
        </tr>
      );
    });
  };

  const PaginationControls = () => (
    <div className="d-flex justify-content-between align-items-center px-3 py-2">
      <span className="text-muted small">
        Showing page {pagination.current_page} of {totalPages} •{" "}
        {pagination.total} archived accounts
      </span>
      <div className="btn-group" role="group">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          disabled={pagination.current_page <= 1}
          onClick={() =>
            setCurrentPage((prev) => Math.max(1, prev - 1))
          }
        >
          Previous
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          disabled={pagination.current_page >= totalPages}
          onClick={() =>
            setCurrentPage((prev) => Math.min(totalPages, prev + 1))
          }
        >
          Next
        </button>
      </div>
    </div>
  );

  return (
    <div className="archived-patients-page">
      <div className="card shadow-sm">
        <div className="card-header d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-3">
          <div>
            <h5 className="mb-1">Archived Patient Accounts</h5>
            <p className="text-muted mb-0 small">
              Patients with no visits recorded in the past 5 years. Reactivating
              removes them from this list immediately.
            </p>
          </div>
          <div className="archived-search-group input-group">
            <span className="input-group-text bg-white border-end-0">
              <i className="bi bi-search"></i>
            </span>
            <input
              type="text"
              className="form-control border-start-0"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th scope="col">Patient</th>
                <th scope="col">Contact</th>
                <th scope="col">Last Visit</th>
                <th scope="col">Archived</th>
                <th scope="col">Archived By</th>
                <th scope="col" className="text-end">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>{renderTableBody()}</tbody>
          </table>
        </div>
        <PaginationControls />
      </div>

      <ConfirmationModal
        show={Boolean(reactivateTarget)}
        onConfirm={confirmReactivate}
        onCancel={closeReactivateModal}
        title="Reactivate Patient Account"
        message={`Reactivate access for ${
          reactivateTarget
            ? `${reactivateTarget.first_name || ""} ${
                reactivateTarget.last_name || ""
              }`.trim() || "this patient"
            : "this patient"
        }? They will be able to log in again immediately.`}
        confirmText="Reactivate"
        cancelText="Cancel"
        variant="success"
      />
    </div>
  );
};

export default ArchivedPatients;

