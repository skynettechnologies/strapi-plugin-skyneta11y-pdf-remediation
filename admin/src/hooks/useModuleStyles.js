import { useEffect } from 'react';
import { useTheme } from 'styled-components';

import { css } from '../styles/css';

const STYLE_ID = 'aiopdf-remediation-styles';
const FONT_ID = 'aiopdf-remediation-fonts';
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300..900;1,300..900&display=swap';

/**
 * Injects the module's stylesheet into the admin document, once per page load.
 *
 * Every rule is scoped under `.aiopdf-app`, so nothing here reaches the rest of
 * the Strapi admin panel. The <style> element is left in place when the plugin
 * unmounts — re-parsing 60 KB of CSS on every navigation back to the plugin
 * costs more than the element does.
 */
function injectStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');

  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * Loads Rubik, the module's typeface.
 *
 * A failure here is invisible and harmless: the stylesheet's font stack falls
 * back to Segoe UI and the system sans, so an offline install or a strict
 * content-security-policy simply renders in those instead.
 */
function injectFonts() {
  if (typeof document === 'undefined' || document.getElementById(FONT_ID)) {
    return;
  }

  const link = document.createElement('link');

  link.id = FONT_ID;
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

/**
 * Whether the admin panel is currently on a dark theme.
 *
 * Read from the theme Strapi puts on the styled-components provider rather than
 * from storage, so it follows the theme switcher immediately — including the
 * "system" setting, which Strapi resolves before handing the theme down.
 */
function useIsDarkTheme() {
  const theme = useTheme();
  const neutral0 = theme && theme.colors && theme.colors.neutral0;

  if (typeof neutral0 !== 'string') {
    return false;
  }

  const hex = neutral0.trim().replace('#', '');

  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return false;
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  /* Rec. 601 luma — the page ground is dark when it is below the midpoint. */
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/**
 * Sets the module up for rendering and reports which palette to use.
 * Returns 'dark' or 'light' for the wrapper's `data-theme` attribute.
 */
export function useModuleStyles() {
  const isDark = useIsDarkTheme();

  useEffect(() => {
    injectStyles();
    injectFonts();
  }, []);

  return isDark ? 'dark' : 'light';
}

export default useModuleStyles;
