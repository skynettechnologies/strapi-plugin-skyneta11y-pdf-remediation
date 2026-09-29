/**
 * Configuration resolution.
 *
 * There is one source: `admin/src/pluginConfig.js`, the plugin's own
 * configuration file. Nothing is read from the host Strapi application, and
 * nothing is stored in the browser.
 *
 * It is read through this function on every call rather than captured at import
 * time, so a value is never stale relative to the file.
 */
import { pluginConfig } from '../pluginConfig';

export const DEFAULTS = pluginConfig;

/** The effective configuration. */
export function getConfig() {
  return { ...DEFAULTS };
}
