import { useState } from 'react';

import { recommendPlan, upgradeUrl } from '../utils/api';
import { Icon } from './Icons';

/**
 * Plan-coverage prompt — a port of the module's `PartialCoverageModal`, serving
 * both ways the service can refuse a remediation run.
 *
 * `PARTIAL_REQUIRED` — the plan covers part of the selection. The administrator
 * either upgrades, or ticks the box and continues with the covered pages.
 *
 * `PAGE_LIMIT` — the plan is used up (`pagesRemaining: 0`). The same dialog is
 * shown, but continuing is not offered: there are no pages to run, so a
 * "continue with my current plan" button would only fail again. Upgrading is the
 * only way forward.
 *
 * The headline is the service's own `error` string, so wording changes there
 * reach the administrator without a plugin release.
 */
const PartialCoverageModal = ({ state, user, plans, onClose, onContinue, onToast }) => {
  const [accepted, setAccepted] = useState(false);

  if (!state) {
    return null;
  }

  const { covered, total, message } = state;
  const isFree = user && user.planId === 'free';
  const plan = recommendPlan(plans, total);

  /* Nothing is covered, so there is nothing to continue with. Keyed off the
     number rather than the code, so a PAGE_LIMIT that ever arrives with pages
     left still offers the choice. */
  const canContinue = covered > 0;

  const title = canContinue
    ? isFree
      ? `Free trial covers the first ${covered} pages`
      : `Your current plan covers ${covered} of ${total} pages`
    : message || "You've used all pages included in your current plan.";

  const body = canContinue
    ? `Your PDF${total === covered ? '' : 's'} contain ${total} pages. Upgrade to process all pages, or continue with the ${covered} pages included in your current plan.`
    : `The documents you selected contain ${total.toLocaleString()} pages, and your ${
        isFree ? 'free trial' : 'plan'
      } has no pages left. Upgrade to carry on remediating.`;

  const upgrade = () => {
    // Autologin link — signs the administrator into the accessibility dashboard
    // for this site and lands them on its plans page.
    const target = upgradeUrl();

    if (target) {
      window.open(target, '_blank', 'noopener,noreferrer');
    } else {
      onToast('Open the Plans page in the dashboard to upgrade.', 'info');
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal"
        style={{ width: '540px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aiopdf-partial-title"
      >
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
          <span className="notice-icon" style={{ width: '48px', height: '48px', flexShrink: 0 }}>
            <Icon name={canContinue ? 'info' : 'warning'} size={24} />
          </span>
          <div>
            <h3 id="aiopdf-partial-title" style={{ marginBottom: '8px' }}>
              {title}
            </h3>
            <p
              style={{
                margin: 0,
                color: 'var(--text-soft)',
                fontSize: '15px',
                lineHeight: 1.6,
                fontWeight: 600,
              }}
            >
              {body}
            </p>
          </div>
        </div>

        {plan ? (
          <div
            className="notice-pill"
            style={{ marginTop: '16px', marginBottom: 0, width: '100%' }}
          >
            <Icon name="crown" size={18} />
            <span>
              Recommended: <b>{plan.name}</b>
              <span style={{ color: 'var(--text-muted)' }}>
                {` — ${plan.pages.toLocaleString()} pages · $${plan.price.toLocaleString()}`}
              </span>
            </span>
          </div>
        ) : null}

        {canContinue ? (
          <label className="checkbox-row" style={{ margin: '16px 0 0', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>{`Continue with my ${isFree ? 'free plan' : 'current plan'} (${covered} pages)`}</span>
          </label>
        ) : null}

        {/* Two buttons either way — Cancel replaces the continue action when
            there is nothing to continue with — so the row stays balanced. */}
        <div
          className="modal-actions"
          style={{ marginTop: '22px', justifyContent: 'space-between' }}
        >
          {canContinue ? null : (
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
              Cancel
            </button>
          )}

          <button type="button" className="btn btn-gradient btn-sm" onClick={upgrade}>
            <Icon name="crown" size={17} /> {canContinue ? 'Recommended Plan' : 'Upgrade Plan'}
          </button>

          {canContinue ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!accepted}
              onClick={() => {
                onClose();
                onContinue();
              }}
            >
              <Icon name="sparkles" size={17} /> Start AI Remediation
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export { PartialCoverageModal };
