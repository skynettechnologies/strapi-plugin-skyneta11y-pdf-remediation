import { useEffect, useState } from 'react';

/**
 * Debounces a value so a search box does not fire a request per keystroke.
 * 350 ms, matching the standalone build.
 */
export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);

    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedValue;
