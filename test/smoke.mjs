/*
 * Runtime smoke test.
 *
 * Bundles the plugin's HomePage, mounts it in jsdom against a mocked
 * remediation service, and checks that the boot sequence, tables, tab
 * switching, selection maths and modals all behave.
 *
 * Run with: node test/smoke.mjs
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */
const DOCUMENTS = [
  { id: 'd1', name: 'annual-report.pdf', source: 'file', status: 'ready', pages: 12 },
  {
    id: 'd2',
    name: 'terms.pdf',
    source: 'url',
    status: 'ready',
    pages: 4,
    sourceUrl: 'https://example.com/terms.pdf',
  },
  { id: 'd3', name: 'draft.pdf', source: 'file', status: 'scanning', pages: null },
  {
    id: 'd4',
    name: 'brochure.pdf',
    source: 'web',
    domain: 'example.com',
    status: 'ready',
    pages: 7,
    sourceUrl: 'https://example.com/brochure.pdf',
  },
  {
    id: 'd5',
    name: 'flyer.pdf',
    source: 'web',
    domain: 'example.com',
    status: 'pending_scan',
    pages: null,
    sourceUrl: 'https://example.com/flyer.pdf',
  },
  {
    id: 'd6',
    name: 'handbook.pdf',
    source: 'file',
    status: 'remediated',
    pages: 9,
    remediatedName: 'handbook-remediated.pdf',
    remediatedAt: '2026-08-14T10:00:00.000Z',
    remediatedPages: 9,
  },
];

const calls = [];

/* Flipped by the tests to steer /api/remediation/start. */
const service = { startMode: 'ok', polls: 0 };

function json(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob([''])),
  });
}

function mockFetch(url, options = {}) {
  const method = options.method || 'GET';
  const parsed = new URL(url);
  const route = `${method} ${parsed.pathname}`;

  calls.push({ route, search: parsed.search, options });

  if (route === 'POST /api/billing/provision-account') {
    return json({ token: 'test-token', user: { id: 1 }, isNewToApp: false });
  }

  if (route === 'GET /api/billing/plans') {
    return json({
      plans: [
        { id: 'free', name: 'Free', price: 0, pages: 5 },
        { id: 'starter', name: 'Starter', price: 29, pages: 100 },
        { id: 'pro', name: 'Pro', price: 99, pages: 1000 },
      ],
    });
  }

  if (route === 'GET /api/auth/me') {
    return json({ user: { planId: 'free', pagesRemaining: 5, domains: ['example.com'] } });
  }

  if (route === 'GET /api/documents') {
    const type = parsed.searchParams.get('type');

    if (!type) {
      return json({ documents: DOCUMENTS });
    }

    const perPage = Number(parsed.searchParams.get('perPage') || 10);
    const search = (parsed.searchParams.get('search') || '').toLowerCase();

    let rows = DOCUMENTS;

    if (type === 'upload') {
      rows = rows.filter((d) => d.source !== 'web' && d.status !== 'remediated');
    } else if (type === 'scan') {
      rows = rows.filter((d) => d.source === 'web');
    } else {
      rows = rows.filter((d) => d.status === 'remediated');
    }

    if (search) {
      rows = rows.filter((d) => d.name.toLowerCase().includes(search));
    }

    return json({ documents: rows.slice(0, perPage), total: rows.length });
  }

  if (route === 'POST /api/remediation/start') {
    if (service.startMode === 'partial') {
      return json(
        {
          error: 'Your plan does not cover every selected page.',
          code: 'PARTIAL_REQUIRED',
          pagesRemaining: 5,
          totalPages: 12,
        },
        402
      );
    }

    return json({
      job: { id: 'job-1', status: 'processing', progress: 10 },
      user: { planId: 'free', pagesRemaining: 0, domains: ['example.com'] },
    });
  }

  if (route === 'GET /api/remediation/jobs/job-1') {
    service.polls += 1;

    return json({
      job:
        service.polls < 2
          ? { id: 'job-1', status: 'processing', progress: 55 }
          : { id: 'job-1', status: 'completed', progress: 100 },
      user: { planId: 'free', pagesRemaining: 0, domains: ['example.com'] },
    });
  }

  if (route.startsWith('GET /api/documents/') && route.endsWith('/suggestions')) {
    return json({
      documentName: 'handbook-remediated.pdf',
      pages: 9,
      analyzed: 'remediated',
      passed: 1,
      failed: 1,
      deepScan: false,
      items: [
        {
          status: 'passed',
          title: 'Document language is set',
          detail: 'lang="en"',
          plain: 'The file declares its language.',
          why: 'Screen readers pick the right voice.',
          fix: 'The language entry was already present.',
          example: { before: '/Lang missing', after: '/Lang (en-US)' },
        },
        {
          status: 'failed',
          title: 'Images are missing alternative text',
          detail: '3 figures',
          plain: 'Three images have no description.',
          why: 'Non-sighted readers get nothing.',
          fix: 'AI generates alt text for each figure.',
          willAutoFix: true,
          example: { before: '<Figure>', after: '<Figure Alt="Sales chart">' },
        },
      ],
    });
  }

  return json({ documents: [], total: 0 });
}

/* ------------------------------------------------------------------ *
 * Bundle
 * ------------------------------------------------------------------ */
const bundle = await build({
  entryPoints: [path.join(dir, 'entry.jsx')],
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
  logLevel: 'error',
});

const code = bundle.outputFiles[0].text;

/* ------------------------------------------------------------------ *
 * Mount
 * ------------------------------------------------------------------ */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://cms.example.com/admin/plugins/skyneta11y-pdf-remediation',
  pretendToBeVisual: true,
  runScripts: 'dangerously',
});

const { window } = dom;

window.fetch = (url, options) => mockFetch(String(url), options);
window.scrollTo = () => {};
window.matchMedia =
  window.matchMedia ||
  (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
/* Not using React's act() helper — this drives the DOM the way a browser does,
   so tell React it is not in an act environment and keep console.error clean
   for the failures that actually matter. */
window.IS_REACT_ACT_ENVIRONMENT = false;

/* jsdom has no ResizeObserver; the design system asks for one. */
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const originalError = console.error;
const warnings = [];

console.error = (...args) => {
  warnings.push(args.map(String).join(' '));
};

window.eval(code);
window.__mount();

/*
 * Lets React flush. jsdom drives React's scheduler through MessageChannel, so a
 * single timeout is not always enough to see a passive effect's fetch land —
 * several short turns are.
 */
const tick = async (ms = 30) => {
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
};

const doc = window.document;
const text = () => doc.body.textContent;
const $ = (selector) => doc.querySelector(selector);
const $$ = (selector) => Array.from(doc.querySelectorAll(selector));
const byText = (selector, needle) =>
  $$(selector).find((el) => (el.textContent || '').trim().includes(needle));

const click = (el) => {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
};

await tick(120);

const results = [];

function check(name, fn) {
  try {
    fn();
    results.push(['pass', name]);
  } catch (error) {
    results.push(['FAIL', `${name} — ${error.message}`]);
  }
}

/* ------------------------------------------------------------------ *
 * Assertions
 * ------------------------------------------------------------------ */

check('mounts under the scoped wrapper', () => {
  assert.ok($('.aiopdf-app.aiopdf-embedded.aiopdf-strapi'), 'wrapper missing');
  assert.equal($('.aiopdf-app').getAttribute('data-theme'), 'light');
});

check('injects the module stylesheet once', () => {
  const styles = $$('style#aiopdf-remediation-styles');

  assert.equal(styles.length, 1);
  assert.ok(styles[0].textContent.includes('.aiopdf-app'), 'stylesheet is empty');
  assert.ok(!/\n\s*body\s*\{/.test(styles[0].textContent), 'page-level body rule leaked in');
});

check('provisions the account from the admin panel host', () => {
  const signIn = calls.find((c) => c.route === 'POST /api/billing/provision-account');

  assert.ok(signIn, 'never provisioned a session');

  const body = JSON.parse(signIn.options.body);

  assert.equal(body.website, 'cms.example.com');
  assert.equal(body.name, 'cms.example.com');
  assert.equal(body.company_name, 'cms.example.com');
  assert.equal(body.email, 'no-reply@cms.example.com');
  assert.equal(body.plan_id, 'free');
  assert.equal(body.country, 'US');
  assert.equal(signIn.options.headers['X-Api-Key'], 'PDF-REMEDATION-PLAN-CHECK');
});

check('signs in before loading tables', () => {
  const order = calls.map((c) => c.route);
  const signIn = order.indexOf('POST /api/billing/provision-account');
  const firstTable = order.findIndex((r, i) => r === 'GET /api/documents' && calls[i].search);

  assert.ok(signIn > -1, 'never provisioned a session');
  assert.ok(firstTable === -1 || signIn < firstTable, 'fetched a table before signing in');
});

check('sends the bearer token on later requests', () => {
  const tableCall = calls.find((c) => c.route === 'GET /api/documents' && c.search);

  assert.ok(tableCall, 'no table request made');
  assert.equal(tableCall.options.headers.Authorization, 'Bearer test-token');
});

check('renders the three tabs', () => {
  const labels = $$('.aiopdf_dashboard-pdf-remediation-type-list-tab button').map((b) =>
    b.textContent.trim()
  );

  assert.deepEqual(labels, ['Upload', 'Website Scan', 'Remediated']);
});

check('opens on the Upload tab with its rows', () => {
  const panels = $$('.aiopdf-tab-panel');

  assert.equal(panels.length, 3);
  assert.equal(panels[0].hidden, false);
  assert.equal(panels[1].hidden, true);
  assert.ok(text().includes('annual-report.pdf'), 'upload row missing');
  assert.ok(text().includes('terms.pdf'), 'url row missing');
});

check('shows a status chip instead of a page count while scanning', () => {
  const row = $$('#root tr').find((tr) => tr.textContent.includes('draft.pdf'));

  assert.ok(row, 'scanning row missing');
  assert.ok(row.textContent.includes('Scanning'), 'no scanning chip');
  assert.equal(row.querySelector('input[type="checkbox"]').disabled, true, 'chip row selectable');
});

check('paginates with a record count', () => {
  assert.ok(
    text().includes('Showing 1 - 3 of 3 item(s)'),
    `record count wrong: ${text().slice(0, 200)}`
  );
});

check('bulk footer starts empty and its buttons are disabled', () => {
  const footer = $('.bulk-footer');

  assert.ok(footer.textContent.includes('Selected: 0'));
  assert.ok(footer.textContent.includes('Total: 0'));
  assert.equal(byText('.bulk-actions button', 'Remove Selected').disabled, true);
  assert.equal(byText('.bulk-actions button', 'Add Selected for Remediation').disabled, true);
});

/* --- selection ---------------------------------------------------- */
const firstBox = $$('#root tbody input[type="checkbox"]').find((box) => !box.disabled);

/* `.click()` runs jsdom's activation behaviour, which toggles the box and fires
   the event React's change plugin listens for — setting `.checked` by hand is
   swallowed by React's value tracker. */
firstBox.click();
await tick();

check('ticking a row updates the bulk footer from the full queue', () => {
  const footer = $('.bulk-footer');

  assert.ok(footer.textContent.includes('Selected: 1'), footer.textContent.trim());
  assert.ok(footer.textContent.includes('Total: 12'), footer.textContent.trim());
  assert.equal(byText('.bulk-actions button', 'Add Selected for Remediation').disabled, false);
});

check('per-row Remove is disabled while a bulk selection exists', () => {
  const removes = $$('#root .link-danger');

  assert.ok(removes.length > 0, 'no per-row remove buttons');
  assert.ok(
    removes.every((button) => button.disabled),
    'per-row remove still enabled during a bulk selection'
  );
});

/* --- confirmation modal ------------------------------------------- */
firstBox.click();
await tick();

click($('#root .link-danger'));
await tick();

check('per-row Remove opens the confirmation modal', () => {
  const modal = $('.confirmation-modal');

  assert.ok(modal, 'modal did not open');
  assert.ok(modal.textContent.includes('Remove Document'));
  assert.ok(modal.textContent.includes('annual-report.pdf'));
});

click(byText('.modal-footer button', 'Cancel'));
await tick();

check('Cancel closes the confirmation modal', () => {
  assert.equal($('.confirmation-modal'), null);
});

/* --- website scan tab --------------------------------------------- */
click(byText('.aiopdf_dashboard-pdf-remediation-type-list-tab button', 'Website Scan'));
await tick(120);

check('Website Scan tab loads the account domain and its rows', () => {
  const panels = $$('.aiopdf-tab-panel');

  assert.equal(panels[1].hidden, false, 'scan panel still hidden');
  assert.ok(text().includes('Find PDFs on example.com'), 'crawl button missing');
  assert.ok(text().includes('brochure.pdf'), 'scan row missing');
  assert.ok(text().includes('Pending scan'), 'pending-scan chip missing');
});

check('the scan request is scoped to the account domain', () => {
  const scanCall = calls.filter((c) => c.search && c.search.includes('type=scan')).pop();

  assert.ok(scanCall, 'no scan table request');
  assert.ok(scanCall.search.includes('domain=example.com'), scanCall.search);
});

check('switching tabs clears the selection', () => {
  assert.ok($('.aiopdf-tab-panel:not([hidden]) .bulk-footer').textContent.includes('Selected: 0'));
});

/* --- remediated tab ----------------------------------------------- */
click(byText('.aiopdf_dashboard-pdf-remediation-type-list-tab button', 'Remediated'));
await tick(120);

check('Remediated tab lists finished files', () => {
  assert.ok(text().includes('handbook-remediated.pdf'), 'remediated row missing');
  assert.ok(text().includes('Aug 14, 2026'), 'remediated date missing');
  assert.ok(byText('.table-actions button', 'AI Suggestions'), 'suggestions button missing');
  assert.ok(byText('.table-actions button', 'Download'), 'download button missing');
});

/* --- suggestions modal -------------------------------------------- */
click(byText('.table-actions button', 'AI Suggestions'));
await tick(120);

check('AI Suggestions modal renders the report, failures first', () => {
  const modal = $('.suggestions-modal');

  assert.ok(modal, 'suggestions modal did not open');
  assert.ok(modal.textContent.includes('1 passed'), modal.textContent.slice(0, 200));
  assert.ok(modal.textContent.includes('1 to fix'));

  const titles = Array.from(modal.querySelectorAll('.sug-title')).map((el) => el.textContent);

  assert.equal(titles[0], 'Images are missing alternative text', 'failed check not sorted first');
});

click($('.suggestions-modal .sug-row'));
await tick();

check('a suggestion row expands to its before/after detail', () => {
  const body = $('.suggestions-modal .sug-body');

  assert.ok(body, 'row did not expand');
  assert.ok(body.textContent.includes('AI generates alt text'));
  assert.ok(body.textContent.includes('<Figure Alt="Sales chart">'));
});

click($('.suggestions-modal .icon-btn'));
await tick();

check('the suggestions modal closes', () => {
  assert.equal($('.suggestions-modal'), null);
});

/* --- remediation + job polling ------------------------------------ */
const goToTab = async (label) => {
  click(byText('.aiopdf_dashboard-pdf-remediation-type-list-tab button', label));
  await tick(60);
};

const selectFirstReady = async () => {
  const panel = $('.aiopdf-tab-panel:not([hidden])');
  const box = Array.from(panel.querySelectorAll('tbody input[type="checkbox"]')).find(
    (el) => !el.disabled
  );

  box.click();
  await tick();

  return box;
};

await goToTab('Upload');
await selectFirstReady();
click(
  byText('.aiopdf-tab-panel:not([hidden]) .bulk-actions button', 'Add Selected for Remediation')
);
await tick(60);

check('starting remediation posts the selected ids', () => {
  const start = calls.filter((c) => c.route === 'POST /api/remediation/start').pop();

  assert.ok(start, 'remediation was never started');

  const body = JSON.parse(start.options.body);

  assert.deepEqual(body.documentIds, ['d1']);
  assert.equal(body.allowPartial, false);
});

check('a running job shows the progress bar and locks the action', () => {
  const panel = $('.aiopdf-tab-panel:not([hidden])');

  assert.ok(panel.querySelector('.inline-progress'), 'progress bar missing');
  assert.ok(panel.textContent.includes('AI remediation in progress'), 'progress label missing');
  assert.equal(
    byText('.aiopdf-tab-panel:not([hidden]) .bulk-actions button', 'Add Selected for Remediation')
      .disabled,
    true,
    'remediation button still enabled while a job runs'
  );
});

/* The job completes on its second poll; the panel then waits 1.2 s before
   clearing the progress bar. */
await tick(300);
await tick(300);

check('the job is polled once a second while it processes', () => {
  const polls = calls.filter((c) => c.route === 'GET /api/remediation/jobs/job-1');

  assert.ok(polls.length >= 2, `expected repeated polling, saw ${polls.length}`);
});

check('a completed job switches to the Remediated tab and toasts', () => {
  const panels = $$('.aiopdf-tab-panel');

  assert.equal(panels[2].hidden, false, 'did not switch to the Remediated tab');
  assert.ok(text().includes('Remediation complete!'), 'no completion toast');
});

check('the progress bar clears once the job is done', () => {
  assert.equal($('.inline-progress'), null, 'progress bar still showing');
});

/* --- partial coverage modal --------------------------------------- */
service.startMode = 'partial';

await goToTab('Upload');
await selectFirstReady();
click(
  byText('.aiopdf-tab-panel:not([hidden]) .bulk-actions button', 'Add Selected for Remediation')
);
await tick(60);

check('PARTIAL_REQUIRED opens the coverage modal with a recommendation', () => {
  const modal = $('#root .modal-backdrop .modal');

  assert.ok(modal, 'coverage modal did not open');
  assert.ok(
    modal.textContent.includes('Free trial covers the first 5 pages'),
    modal.textContent.slice(0, 200)
  );
  assert.ok(modal.textContent.includes('contain 12 pages'), 'page totals missing');
  /* Smallest paid plan that covers 12 pages. */
  assert.ok(modal.textContent.includes('Starter'), 'wrong plan recommended');
  assert.ok(modal.textContent.includes('100 pages'), 'plan size missing');
});

check('Start AI Remediation is disabled until the box is ticked', () => {
  assert.equal(byText('#root .modal-actions button', 'Start AI Remediation').disabled, true);
});

$('#root .checkbox-row input').click();
await tick();

check('ticking the box enables Start AI Remediation', () => {
  assert.equal(byText('#root .modal-actions button', 'Start AI Remediation').disabled, false);
});

service.startMode = 'ok';
click(byText('#root .modal-actions button', 'Start AI Remediation'));
await tick(60);

check('continuing sends allowPartial', () => {
  const start = calls.filter((c) => c.route === 'POST /api/remediation/start').pop();

  assert.equal(JSON.parse(start.options.body).allowPartial, true);
  assert.equal($('#root .modal-backdrop'), null, 'coverage modal stayed open');
});

check('no React errors or warnings were logged', () => {
  assert.equal(warnings.length, 0, warnings.join('\n').slice(0, 900));
});

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */
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
