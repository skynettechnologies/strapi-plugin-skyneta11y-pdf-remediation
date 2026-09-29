/**
 * The remediation account this panel signs in as.
 *
 * The plugin used to invent an identity from the admin panel's hostname —
 * `no-reply@cms.example.com` — and provision silently on boot. It no longer
 * does: an administrator enters a real name, email and domain once, and that is
 * what the account is registered under. Nothing is sent to the service until
 * they submit the form.
 *
 * Because this plugin is admin-only and has no server, the details live in the
 * administrator's own browser, next to the session token they produce. That is
 * per-browser rather than per-install: a second administrator fills the form in
 * once too. Provisioning is idempotent, so entering the same email lands on the
 * same account and the same document queue — it is not a second registration.
 *
 * `pluginConfig.accountEmail` and `pluginConfig.website`, when both are set,
 * stand in for a submitted form: the plugin connects without asking. Set either
 * one alone and it is treated as a default that pre-fills the form instead.
 */
import { getConfig } from './config';

export const ACCOUNT_KEY = 'aiopdf_account';

/** Trims a value to a string, tolerating null/undefined. */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalises a domain the way the service wants it: a bare host, no scheme, no
 * port, no trailing path. `https://Example.com:8080/docs` → `example.com`.
 */
export function normaliseDomain(value) {
  let domain = text(value);

  if (!domain) {
    return '';
  }

  if (domain.indexOf('//') !== -1) {
    try {
      domain = new URL(domain).hostname;
    } catch {
      domain = domain.split('//').pop();
    }
  }

  return domain
    .split('/')[0]
    .split('?')[0]
    .replace(/:\d+$/, '')
    .replace(/^\.+|\.+$/g, '')
    .toLowerCase();
}

/** A complete account, or null. */
function shape(source) {
  if (!source) {
    return null;
  }

  const account = {
    name: text(source.name),
    email: text(source.email).toLowerCase(),
    domain: normaliseDomain(source.domain),
  };

  return account.name && account.email && account.domain ? account : null;
}

/** The account saved from the form, or null if nobody has connected yet. */
export function readAccount() {
  try {
    return shape(JSON.parse(window.localStorage.getItem(ACCOUNT_KEY) || 'null'));
  } catch {
    /* storage unavailable, or the entry is not JSON */
    return null;
  }
}

/** Persists a submitted account. Returns the normalised form, or null. */
export function writeAccount(values) {
  const account = shape(values);

  if (!account) {
    return null;
  }

  try {
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    /* storage unavailable — the session still works until the tab closes */
  }

  return account;
}

export function clearAccount() {
  try {
    window.localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * The account the plugin should sign in as: a pinned one from
 * `pluginConfig.js`, otherwise whatever was submitted through the form.
 */
export function resolveAccount() {
  const config = getConfig();
  const pinned = shape({
    name: config.accountName || config.website,
    email: config.accountEmail,
    domain: config.website,
  });

  return pinned || readAccount();
}

/** Whether the panel can talk to the service without asking for details. */
export function hasAccount() {
  return Boolean(resolveAccount());
}

/**
 * The domain to offer before anybody has said otherwise: the host the admin
 * panel is served from, or a configured `website` when one is pinned.
 *
 * This is a *suggestion in a field the administrator can edit*, not an identity
 * the plugin invents and registers on its own — which is the whole difference
 * from the old `no-reply@<host>` behaviour.
 */
export function defaultDomain() {
  const config = getConfig();
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  return normaliseDomain(config.website || host);
}

/** Values the form opens with. */
export function accountDefaults() {
  const stored = readAccount();

  if (stored) {
    return stored;
  }

  const config = getConfig();

  return {
    name: text(config.accountName),
    email: text(config.accountEmail),
    domain: defaultDomain(),
  };
}

/** Basic shape check, so an obvious typo is caught before the round trip. */
export function validateAccount(values) {
  const errors = {};

  if (!text(values.name)) {
    errors.name = 'Enter the name this account should be registered under.';
  }

  const email = text(values.email);

  if (!email) {
    errors.email = 'Enter an email address.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'That does not look like an email address.';
  }

  const domain = normaliseDomain(values.domain);

  if (!domain) {
    errors.domain = 'Enter the website these PDFs belong to.';
  } else if (domain.indexOf('.') === -1) {
    errors.domain = 'Enter a full domain, such as example.com.';
  }

  return errors;
}
