/* Minimal `process` for code that reads env vars in a browser bundle. */
export const process = {
  env: {},
  platform: 'browser',
  browser: true,
  nextTick: (fn) => setTimeout(fn, 0),
};
