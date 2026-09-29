#!/usr/bin/env node
/*
 * Turns `admin/src/styles/pdf-remediation.css` into an ES module that exports
 * the stylesheet as a string.
 *
 * The plugin injects that string into a <style> element at runtime rather than
 * importing the .css file directly, because `strapi-plugin build` is a
 * JavaScript bundler first and its handling of CSS entry points varies between
 * releases. A plain string has no such dependency: it compiles everywhere and
 * ships inside the same bundle as the components that need it.
 *
 * Run it after editing the stylesheet:
 *
 *     npm run styles
 */
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = path.join(__dirname, '..', 'admin', 'src', 'styles', 'pdf-remediation.css');
const TARGET = path.join(__dirname, '..', 'admin', 'src', 'styles', 'css.js');

const css = fs.readFileSync(SOURCE, 'utf8');

/* Escape only what a template literal cannot carry verbatim. */
const escaped = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const banner = `/* eslint-disable */
/**
 * GENERATED FILE — do not edit.
 *
 * Source: admin/src/styles/pdf-remediation.css
 * Regenerate with: npm run styles
 */
`;

fs.writeFileSync(
  TARGET,
  `${banner}\nexport const css = \`${escaped}\`;\n\nexport default css;\n`,
  'utf8'
);

process.stdout.write(
  `[skyneta11y-pdf-remediation] wrote ${path.relative(process.cwd(), TARGET)} (${css.length} bytes of CSS)\n`
);
