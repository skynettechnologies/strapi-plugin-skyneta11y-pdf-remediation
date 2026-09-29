/*
 * API layer for the AI PDF Remediation service.
 *
 * A port of the standalone build's `js/api.js` to an ES module. Every request
 * carries `Authorization: Bearer <token>` when a token is known; the backend
 * rejects /api/documents and everything below it with 401 otherwise.
 * /api/billing/plans is public.
 *
 * Configuration is read through `getConfig()` on every call rather than
 * captured at import time, so saving in the plugin's Settings page takes
 * effect without reloading the admin panel.
 */
import { getConfig } from './config';
import { resolveAccount } from './account';

/* ------------------------------------------------------------------ *
 * Identity
 *
 * Everything here comes from the account an administrator entered in the
 * connect form (see utils/account.js). There is no derivation from the admin
 * panel's hostname any more: if nobody has connected, these are empty and the
 * panel shows the form instead of talking to the service.
 * ------------------------------------------------------------------ */

/** The site the remediation account is registered against. */
export function website() {
  const account = resolveAccount();

  return account ? account.domain : '';
}

/** The address the account is provisioned under. */
export function accountEmail() {
  const account = resolveAccount();

  return account ? account.email : '';
}

/**
 * The domain the Website Scan tab crawls, before the account's own list is
 * consulted. A configured `activeDomain` pins it; otherwise it is the domain on
 * the account.
 */
export function activeDomainFrom(config) {
  return config.activeDomain || website();
}

export function activeDomain() {
  return activeDomainFrom(getConfig());
}

/**
 * Autologin link behind the coverage modal's upgrade button.
 *
 * The token is `base64(domain|pf)` — the `|pf` marker goes INSIDE the encoding,
 * so it is `btoa` of the host and the suffix together. The dashboard decodes the
 * token and reads that suffix to land the visitor on the PDF plans page rather
 * than the general one.
 */
export function upgradeUrl() {
  const config = getConfig();

  if (config.upgradeUrl) {
    return config.upgradeUrl;
  }

  const host = website();

  return host ? `${config.dashboardUrl}/front/autologin/${window.btoa(`${host}|pf`)}` : '';
}

/** Absolute URL for a backend endpoint, e.g. apiUrl('/documents'). */
export function apiUrl(path) {
  const { apiBaseUrl } = getConfig();

  return `${apiBaseUrl}/api${path.charAt(0) === '/' ? path : `/${path}`}`;
}

/* ------------------------------------------------------------------ *
 * Session token
 * ------------------------------------------------------------------ */

/**
 * Storage key for the session token, scoped to the account it belongs to.
 *
 * Scoping matters: the token is what lets the panel skip signing in, so a token
 * cached under a shared key would silently keep an old account alive after the
 * configured domain changed. With the account folded into the key, a changed
 * account simply finds no token and signs in again.
 */
export function storageKey() {
  const config = getConfig();
  const identity = resolveAccount();
  const account = config.accountKey || (identity ? `${identity.domain}|${identity.email}` : '');
  const fingerprint = account
    ? window.btoa(unescape(encodeURIComponent(account))).replace(/=+$/, '')
    : '';

  return fingerprint ? `${config.tokenKey}_${fingerprint}` : config.tokenKey;
}

export function token() {
  try {
    return window.localStorage.getItem(storageKey());
  } catch {
    return null;
  }
}

export function setToken(value) {
  try {
    if (value) {
      window.localStorage.setItem(storageKey(), value);
    } else {
      window.localStorage.removeItem(storageKey());
    }
  } catch {
    /* storage unavailable (private mode) — requests simply go unauthenticated */
  }
}

/**
 * The remediation job this browser last started, if it was still running.
 *
 * Kept beside the session token, and scoped the same way, so a reload can pick
 * the job back up: without it the progress bar disappears on refresh while the
 * service carries on working, and the only sign left is a row stuck on
 * "Processing".
 */
export function activeJobId() {
  try {
    return window.localStorage.getItem(`${storageKey()}_job`);
  } catch {
    return null;
  }
}

export function setActiveJobId(id) {
  try {
    if (id) {
      window.localStorage.setItem(`${storageKey()}_job`, id);
    } else {
      window.localStorage.removeItem(`${storageKey()}_job`);
    }
  } catch {
    /* storage unavailable — the job still runs, it just cannot be resumed */
  }
}

/** Authorization header for hand-rolled fetch calls (file downloads). */
export function authHeaders() {
  const value = token();

  return value ? { Authorization: `Bearer ${value}` } : {};
}

/**
 * A token may also arrive as `?token=…`. It is stored and stripped from the
 * visible URL so it is not left sitting in the address bar or in a copied link.
 */
export function adoptTokenFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('token');

    if (!value) {
      return;
    }

    setToken(value);
    params.delete('token');

    const query = params.toString();

    window.history.replaceState(
      {},
      '',
      window.location.pathname + (query ? `?${query}` : '') + window.location.hash
    );
  } catch {
    /* malformed URL — nothing to adopt */
  }
}

/**
 * Clears tokens written under the bare `tokenKey`, which could belong to any
 * account, rather than trusting them.
 */
export function reconcileAccount() {
  const { tokenKey } = getConfig();

  try {
    if (window.localStorage.getItem(tokenKey)) {
      window.localStorage.removeItem(tokenKey);
    }

    window.localStorage.removeItem(`${tokenKey}_account`);
  } catch {
    /* storage unavailable — nothing to clean up */
  }
}

/* ------------------------------------------------------------------ *
 * Sign-in
 *
 * One call to the service's provisioning endpoint does both jobs: it registers
 * the account on first use and returns a session on every use thereafter. It is
 * idempotent — the same email comes back as the same account with
 * `isNewToApp: false` — so there is no separate registration step and repeat
 * calls cannot create duplicate accounts.
 * ------------------------------------------------------------------ */

/**
 * POST {apiBaseUrl}/api/billing/provision-account — registers and signs in.
 *
 * `account` is the name/email/domain an administrator submitted; omit it and
 * the one already connected is used. Throws on failure so the connect form can
 * show the service's own reason (a rejected domain, a malformed address)
 * instead of a generic "could not sign in".
 */
export async function provisionSession(account) {
  const config = getConfig();
  const identity = account || resolveAccount();

  if (!identity) {
    return false;
  }

  const res = await fetch(apiUrl('/billing/provision-account'), {
    method: 'POST',
    headers: {
      'X-Api-Key': config.provisionApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: identity.name,
      email: identity.email,
      company_name: identity.name,
      website: identity.domain,
      plan_id: config.planId,
      country: config.country,
    }),
  });

  let data = {};

  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || !data || !data.token) {
    throw new ApiError(res.status, data);
  }

  setToken(data.token);

  return true;
}

/**
 * Asks a host-supplied server endpoint for a session instead.
 *
 * Unused in the shipped configuration — set `sessionUrl` to a Strapi route that
 * performs the provisioning call server-side, and the API key never reaches the
 * browser. See the README.
 */
export async function serverSession() {
  const config = getConfig();
  const headers = { Accept: 'application/json' };

  if (config.csrfToken) {
    headers['X-CSRF-TOKEN'] = config.csrfToken;
  }

  try {
    const res = await fetch(config.sessionUrl, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
    });

    if (!res.ok) {
      return false;
    }

    const data = await res.json();

    if (!data || !data.token) {
      return false;
    }

    setToken(data.token);

    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves true once a module token is in storage, false otherwise.
 *
 * Never rejects: this is the silent path — boot, and the one retry after a 401 —
 * where there is no form on screen to show a reason to. The connect form calls
 * `provisionSession` directly so it can surface the service's message.
 */
export function signIn() {
  if (getConfig().sessionUrl) {
    return serverSession();
  }

  return provisionSession().catch(() => false);
}

/**
 * Resolves to true when a usable session exists — reusing the stored token if
 * there is one, and provisioning otherwise. An expired stored token is caught
 * by the 401 retry in `request` rather than probed here, which keeps boot to a
 * single round trip.
 */
export function ensureSession() {
  reconcileAccount();

  if (token()) {
    return Promise.resolve(true);
  }

  return signIn();
}

/* ------------------------------------------------------------------ *
 * Request plumbing
 * ------------------------------------------------------------------ */

export class ApiError extends Error {
  constructor(status, data) {
    super(String((data && data.error) || 'Request failed'));
    this.name = 'ApiError';
    this.status = status;
    this.code = data && data.code;
    this.data = data || {};
  }
}

async function request(path, options = {}, isRetry = false) {
  const headers = { ...(options.headers || {}) };
  const current = token();

  if (current) {
    headers.Authorization = `Bearer ${current}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(apiUrl(path), {
    method: options.method || 'GET',
    body: options.body,
    headers,
  });

  let data = {};

  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (res.ok) {
    return data;
  }

  // The session is a short-lived JWT. One silent re-issue keeps a long-open
  // panel working instead of failing every later action. `isRetry` bounds it to
  // a single attempt per call.
  if (res.status === 401 && !isRetry) {
    setToken(null);

    const ok = await signIn();

    if (!ok) {
      throw new ApiError(res.status, data);
    }

    return request(path, options, true);
  }

  throw new ApiError(res.status, data);
}

export const raw = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body || {}),
    }),
  del: (path) => request(path, { method: 'DELETE' }),
};

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

/** GET /api/auth/me — the signed-in user (plan, pages remaining, domains). */
export async function fetchMe() {
  const data = await raw.get('/auth/me');

  return data.user;
}

/** GET /api/billing/plans */
export async function fetchPlans() {
  const data = await raw.get('/billing/plans');

  return data.plans || [];
}

/**
 * GET /api/documents — the full unpaginated list.
 *
 * Used to work out remediation eligibility across the WHOLE queue rather than
 * just the visible table page.
 */
export async function fetchDocuments() {
  const data = await raw.get('/documents');

  return data.documents || [];
}

/**
 * GET /api/documents?type=…&page=…&perPage=… — server-side paginated, filtered
 * and searched fetch for a single tab.
 */
export function fetchDocumentsPage(params) {
  const qs = new URLSearchParams();

  qs.set('type', params.type);
  qs.set('page', String(params.page));
  qs.set('perPage', String(params.perPage));

  if (params.search) {
    qs.set('search', params.search);
  }

  if (params.status && params.status !== 'all') {
    qs.set('status', params.status);
  }

  if (params.domain) {
    qs.set('domain', params.domain);
  }

  if (params.source && params.source !== 'all') {
    qs.set('source', params.source);
  }

  return raw.get(`/documents?${qs.toString()}`);
}

/** POST /api/documents/upload — multipart, field name `file`. */
export async function uploadPdf(file) {
  const form = new FormData();

  form.append('file', file);

  const data = await raw.post('/documents/upload', form);

  return data.document;
}

/** POST /api/documents/:id/scan — reads the PDF and fills in its page count. */
export async function scanPdfUrl(id) {
  const data = await raw.post(`/documents/${id}/scan`);

  return data.document;
}

/** POST /api/documents/crawl — sweeps a domain for linked PDFs. */
export function crawlDomain(domain) {
  return raw.post('/documents/crawl', { domain });
}

/** DELETE /api/documents/:id */
export async function removeDocument(id) {
  await raw.del(`/documents/${id}`);

  return id;
}

/** POST /api/remediation/start */
export function startRemediation(documentIds, allowPartial) {
  return raw.post('/remediation/start', {
    documentIds,
    allowPartial: Boolean(allowPartial),
  });
}

/** GET /api/remediation/jobs/:id — polled while a job is processing. */
export function pollJob(jobId) {
  return raw.get(`/remediation/jobs/${jobId}`);
}

/**
 * GET /api/documents/:id/download — fetched as a blob with the auth token
 * attached, then handed to the browser as a save.
 */
export async function downloadRemediated(docId, fileName, isRetry = false) {
  try {
    const res = await fetch(apiUrl(`/documents/${docId}/download`), { headers: authHeaders() });

    // Same single silent re-issue as `request` — this path bypasses it.
    if (res.status === 401 && !isRetry) {
      setToken(null);

      const ok = await signIn();

      return ok ? downloadRemediated(docId, fileName, true) : false;
    }

    if (!res.ok) {
      return false;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    return true;
  } catch {
    return false;
  }
}

/** Smallest plan that covers `pages` — falls back to the largest one. */
export function recommendPlan(plans, pages) {
  const paid = (plans || []).filter((plan) => plan.price > 0);

  if (!paid.length) {
    return null;
  }

  const sorted = paid.slice().sort((a, b) => a.pages - b.pages);

  return sorted.find((plan) => plan.pages >= pages) || sorted[sorted.length - 1];
}
