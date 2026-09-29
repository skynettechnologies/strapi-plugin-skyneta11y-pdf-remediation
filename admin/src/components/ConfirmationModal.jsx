import { Icon } from './Icons';

/**
 * Remove confirmation — a port of the module's `ConfirmationModal`.
 *
 * `state` is `{ title, message, itemName, confirmText, onConfirm }` or null.
 */
const ConfirmationModal = ({ state, onClose }) => {
  if (!state) {
    return null;
  }

  const confirm = () => {
    onClose();

    if (state.onConfirm) {
      state.onConfirm();
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="confirmation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aiopdf-confirm-title"
      >
        <div className="modal-header">
          <h2 id="aiopdf-confirm-title">{state.title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="modal-body">
          <p>
            {state.message}
            {state.itemName ? <strong> {state.itemName}</strong> : null}
          </p>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-delete" onClick={confirm}>
            {state.confirmText || 'Remove'}
          </button>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export { ConfirmationModal };
