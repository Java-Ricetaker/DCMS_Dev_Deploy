import { createPortal } from 'react-dom';
import './ConfirmationModal.css';

function ConfirmationModal({ show, onConfirm, onCancel, title, message, confirmText = "Confirm", cancelText = "Cancel", variant = "danger" }) {
  if (!show) return null;

  const modalContent = (
    <div className="confirmation-modal-overlay" onClick={onCancel}>
      <div className="confirmation-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="confirmation-modal-header">
          <i className={`bi bi-exclamation-triangle-fill text-${variant} me-2`}></i>
          <h5 className="confirmation-modal-title">{title || "Confirm Action"}</h5>
        </div>
        <div className="confirmation-modal-body">
          <p>{message}</p>
        </div>
        <div className="confirmation-modal-footer">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn btn-${variant}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default ConfirmationModal;

