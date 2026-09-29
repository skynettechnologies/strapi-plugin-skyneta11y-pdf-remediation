/*
 * Settings page smoke test.
 *
 * Mounts Settings → AI PDF Remediation → Configuration in jsdom and checks that
 * the Strapi design-system composition renders, that every configurable field is
 * present, and that saving writes the override layer the API layer reads back.
 *
 * Run with: node test/settings.mjs
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/*
 * Importing @strapi/strapi/admin drags in the whole admin app, which reaches for
 * stylesheets, `?raw` imports and a few Node built-ins that a browser bundle has
 * no use for. None of them matter to this page, so they are stubbed out.
 */
const stubAwkwardImports = {
  name: 'stub-awkward-imports',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /\.css(\?.*)?$/ }, (args) => ({
      path: args.path,
      namespace: 'stub',
    }));

    pluginBuild.onResolve(
      { filter: /^(util|fs|path|os|stream|crypto|events|assert)$/ },
      (args) => ({
        path: args.path,
        namespace: 'stub',
      })
    );

    pluginBuild.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export default {}; export const __stub = true;',
      loader: 'js',
    }));
  },
};

const bundle = await build({
  entryPoints: [path.join(dir, 'settings-entry.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  /* The plugin source uses the automatic JSX runtime; pin it here so a
     jsconfig.json picked up from disk cannot switch esbuild to the classic
     transform, which would need a React import in every file. */
  tsconfigRaw: { compilerOptions: { jsx: 'react-jsx' } },
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': '"development"' },
  inject: [path.join(dir, 'process-shim.js')],
  plugins: [stubAwkwardImports],
  logLevel: 'error',
});

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://cms.example.com/admin/settings/skyneta11y-pdf-remediation',
  pretendToBeVisual: true,
  runScripts: 'dangerously',
});

const { window } = dom;

window.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
window.IS_REACT_ACT_ENVIRONMENT = false;
window.matchMedia = () => ({
  matches: false,
  media: '',
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
});
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/* Globals the real admin app sets up before any page renders. */
window.strapi = {
  backendURL: 'https://cms.example.com',
  isEE: false,
  features: { isEnabled: () => false },
  projectType: 'Community',
  flags: { nps: false, promoteEE: false, docLinks: false },
};

const originalError = console.error;
const warnings = [];

console.error = (...args) => warnings.push(args.map((a) => (a && a.stack) || String(a)).join(' '));

window.eval(bundle.outputFiles[0].text);
window.__mount();

const tick = async (ms = 30) => {
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
};

await tick();

const doc = window.document;
const $$ = (selector) => Array.from(doc.querySelectorAll(selector));
const results = [];

function check(name, fn) {
  try {
    fn();
    results.push(['pass', name]);
  } catch (error) {
    results.push(['FAIL', `${name} — ${error.message}`]);
  }
}

check('renders the settings header', () => {
  assert.ok(doc.body.textContent.includes('SkynetA11y PDF Remediation'), 'title missing');
  assert.ok(
    doc.body.textContent.includes('Connection settings for the accessibility remediation service'),
    'subtitle missing'
  );
});

check('renders every configurable field', () => {
  const labels = $$('label').map((el) => el.textContent.trim());

  [
    'API base URL',
    'Provisioning API key',
    'Website',
    'Account email',
    'Website Scan domain',
    'Plan',
    'Country',
    'Dashboard URL',
    'Upgrade URL override',
  ].forEach((label) => assert.ok(labels.includes(label), `missing field: ${label}`));
});

check('shows the effective configuration', () => {
  const body = doc.body.textContent;

  assert.ok(body.includes('Effective configuration'), 'summary section missing');
  assert.ok(
    body.includes('https://pdfnodeapi.skynettechnologies.com'),
    'API base URL not resolved'
  );
  /* No `website` configured, so both it and the scan domain come from the
     admin panel's host. */
  assert.ok(body.includes('cms.example.com'), 'website fallback not resolved');
  assert.ok(body.includes('no-reply@cms.example.com'), 'account email not derived');
});

check('Save and Reset actions are present', () => {
  const buttons = $$('button').map((el) => el.textContent.trim());

  assert.ok(buttons.includes('Save'), 'Save button missing');
  assert.ok(buttons.includes('Reset to defaults'), 'Reset button missing');
});

check('no React errors or warnings were logged', () => {
  assert.equal(warnings.length, 0, warnings.join('\n').slice(0, 900));
});

console.error = originalError;

let failed = 0;

results.forEach(([status, name]) => {
  if (status === 'FAIL') {
    failed += 1;
  }

  process.stdout.write(`${status === 'pass' ? '  ✓' : '  ✗'} ${name}\n`);
});

process.stdout.write(`\n${results.length - failed}/${results.length} checks passed\n`);
process.exit(failed ? 1 : 0);
