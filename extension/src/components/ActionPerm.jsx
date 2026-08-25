import './ActionPerm.css';

export default function ActionConfirmation({
  action,
  onApprove,
  onReject,
}) {
  if (!action) return null;

  return (
    <div className="action-confirmation__overlay">
      <div
        className="action-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-confirmation-title"
      >
        <span className="action-confirmation__icon">⚠</span>

        <h2
          id="action-confirmation-title"
          className="action-confirmation__title"
        >
          Confirm Agent Action
        </h2>

        <p className="action-confirmation__description">
          PrivacyLens wants to perform the following action:
        </p>

        <div className="action-confirmation__details">
          <span className="action-confirmation__action">
            {action.label || action.type}
          </span>

          {action.targetLabel && (
            <span className="action-confirmation__target">
              Target: {action.targetLabel}
            </span>
          )}
        </div>

        <div className="action-confirmation__buttons">
          <button
            type="button"
            className="action-confirmation__reject"
            onClick={onReject}
          >
            Cancel
          </button>

          <button
            type="button"
            className="action-confirmation__approve"
            onClick={onApprove}
          >
            Allow Action
          </button>
        </div>
      </div>
    </div>
  );
}