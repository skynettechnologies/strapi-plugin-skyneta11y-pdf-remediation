/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  AI PDF Remediation — plugin configuration                               │
 * │                                                                          │
 * │  This is the file to edit. Everything the plugin needs lives here; there │
 * │  is nothing to add to your Strapi application.                          │
 * │                                                                          │
 * │  After changing it, rebuild the plugin (`yarn build`) and then the       │
 * │  admin panel of the application it is installed in.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * An empty string means "derive it" — the comment on each field says from
 * what. Nothing here has to be filled in for the plugin to work.
 */
export const pluginConfig = {
  /** Origin of the AI PDF Remediation backend. */
  apiBaseUrl: 'https://livepdfapi.skynettechnologies.us',

  /**
   * Key for the provisioning endpoint, sent as `X-Api-Key`.
   *
   * SECURITY: this plugin is admin-only, so the key is compiled into the admin
   * bundle and is readable by anyone who can load the Strapi admin panel. That
   * is acceptable when the panel is behind Strapi's authentication and only
   * staff reach it. If it must never leave the server, point `sessionUrl` at a
   * Strapi route that performs the provisioning call — see the README.
   */
  provisionApiKey: 'PDF-REMEDATION-PLAN-CHECK',

  /* ---- The account -------------------------------------------------
   *
   * By default the plugin asks. An administrator opens it, fills in a name,
   * email and domain, and that is what the remediation account is registered
   * under — nothing is sent to the service before they submit.
   *
   * Setting BOTH `accountEmail` and `website` below pins the account for the
   * whole install: the form is skipped and the panel connects on load. Setting
   * only one leaves the form in place with that field pre-filled.
   * ------------------------------------------------------------------ */

  /** Name the account is registered under. Pre-fills the form. */
  accountName: '',

  /** Address the account is provisioned under. Pre-fills the form. */
  accountEmail: '',

  /** Site the account is registered against. Pre-fills the form. */
  website: '',

  /**
   * Domain the Website Scan tab crawls.
   *
   * Empty (the default) uses the connected account's domain, falling back to the
   * account's first registered domain when the service does not recognise it.
   */
  activeDomain: '',

  /** Plan new accounts are provisioned on. */
  planId: 'free',

  /** Two-letter country code recorded on the account. */
  country: 'US',

  /** Dashboard the coverage modal's upgrade button links to. */
  dashboardUrl: 'https://ada.skynettechnologies.us',

  /** Autologin link for that button. Empty derives it from the website. */
  upgradeUrl: '',

  /**
   * Server-side session endpoint. When set, sign-in is a single POST to it and
   * `provisionApiKey` is never used or shipped. Left empty by default — see
   * "Security note on the API key" in the README for the route to add.
   */
  sessionUrl: '',

  /** CSRF token for the POST above, when the endpoint requires one. */
  csrfToken: '',

  /**
   * Fingerprint of the account this panel signs in as. Empty derives it from
   * the website and account email, which is what scopes the cached session
   * token to the account it belongs to.
   */
  accountKey: '',

  /**
   * Tab to open on load: 'upload', 'scan' or 'remediated'.
   *
   * Empty (the default) opens Upload, and lets `?tab=` in the URL pick one, so
   * a link straight to a tab keeps working. Setting it pins the tab and ignores
   * the query string.
   */
  initialTab: '',

  /** localStorage key the session token lives under. */
  tokenKey: 'aiopdf_token',
};

export default pluginConfig;
