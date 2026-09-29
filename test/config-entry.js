/* Test entry: re-exports the configuration surface for direct assertions. */
export { pluginConfig } from '../admin/src/pluginConfig';
export {
  getConfig,
  readOverrides,
  writeOverrides,
  clearOverrides,
} from '../admin/src/utils/config';
export {
  website,
  accountEmail,
  activeDomain,
  upgradeUrl,
  apiUrl,
  storageKey,
  currentHost,
} from '../admin/src/utils/api';
