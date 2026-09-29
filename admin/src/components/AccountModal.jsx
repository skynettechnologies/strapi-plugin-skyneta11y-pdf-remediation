import { useState } from 'react';

import { validateAccount } from '../utils/account';
import { errorMessage } from '../utils/format';
import { Icon } from './Icons';

/**
 * One-time account details, asked at the moment they are first needed.
 *
 * The panel does not gate itself behind this: the whole workspace is on screen
 * from the start, and this dialog opens only when an administrator does
 * something that has to reach the service — uploading a PDF, or crawling the
 * site for them. Once submitted, the action they asked for carries on.
 *
 * The domain field is pre-filled with the host the admin panel is served from,
 * because that is the likely answer, but it is an ordinary editable field: a CMS
 * on `cms.example.com` publishing PDFs for `www.example.com` just types the
 * right one.
 *
 * Submitting calls the service's provision-account endpoint, which registers the
 * account on first use and returns the session — so there is no separate sign-up
 * step. `onSubmit` rejects with the service's own error, which is shown as-is.
 *
 * `values` and `onChange` belong to the caller, not to this component: closing
 * unmounts it, and a half-filled form has to survive that so cancelling does not
 * cost the administrator their typing.
 */
const AccountModal = ({ prompt, values, onChange, onSubmit, onClose }) => {
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (event) => {
    onChange({ [field]: event.target.value });
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFailure(null);
  };

  const submit = (event) => {
    event.preventDefault();

    const found = validateAccount(values);

    setErrors(found);
    setFailure(null);

    if (Object.keys(found).length) {
      return;
    }

    setSubmitting(true);
    onSubmit(values)
      .catch((error) => {
        setFailure(errorMessage(error) || 'Could not set this up. Please try again.');
      })
      .finally(() => setSubmitting(false));
  };

  const field = (name, label, hint, props) => (
    <div className="field">
      <label htmlFor={`aiopdf-${name}`}>
        {label}
        <span className="req">*</span>
      </label>
      <input
        id={`aiopdf-${name}`}
        className="input"
        value={values[name]}
        onChange={set(name)}
        disabled={submitting}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={`aiopdf-${name}-${errors[name] ? 'error' : 'hint'}`}
        {...props}
      />
      {errors[name] ? (
        <div className="form-error" id={`aiopdf-${name}-error`}>
          {errors[name]}
        </div>
      ) : (
        <div className="aiopdf-field-hint" id={`aiopdf-${name}-hint`}>
          {hint}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div
        className="modal aiopdf-account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aiopdf-account-title"
      >
        <div className="sug-head" style={{ marginBottom: '18px' }}>
          <div>
            <h3 id="aiopdf-account-title" style={{ marginBottom: '4px' }}>
              First, a few details
            </h3>
            <div className="sug-sub">
              {prompt || 'Remediation runs under an account for your website.'}
            </div>
          </div>
          <button
            type="button"
            className="icon-btn close-btn-model"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="form-row">
            {field('name', 'Name', 'Your name, or your organisation’s.', {
              type: 'text',
              placeholder: 'Acme Corporation',
              autoComplete: 'organization',
            })}

            {field('email', 'Email address', 'Identifies the account and its plan.', {
              type: 'email',
              placeholder: 'you@example.com',
              autoComplete: 'email',
            })}
          </div>

          {field(
            'domain',
            'Website domain',
            'The site these PDFs belong to. Change it if this is not it.',
            {
              type: 'text',
              placeholder: 'example.com',
              autoComplete: 'url',
            }
          )}

          {failure ? (
            <div className="rule-callout error" style={{ margin: '4px 0 20px' }}>
              <span className="icon">
                <Icon name="warning" size={20} />
              </span>
              <div>
                <strong>That did not work</strong>
                <p>{failure}</p>
              </div>
            </div>
          ) : null}

          <div className="modal-actions" style={{ marginTop: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-gradient btn-sm" disabled={submitting}>
              {submitting ? (
                <>
                  <Icon name="spinner" size={17} /> Setting up…
                </>
              ) : (
                <>
                  <Icon name="sparkles" size={17} /> Save and continue
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export { AccountModal };
