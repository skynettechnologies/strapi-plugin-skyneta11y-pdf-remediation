import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchDocumentsPage } from '../utils/api';
import { useDebouncedValue } from './useDebouncedValue';
import { useRemediation } from './RemediationContext';

/**
 * One tab's paginated table: page, page size, debounced search and whatever
 * extra filters that tab adds (status, domain, source).
 *
 * The table only talks to the service while its tab is on screen, and re-fetches
 * whenever the shared refresh signal fires — an upload, a removal, a completed
 * remediation job.
 *
 * Any change to the search text, the page size or a filter returns to page 1, so
 * a narrowed result set cannot strand the view on an empty page.
 */
export function useDocumentsTable({ type, active, extraParams, enabled = true, errorMessage }) {
  const { loading, handleRequestError, refreshSignal, booting, connected } = useRemediation();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [docs, setDocs] = useState([]);
  const [total, setTotal] = useState(0);

  const debouncedSearch = useDebouncedValue(search);
  const extraKey = JSON.stringify(extraParams || {});

  /* Back to page 1 whenever the result set is redefined. */
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;

      return;
    }

    setPage(1);
  }, [debouncedSearch, perPage, extraKey]);

  const load = useCallback(() => {
    if (!enabled || !connected) {
      setDocs([]);
      setTotal(0);

      return Promise.resolve();
    }

    loading(true);

    return fetchDocumentsPage({
      type,
      page,
      perPage,
      search: debouncedSearch,
      ...(extraParams || {}),
    })
      .then((result) => {
        setDocs(result.documents || []);
        setTotal(result.total || 0);
      })
      .catch((error) => {
        setDocs([]);
        setTotal(0);
        handleRequestError(error, errorMessage || 'Could not load documents.');
      })
      .finally(() => loading(false));
    // `extraParams` is compared by value through extraKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    connected,
    type,
    page,
    perPage,
    debouncedSearch,
    extraKey,
    loading,
    handleRequestError,
    errorMessage,
  ]);

  /*
   * Nothing is fetched until the session exists.
   *
   * The panels mount before sign-in resolves, and a table request sent then
   * would go out unauthenticated: the service answers 401, the API layer spends
   * its one silent re-issue recovering from a session that was merely not ready
   * yet, and the whole boot costs an extra round trip. Waiting for `booting` is
   * what the standalone build got for free by only loading a tab from the end of
   * its boot sequence.
   */
  useEffect(() => {
    if (!active || booting) {
      return;
    }

    load();
  }, [active, booting, connected, load, refreshSignal]);

  return {
    page,
    setPage,
    perPage,
    setPerPage,
    search,
    setSearch,
    debouncedSearch,
    docs,
    total,
    reload: load,
  };
}

export default useDocumentsTable;
