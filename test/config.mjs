/*
 * Configuration derivation test.
 *
 * The plugin ships with every identity field blank, so what it actually signs in
 * as is decided entirely by these derivations. They are checked directly here,
 * against a jsdom window, rather than only through the UI.
 *
 * Run with: node test/config.mjs
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

const bundle = await build({
  entryPoints: [path.join(dir, 'config-entry.js')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'AioPdfTest',
  platform: 'browser',
  jsx: 'automatic',
  tsconfigRaw: { compilerOptions: { jsx: 'react-jsx' } },
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'error',
});

const code = bundle.outputFiles[0].text;
const results = [];

function check(name, fn) {
  try {
    fn();
    results.push(['pass', name]);
  } catch (error) {
    results.push(['FAIL', `${name} — ${error.message}`]);
  }
}

/** Loads the plugin's config + API modules against a given admin panel URL. */
function loadAt(url) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url,
    runScripts: 'dangerously',
  });

  dom.window.eval(code);

  return dom.window.AioPdfTest;
}

/* ---- the shipped defaults, on a normal host ---------------------- */
const plain = loadAt('https://cms.example.com/admin/plugins/strapi-plugin-skyneta11y-pdf-remediation');

check('pluginConfig ships with every identity field blank', () => {
  assert.equal(plain.pluginConfig.website, '');
  assert.equal(plain.pluginConfig.accountEmail, '');
  assert.equal(plain.pluginConfig.activeDomain, '');
  assert.equal(plain.pluginConfig.sessionUrl, '');
});

check('website derives from window.location.hostname', () => {
  assert.equal(plain.website(), 'cms.example.com');
});

check('the account email derives as no-reply@<host>', () => {
  assert.equal(plain.accountEmail(), 'no-reply@cms.example.com');
});

check('the Website Scan domain derives from the same host', () => {
  assert.equal(plain.activeDomain(), 'cms.example.com');
});

check('the upgrade link is the base64 autologin for that host', () => {
  assert.equal(
    plain.upgradeUrl(),
    `https://ada.skynettechnologies.us/front/autologin/${Buffer.from('cms.example.com').toString('base64')}`
  );
});

check('API URLs are built from the configured base', () => {
  assert.equal(
    plain.apiUrl('/documents'),
    'https://livepdfapi.skynettechnologies.com/api/documents'
  );
});

/* ---- a port, and a host that is not a valid email domain --------- */
const local = loadAt('http://localhost:1337/admin/plugins/strapi-plugin-skyneta11y-pdf-remediation');

check('a port is stripped from the derived website', () => {
  assert.equal(local.website(), 'localhost');
});

check('a dotless host gets a .local suffix on the email only', () => {
  /* `no-reply@localhost` is not a well-formed address; the service rejects it. */
  assert.equal(local.accountEmail(), 'no-reply@localhost.local');
  assert.equal(local.activeDomain(), 'localhost');
});

const ip = loadAt('http://192.168.1.20:1337/admin');

check('a bare IP host is handled the same way', () => {
  assert.equal(ip.website(), '192.168.1.20');
  assert.equal(ip.accountEmail(), 'no-reply@192.168.1.20.local');
});

/* ---- the session token is scoped to the account ------------------ */
check('two different hosts do not share a cached session token', () => {
  assert.notEqual(plain.storageKey(), local.storageKey());
  assert.ok(plain.storageKey().startsWith('aiopdf_token_'));
});

/* ---- Settings-page overrides win over the file ------------------- */
const overridden = loadAt('https://cms.example.com/admin');

overridden.writeOverrides({ website: 'https://www.acme.com/', activeDomain: 'docs.acme.com' });

check('a saved override replaces the derived website', () => {
  assert.equal(overridden.website(), 'www.acme.com', 'override not applied or not normalised');
  assert.equal(overridden.accountEmail(), 'no-reply@www.acme.com');
  assert.equal(overridden.activeDomain(), 'docs.acme.com');
});

overridden.clearOverrides();

check('clearing overrides returns to the plugin file', () => {
  assert.equal(overridden.website(), 'cms.example.com');
  assert.equal(overridden.activeDomain(), 'cms.example.com');
});

let failed = 0;

results.forEach(([status, name]) => {
  if (status === 'FAIL') {
    failed += 1;
  }

  process.stdout.write(`${status === 'pass' ? '  ✓' : '  ✗'} ${name}\n`);
});

process.stdout.write(`\n${results.length - failed}/${results.length} checks passed\n`);
process.exit(failed ? 1 : 0);
