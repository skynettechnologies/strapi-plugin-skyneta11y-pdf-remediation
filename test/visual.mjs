/*
 * Visual check.
 *
 * Renders the plugin's panel in a real browser against the mocked service, in a
 * frame that stands in for the Strapi admin's left navigation, and writes
 * screenshots to test/screenshots/.
 *
 * This is an eyeball tool, not an assertion suite — it is not part of
 * `yarn test`. Run it after changing anything about layout or spacing:
 *
 *     yarn add --dev playwright && npx playwright install chromium   # once
 *     node test/visual.mjs
 *
 * Playwright is deliberately NOT a dependency of this plugin — it would pull a
 * browser download into every `yarn install` for a script nobody needs to run to
 * build or ship. It is loaded on demand below.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;

try {
  ({ chromium } = await import('playwright'));
} catch {
  process.stderr.write(
    'This script needs Playwright, which is not installed.\n\n' +
      '  yarn add --dev playwright\n' +
      '  npx playwright install chromium\n\n' +
      'It is deliberately not a dependency of the plugin: it would pull a browser\n' +
      'download into every install, and nothing else here needs it. Remove it again\n' +
      'with `yarn remove playwright` when you are done.\n'
  );
  process.exit(1);
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'screenshots');

fs.mkdirSync(outDir, { recursive: true });

/* ---- documents the mocked service returns ------------------------ */
const DOCUMENTS = [
  { id: 'd1', name: 'annual-report-2026.pdf', source: 'file', status: 'ready', pages: 12 },
  {
    id: 'd2',
    name: 'terms-and-conditions.pdf',
    source: 'url',
    status: 'ready',
    pages: 4,
    sourceUrl: 'https://example.com/terms-and-conditions.pdf',
  },
  { id: 'd3', name: 'draft-policy.pdf', source: 'file', status: 'scanning', pages: null },
  { id: 'd4', name: 'employee-handbook.pdf', source: 'file', status: 'ready', pages: 34 },
];

const bundle = await build({
  entryPoints: [path.join(dir, 'entry.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  tsconfigRaw: { compilerOptions: { jsx: 'react-jsx' } },
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'error',
});

const appCode = bundle.outputFiles[0].text;

/*
 * A stand-in for the Strapi admin chrome: the 56px navigation rail on the left
 * and the neutral page ground, so the section's own padding can be judged
 * against the same edges it will have in the real panel.
 */
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>SkynetA11y PDF Remediation — visual check</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f6f6f9; font-family: system-ui, sans-serif; }
  .frame { display: flex; min-height: 100vh; }
  .nav {
    width: 56px; flex: 0 0 56px; background: #ffffff;
    border-right: 1px solid #eaeaef;
  }
  .nav i {
    display: block; width: 32px; height: 32px; margin: 12px auto;
    border-radius: 8px; background: #f0f0ff;
  }
  .nav i:first-child { background: #4945ff; }
  main { flex: 1; min-width: 0; }
</style>
</head>
<body>
  <div class="frame">
    <nav class="nav" aria-hidden="true">
      <i></i><i></i><i></i><i></i><i></i><i></i>
    </nav>
    <main><div id="root"></div></main>
  </div>

  <script>
    /* Mocked remediation service. */
    const DOCUMENTS = ${JSON.stringify(DOCUMENTS)};

    function reply(body) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(body),
        blob: () => Promise.resolve(new Blob([''])),
      });
    }

    window.fetch = (url, options = {}) => {
      const parsed = new URL(String(url));
      const route = (options.method || 'GET') + ' ' + parsed.pathname;

      if (route === 'POST /api/billing/provision-account') return reply({ token: 't' });
      if (route === 'GET /api/billing/plans') return reply({ plans: [] });
      if (route === 'GET /api/auth/me') {
        return reply({ user: { planId: 'free', pagesRemaining: 5, domains: ['example.com'] } });
      }
      if (route === 'GET /api/documents') {
        const type = parsed.searchParams.get('type');
        if (!type) return reply({ documents: DOCUMENTS });
        if (type === 'upload') return reply({ documents: DOCUMENTS, total: DOCUMENTS.length });
        return reply({ documents: [], total: 0 });
      }
      return reply({ documents: [], total: 0 });
    };
  </script>
  <script>${appCode}</script>
  <script>window.__mount();</script>
</body>
</html>`;

const pagePath = path.join(outDir, 'page.html');

fs.writeFileSync(pagePath, html, 'utf8');

/* CHROME_PATH lets a sandbox or CI point at a Chromium it already has, rather
   than the one Playwright would download. */
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

for (const [name, width, height] of [
  ['desktop', 1600, 1000],
  ['narrow', 900, 1000],
]) {
  const page = await browser.newPage({ viewport: { width, height } });

  await page.goto(`file://${pagePath}`);
  await page.waitForSelector('.aiopdf-app .data-table tbody tr', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `upload-${name}.png`), fullPage: true });

  /* The other two tabs share the same page frame — check their padding too. */
  for (const tab of ['Website Scan', 'Remediated']) {
    await page.getByRole('button', { name: tab }).click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(outDir, `${tab.toLowerCase().replace(/ /g, '-')}-${name}.png`),
      fullPage: true,
    });
  }

  await page.getByRole('button', { name: 'Upload' }).click();
  await page.waitForTimeout(300);

  /* Measure the gap between the navigation rail and the section's own frame. */
  if (name === 'desktop') {
    const gaps = await page.evaluate(() => {
      const app = document.querySelector('.aiopdf-app');
      const title = document.querySelector('.aiopdf_dashboard-page-title-wrapper');
      const nav = document.querySelector('.nav');
      const titleBox = title.getBoundingClientRect();

      return {
        left: Math.round(titleBox.left - nav.getBoundingClientRect().right),
        top: Math.round(titleBox.top),
        right: Math.round(window.innerWidth - titleBox.right),
        appPadding: window.getComputedStyle(app).padding,
      };
    });

    process.stdout.write(
      `gap left ${gaps.left}px · top ${gaps.top}px · right ${gaps.right}px · padding ${gaps.appPadding}\n`
    );
  }

  await page.close();
}

await browser.close();

process.stdout.write(`screenshots written to ${path.relative(process.cwd(), outDir)}\n`);
