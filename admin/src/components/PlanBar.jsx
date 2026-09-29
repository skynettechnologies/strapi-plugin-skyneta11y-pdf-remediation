import { upgradeUrl } from '../utils/api';
import { Icon } from './Icons';

/** Amber from here on: the plan is nearly gone. */
const WARN_AT = 80;

/**
 * Which plan the account is on and how much of it is left, under the account
 * line.
 *
 * Everything comes from `GET /api/auth/me`, which returns `planName`,
 * `planPages` and `pagesRemaining` on the user — so there is nothing to join
 * against the plans list and no extra request to make. The same response comes
 * back with a started run, and the panel reads it again when a job finishes,
 * which is what makes the count fall live rather than going stale until the
 * next reload.
 *
 * Renders nothing until the user is loaded, and drops the pages chip (keeping
 * the plan's name) if the service ever answers without a page allowance — a
 * plan with no ceiling has nothing to count down.
 */
const PlanBar = ({ user }) => {
  if (!user || !user.planName) {
    return null;
  }

  const allowance = Number(user.planPages);
  const remaining = Math.max(0, Number(user.pagesRemaining) || 0);
  const metered = Number.isFinite(allowance) && allowance > 0;

  const used = metered ? Math.min(allowance, Math.max(0, allowance - remaining)) : 0;
  const percent = metered ? Math.min(100, Math.round((used / allowance) * 100)) : 0;

  /* Keyed off what is left rather than the percentage, so the last page of a
     large plan still reads as "nearly out" and zero always reads as empty. */
  const tone = remaining <= 0 ? 'error' : percent >= WARN_AT ? 'pending' : 'completed';

  /* The same autologin link the coverage modal opens. An anchor rather than a
     button: it goes somewhere, so middle-click and "open in new tab" should
     work the way they do everywhere else. */
  const upgrade = upgradeUrl();

  return (
    <div className="aiopdf-plan-bar">
      <span className="status-chip ready">{user.planName}</span>

      {metered ? (
        <span className={`status-chip ${tone}`}>
          {`${remaining.toLocaleString()} ${remaining === 1 ? 'page' : 'pages'} remaining`}
        </span>
      ) : null}

      {upgrade ? (
        <a
          className="btn btn-gradient btn-sm aiopdf-plan-upgrade"
          href={upgrade}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="crown" size={16} /> Upgrade
        </a>
      ) : null}
    </div>
  );
};

export { PlanBar, WARN_AT };
