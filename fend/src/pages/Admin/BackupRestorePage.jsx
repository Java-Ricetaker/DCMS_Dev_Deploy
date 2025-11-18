import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import ConfirmationModal from '../../components/ConfirmationModal';
import toast from 'react-hot-toast';
import './BackupRestorePage.css';

const BackupRestorePage = () => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [integrityResults, setIntegrityResults] = useState(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState(null);
  const [restoreMode, setRestoreMode] = useState(null); // 'server' or 'upload'
  const [restoring, setRestoring] = useState(false);
  const [integrityMode, setIntegrityMode] = useState(null); // 'server' or 'upload'
  const [selectedBackupForIntegrity, setSelectedBackupForIntegrity] = useState(null);
  const [uploadFileForIntegrity, setUploadFileForIntegrity] = useState(null);
  const [uploadFileForRestore, setUploadFileForRestore] = useState(null);

  useEffect(() => {
    fetchBackups();
  }, []);

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/admin/backup-restore');
      setBackups(res.data.backups || []);
    } catch (error) {
      console.error('Failed to fetch backups:', error);
      toast.error(error?.response?.data?.message || 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      const res = await api.post('/api/admin/backup-restore/create');
      toast.success('Backup created successfully');
      await fetchBackups();
    } catch (error) {
      console.error('Failed to create backup:', error);
      toast.error(error?.response?.data?.message || 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (filename) => {
    try {
      const res = await api.get(`/api/admin/backup-restore/download/${filename}`, {
        responseType: 'blob',
      });
      
      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Backup downloaded');
    } catch (error) {
      console.error('Failed to download backup:', error);
      toast.error(error?.response?.data?.message || 'Failed to download backup');
    }
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete backup "${filename}"?`)) {
      return;
    }

    try {
      await api.delete(`/api/admin/backup-restore/${filename}`);
      toast.success('Backup deleted successfully');
      await fetchBackups();
    } catch (error) {
      console.error('Failed to delete backup:', error);
      toast.error(error?.response?.data?.message || 'Failed to delete backup');
    }
  };

  const handleCheckIntegrity = async () => {
    if (!selectedBackupForIntegrity && !uploadFileForIntegrity) {
      toast.error('Please select a backup or upload a file');
      return;
    }

    try {
      setCheckingIntegrity(true);
      setIntegrityResults(null);

      const formData = new FormData();
      
      if (integrityMode === 'upload' && uploadFileForIntegrity) {
        formData.append('file', uploadFileForIntegrity);
      } else if (integrityMode === 'server' && selectedBackupForIntegrity) {
        formData.append('filename', selectedBackupForIntegrity);
      }

      const res = await api.post('/api/admin/backup-restore/check-integrity', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setIntegrityResults(res.data);
      
      if (res.data.missing_tables.length === 0 && 
          res.data.table_differences.length === 0 &&
          res.data.extra_tables.length === 0) {
        toast.success('Integrity check passed - backup matches current database');
      } else {
        toast('Integrity check found differences - see results below', {
          icon: '⚠️',
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Failed to check integrity:', error);
      toast.error(error?.response?.data?.message || 'Failed to check integrity');
    } finally {
      setCheckingIntegrity(false);
    }
  };

  const handleRestoreConfirm = async () => {
    try {
      setRestoring(true);
      setShowRestoreModal(false);

      const formData = new FormData();
      
      if (restoreMode === 'upload' && uploadFileForRestore) {
        formData.append('file', uploadFileForRestore);
      } else if (restoreMode === 'server' && selectedBackupForRestore) {
        formData.append('filename', selectedBackupForRestore);
      }

      await api.post('/api/admin/backup-restore/restore', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success('Database restored successfully');
      
      // Reset state
      setSelectedBackupForRestore(null);
      setRestoreMode(null);
      setUploadFileForRestore(null);
    } catch (error) {
      console.error('Failed to restore database:', error);
      toast.error(error?.response?.data?.message || 'Failed to restore database');
    } finally {
      setRestoring(false);
    }
  };

  const openRestoreModal = (mode, backupFilename = null) => {
    if (mode === 'server' && backupFilename) {
      setSelectedBackupForRestore(backupFilename);
      setRestoreMode('server');
      setShowRestoreModal(true);
    } else if (mode === 'upload' && uploadFileForRestore) {
      setRestoreMode('upload');
      setShowRestoreModal(true);
    } else {
      toast.error('Please select a backup file first');
    }
  };

  if (loading) {
    return (
      <div className="container-fluid py-4">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container-fluid py-4 backup-restore-page">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">Database Backup & Restore</h2>
        <button
          className="btn btn-primary"
          onClick={handleCreateBackup}
          disabled={creating}
        >
          {creating ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" />
              Creating...
            </>
          ) : (
            <>
              <i className="bi bi-plus-circle me-2" />
              Create Backup
            </>
          )}
        </button>
      </div>

      {/* Backups List */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="mb-0">Server Backups</h5>
        </div>
        <div className="card-body">
          {backups.length === 0 ? (
            <p className="text-muted mb-0">No backups found. Create your first backup above.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Created</th>
                    <th>Size</th>
                    <th>Age</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <tr key={backup.filename}>
                      <td>
                        <code className="text-primary">{backup.filename}</code>
                      </td>
                      <td>{backup.created_at_formatted}</td>
                      <td>{backup.size_formatted}</td>
                      <td>{backup.age}</td>
                      <td className="text-end">
                        <div className="btn-group btn-group-sm">
                          <button
                            className="btn btn-outline-primary"
                            onClick={() => handleDownload(backup.filename)}
                            title="Download"
                          >
                            <i className="bi bi-download" />
                          </button>
                          <button
                            className="btn btn-outline-danger"
                            onClick={() => handleDelete(backup.filename)}
                            title="Delete"
                          >
                            <i className="bi bi-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Integrity Check Section */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="mb-0">Check Data Integrity</h5>
        </div>
        <div className="card-body">
          <div className="row mb-3">
            <div className="col-md-6">
              <label className="form-label">Select from server backups:</label>
              <select
                className="form-select"
                value={selectedBackupForIntegrity || ''}
                onChange={(e) => {
                  setSelectedBackupForIntegrity(e.target.value);
                  setIntegrityMode(e.target.value ? 'server' : null);
                  setUploadFileForIntegrity(null);
                }}
              >
                <option value="">-- Select backup --</option>
                {backups.map((backup) => (
                  <option key={backup.filename} value={backup.filename}>
                    {backup.filename} ({backup.age})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Or upload backup file:</label>
              <input
                type="file"
                className="form-control"
                accept=".encrypted"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setUploadFileForIntegrity(file);
                    setIntegrityMode('upload');
                    setSelectedBackupForIntegrity(null);
                  }
                }}
              />
            </div>
          </div>
          <button
            className="btn btn-info"
            onClick={handleCheckIntegrity}
            disabled={checkingIntegrity || (!selectedBackupForIntegrity && !uploadFileForIntegrity)}
          >
            {checkingIntegrity ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Checking...
              </>
            ) : (
              <>
                <i className="bi bi-shield-check me-2" />
                Check Integrity
              </>
            )}
          </button>

          {/* Integrity Results */}
          {integrityResults && (
            <div className="mt-4">
              <h6>Integrity Check Results</h6>
              <div className="alert alert-info">
                <strong>Backup Age:</strong> {integrityResults.backup_age || 'Unknown'}
                <br />
                <strong>Backup Timestamp:</strong> {integrityResults.backup_timestamp || 'Unknown'}
              </div>

              <div className="row">
                <div className="col-md-6">
                  <div className="card bg-light">
                    <div className="card-body">
                      <h6 className="card-title">Summary</h6>
                      <ul className="list-unstyled mb-0">
                        <li><strong>Backup Tables:</strong> {integrityResults.summary.backup_tables_count}</li>
                        <li><strong>Current Tables:</strong> {integrityResults.summary.current_tables_count}</li>
                        <li><strong>Missing Tables:</strong> {integrityResults.summary.missing_tables_count}</li>
                        <li><strong>Extra Tables:</strong> {integrityResults.summary.extra_tables_count}</li>
                        <li><strong>Tables with Differences:</strong> {integrityResults.summary.tables_with_differences}</li>
                        <li><strong>Total Backup Records:</strong> {integrityResults.summary.total_backup_records.toLocaleString()}</li>
                        <li><strong>Total Current Records:</strong> {integrityResults.summary.total_current_records.toLocaleString()}</li>
                        <li><strong>Records Difference:</strong> 
                          <span className={integrityResults.summary.records_difference > 0 ? 'text-success' : integrityResults.summary.records_difference < 0 ? 'text-danger' : ''}>
                            {' '}{integrityResults.summary.records_difference > 0 ? '+' : ''}{integrityResults.summary.records_difference.toLocaleString()}
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {integrityResults.missing_tables.length > 0 && (
                <div className="mt-3">
                  <h6 className="text-danger">Missing Tables (in backup but not in current database)</h6>
                  <ul>
                    {integrityResults.missing_tables.map((item, idx) => (
                      <li key={idx}>
                        <strong>{item.table}</strong>: {item.backup_records} records in backup
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {integrityResults.extra_tables.length > 0 && (
                <div className="mt-3">
                  <h6 className="text-warning">Extra Tables (in current database but not in backup)</h6>
                  <ul>
                    {integrityResults.extra_tables.map((item, idx) => (
                      <li key={idx}>
                        <strong>{item.table}</strong>: {item.current_records} records
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {integrityResults.table_differences.length > 0 && (
                <div className="mt-3">
                  <h6 className="text-warning">Tables with Record Count Differences</h6>
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Table</th>
                          <th>Backup Records</th>
                          <th>Current Records</th>
                          <th>Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {integrityResults.table_differences.map((diff, idx) => (
                          <tr key={idx}>
                            <td><strong>{diff.table}</strong></td>
                            <td>{diff.backup_records.toLocaleString()}</td>
                            <td>{diff.current_records.toLocaleString()}</td>
                            <td className={diff.difference > 0 ? 'text-success' : 'text-danger'}>
                              {diff.difference > 0 ? '+' : ''}{diff.difference.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Restore Section */}
      <div className="card">
        <div className="card-header bg-danger text-white">
          <h5 className="mb-0">Restore Database</h5>
        </div>
        <div className="card-body">
          <div className="alert alert-danger">
            <strong>Warning:</strong> Restoring will replace ALL current database data with the selected backup. This action is IRREVERSIBLE.
          </div>
          
          <div className="row mb-3">
            <div className="col-md-6">
              <label className="form-label">Select from server backups:</label>
              <select
                className="form-select"
                value={selectedBackupForRestore || ''}
                onChange={(e) => {
                  setSelectedBackupForRestore(e.target.value);
                  setRestoreMode(e.target.value ? 'server' : null);
                  setUploadFileForRestore(null);
                }}
              >
                <option value="">-- Select backup --</option>
                {backups.map((backup) => (
                  <option key={backup.filename} value={backup.filename}>
                    {backup.filename} ({backup.age})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Or upload backup file:</label>
              <input
                type="file"
                className="form-control"
                accept=".encrypted"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setUploadFileForRestore(file);
                    setRestoreMode('upload');
                    setSelectedBackupForRestore(null);
                  }
                }}
              />
            </div>
          </div>
          
          <button
            className="btn btn-danger"
            onClick={() => openRestoreModal(restoreMode, selectedBackupForRestore)}
            disabled={restoring || (!selectedBackupForRestore && !uploadFileForRestore)}
          >
            {restoring ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Restoring...
              </>
            ) : (
              <>
                <i className="bi bi-arrow-counterclockwise me-2" />
                Restore Database
              </>
            )}
          </button>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      <ConfirmationModal
        show={showRestoreModal}
        onConfirm={handleRestoreConfirm}
        onCancel={() => {
          setShowRestoreModal(false);
          setSelectedBackupForRestore(null);
        }}
        title="Confirm Database Restore"
        message="This action is IRREVERSIBLE and will replace all current database data with the selected backup. Current data will be permanently lost. Are you sure you want to proceed?"
        confirmText="Yes, Restore Database"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default BackupRestorePage;

