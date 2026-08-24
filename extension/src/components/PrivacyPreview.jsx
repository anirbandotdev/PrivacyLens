import React, { useState } from 'react';
import './PrivacyPreview.css';

export default function PrivacyPreview() {
  const [showMasked, setShowMasked] = useState(false);

  return (
    <div className="privacy-preview">
      <div className="privacy-preview__header">
        <span className="privacy-preview__title">Privacy Preview</span>
        <button
          className={`privacy-preview__toggle ${showMasked ? 'privacy-preview__toggle--masked' : ''}`}
          onClick={() => setShowMasked(v => !v)}
        >
          {showMasked ? '🛡 Masked' : '👁 Original'}
        </button>
      </div>
      <div className="privacy-preview__viewport">
        <div className={`privacy-preview__content ${showMasked ? 'privacy-preview__content--masked' : ''}`}>
          {/* Simulated page content */}
          <div className="preview-page">
            <div className="preview-page__header">
              <div className="preview-page__nav">
                <span className="preview-dot" /><span className="preview-dot" /><span className="preview-dot" />
              </div>
              <div className="preview-page__url">https://example.com/profile</div>
            </div>
            <div className="preview-page__body">
              <div className="preview-row">
                <div className={`preview-avatar ${showMasked ? 'preview-avatar--blurred' : ''}`}>
                  <span>👤</span>
                </div>
                <div className="preview-info">
                  <span className="preview-name">
                    {showMasked ? '{NAME_TOKEN}' : 'John Doe'}
                  </span>
                  <span className="preview-email">
                    {showMasked ? '{EMAIL_TOKEN}' : 'john.doe@email.com'}
                  </span>
                </div>
              </div>
              <div className="preview-field">
                <span className="preview-field__label">Phone</span>
                <span className="preview-field__value">
                  {showMasked ? '{PHONE_TOKEN}' : '+1 (555) 123-4567'}
                </span>
              </div>
              <div className="preview-field">
                <span className="preview-field__label">SSN</span>
                <span className="preview-field__value">
                  {showMasked ? '{SSN_TOKEN}' : '***-**-6789'}
                </span>
              </div>
              <div className="preview-field">
                <span className="preview-field__label">Address</span>
                <span className="preview-field__value">
                  {showMasked ? '{ADDRESS_TOKEN}' : '123 Main St, Anytown'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
