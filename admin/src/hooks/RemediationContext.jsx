import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as api from '../utils/api';
import {
  accountDefaults,
  clearAccount,
  defaultDomain,
  resolveAccount,
  writeAccount,
} from '../utils/account';
import { getConfig } from '../utils/config';
import { errorMessage } from '../utils/format';

const RemediationContext = createContext(null);

const TABS = ['upload', 'scan', 'remediated'];

export const SUBTITLES = {
  upload: 'Add files for AI-powered accessibility remediation.',
  scan: 'Scan this website for PDFs and check their accessibility issues.',
  remediated: 'View, download, and manage completed remediated PDFs.',
};

/**
 * The tab to open on load.
 *
 * A pinned `initialTab` in the plugin's configuration wins; otherwise `?tab=` is
 * honoured, so a bookmark or a link from elsewhere in the admin panel can land
 * on a specific tab. Falls back to Upload.
 */
function initialTab() {
  const pinned = getConfig().initialTab;

  if (TABS.includes(pinned)) {
    return pinned;
  }

  try {
    const wanted = new URLSearchParams(window.location.search).get('tab');

    return TABS.includes(wanted) ? wanted : 'upload';
  } catch {
    return 'upload';
  }
}

/**
 * Everything the three tabs share: the signed-in remediation account, the full
 * document list that drives selection eligibility, the current remediation job,
 * and the toast / loader / modal plumbing.
 *
 * This is the React equivalent of the module-level `state` object in the
 * standalone build's `app.js`.
 */
export const RemediationProvider = ({ children }) => {
  const [tab, setTabState] = useState(initialTab);
  const [user, setUser] = useState(null);
  const [plans, setPlans] = useState([]);

  /** Full unpaginated document list — drives remediation eligibility. */
  const [documents, setDocuments] = useState([]);
  /** Ids ticked in the tables, across pages and across tabs. */
  const [selected, setSelected] = useState(() => new Set());

  const [job, setJob] = useState(null);
  const [booting, setBooting] = useState(true);
  const [signedIn, setSignedIn] = useState(true);

  /** The remediation account, or null until an administrator connects one. */
  const [account, setAccount] = useState(resolveAccount);

  /** The account dialog: `{ prompt, action }` while open, null otherwise. */
  const [accountPrompt, setAccountPrompt] = useState(null);

  /**
   * What has been typed into that dialog.
   *
   * Held here rather than in the dialog itself, which unmounts when it closes:
   * cancelling would otherwise throw away a half-filled form, and the next
   * upload would ask for the same details from scratch.
   */
  const [accountDraft, setAccountDraft] = useState(accountDefaults);

  const updateAccountDraft = useCallback((patch) => {
    setAccountDraft((current) => ({ ...current, ...patch }));
  }, []);

  /** Reference-counted so overlapping fetches do not hide each other's loader. */
  const [loaders, setLoaders] = useState(0);
  const [toastState, setToastState] = useState(null);

  /** Bumped whenever the visible table must re-fetch. */
  const [refreshSignal, setRefreshSignal] = useState(0);

  const [confirmState, setConfirmState] = useState(null);
  const [partialState, setPartialState] = useState(null);

  const toastTimer = useRef(null);
  const jobTimer = useRef(null);

  /*
   * The account, readable from callbacks that outlive the render they were
   * created in.
   *
   * The upload handler captures `reloadDocuments` when the button is pressed,
   * which is *before* the account dialog is answered. Reading `account` from
   * the closure there gives null, so the reload that follows a first upload
   * would clear the document list instead of loading it — leaving rows in the
   * table but nothing in the queue the bulk footer counts, so ticking a row
   * enabled nothing.
   */
  const accountRef = useRef(account);

  accountRef.current = account;

  /* ---------------------------------------------------------------- *
   * Toast + loader
   * ---------------------------------------------------------------- */
  const toast = useCallback((message, kind) => {
    setToastState({ message, kind: kind || '' });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastState(null), 4200);
  }, []);

  const loading = useCallback((on) => {
    setLoaders((count) => Math.max(0, count + (on ? 1 : -1)));
  }, []);

  /**
   * Surfaces a failed sign-in rather than an opaque failure. A 401 only reaches
   * here after the API layer has already tried to re-issue the session once.
   */
  const handleRequestError = useCallback(
    (error, fallback) => {
      if (error && error.status === 401) {
        toast('Could not authenticate with the remediation service.', 'error');

        return;
      }

      toast(errorMessage(error) || fallback, 'error');
    },
    [toast]
  );

  /* ---------------------------------------------------------------- *
   * Eligibility
   *
   * Selection spans the WHOLE queue, not just the visible page, so these read
   * from the full `documents` list rather than a table's page.
   * ---------------------------------------------------------------- */

  /**
   * The domain the Website Scan tab crawls, once there is an account.
   *
   * Empty until then, which is why the tab labels its button from
   * `scanDomain` below instead: the button is on screen before anybody has
   * connected, and clicking it is one of the things that asks them to.
   *
   * The fallback to the account's first registered domain covers a mismatch —
   * a pinned `website`, a renamed host, an account set up elsewhere. Crawling a
   * domain the account does not own would only be refused.
   */
  const activeDomain = useMemo(() => {
    const domains = (user && user.domains) || [];
    const wanted = api.activeDomainFrom(getConfig());

    if (wanted && domains.includes(wanted)) {
      return wanted;
    }

    return domains[0] || '';
  }, [user]);

  /** What the Website Scan tab shows it will crawl, connected or not. */
  const scanDomain = activeDomain || defaultDomain();

  const readyDocs = useMemo(() => {
    if (tab === 'scan') {
      return documents.filter(
        (doc) => doc.source === 'web' && doc.domain === activeDomain && doc.status === 'ready'
      );
    }

    return documents.filter((doc) => doc.source !== 'web' && doc.status === 'ready');
  }, [documents, tab, activeDomain]);

  const selectedReady = useMemo(
    () => readyDocs.filter((doc) => selected.has(doc.id)),
    [readyDocs, selected]
  );

  const selectedPages = useMemo(
    () => selectedReady.reduce((sum, doc) => sum + (doc.pages || 0), 0),
    [selectedReady]
  );

  const busy = Boolean(job && job.status === 'processing');

  /* ---------------------------------------------------------------- *
   * Selection
   * ---------------------------------------------------------------- */
  const toggleSelect = useCallback((id, checked) => {
    setSelected((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  }, []);

  const selectMany = useCallback((ids, checked) => {
    setSelected((current) => {
      const next = new Set(current);

      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));

      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  /* ---------------------------------------------------------------- *
   * Data
   * ---------------------------------------------------------------- */

  /**
   * Keeps the full list in sync so eligibility survives a page change.
   *
   * A no-op until there is an account: with no session every request would only
   * 401, and the panel is on screen from the start now.
   */
  const reloadDocuments = useCallback(() => {
    if (!accountRef.current) {
      setDocuments([]);

      return Promise.resolve();
    }

    return api
      .fetchDocuments()
      .then(setDocuments)
      .catch(() => {
        /* the paginated tables still render — this list only gates selection */
      });
  }, []);

  /** Asks the visible table to re-fetch. */
  const requestRefresh = useCallback(() => setRefreshSignal((value) => value + 1), []);

  const setTab = useCallback(
    (next) => {
      setTabState(next);
      clearSelection();

      // Each React page in the original re-fetched the full list on mount; the
      // panels here are persistent, so the tab switch is what keeps eligibility
      // current.
      reloadDocuments();
    },
    [clearSelection, reloadDocuments]
  );

  /* ---------------------------------------------------------------- *
   * The account
   * ---------------------------------------------------------------- */

  /**
   * Runs `action` when there is an account, and otherwise asks for one first and
   * runs it afterwards.
   *
   * This is what replaced gating the whole panel behind a sign-in screen: the
   * workspace is always visible, and the details are requested at the moment
   * they are actually needed — the first upload, or the first crawl. `prompt`
   * says which, so the dialog explains why it appeared.
   */
  const requireAccount = useCallback(
    (action, prompt) => {
      if (account) {
        return action(account);
      }

      setAccountPrompt({ prompt, action });

      return undefined;
    },
    [account]
  );

  const closeAccountPrompt = useCallback(() => setAccountPrompt(null), []);

  /**
   * Registers the submitted details with the service and, once accepted, makes
   * them this panel's account.
   *
   * The details are stored *before* the call, not after: the session token is
   * filed under a key derived from the account, so it has to be resolvable by
   * the time `provisionSession` stores one. A failure clears them again, so a
   * rejected attempt leaves nothing behind.
   */
  const connect = useCallback(
    async (values) => {
      const saved = writeAccount(values);

      if (!saved) {
        throw new Error('Enter a name, an email address and a domain.');
      }

      try {
        await api.provisionSession(saved);
      } catch (error) {
        clearAccount();
        api.setToken(null);
        throw error;
      }

      setSignedIn(true);
      setAccount(saved);

      /* Carry on with whatever they were doing when the dialog appeared. */
      const pending = accountPrompt && accountPrompt.action;

      setAccountPrompt(null);

      if (pending) {
        pending(saved);
      }

      return saved;
    },
    [accountPrompt]
  );

  /* The panel offers no way to switch accounts: the account belongs to the
     site, not to whoever is looking at the panel. Clearing the browser's
     `aiopdf_account` key resets it, and the next action asks again. */

  /* ---------------------------------------------------------------- *
   * Remediation + job polling (port of useJobPolling)
   * ---------------------------------------------------------------- */
  /**
   * Opens the plan-coverage modal for whichever way the service refused.
   *
   * `PARTIAL_REQUIRED` — the plan covers some of the selection, so the modal
   * offers both upgrading and continuing with the covered pages.
   * `PAGE_LIMIT` — the plan is exhausted (`pagesRemaining: 0`), so there is
   * nothing to continue with and only the upgrade path is offered.
   *
   * Both carry `totalPages` and `pagesRemaining`, and their `error` string is
   * the sentence to show, so the service stays in charge of the wording.
   */
  const openCoverageModal = useCallback((error) => {
    const data = (error && error.data) || {};

    setPartialState({
      code: error && error.code,
      covered: data.pagesRemaining || 0,
      total: data.totalPages || 0,
      message: (error && error.message) || '',
    });
  }, []);

  const closePartial = useCallback(() => setPartialState(null), []);

  const startRemediation = useCallback(
    (allowPartial) => {
      const docs = selectedReady;

      if (!docs.length) {
        toast('Select at least one scanned document that is ready to remediate.', 'error');

        return;
      }

      loading(true);
      api
        .startRemediation(
          docs.map((doc) => doc.id),
          allowPartial
        )
        .then((res) => {
          clearSelection();
          setUser((current) => res.user || current);
          setJob(res.job);
          api.setActiveJobId(res.job && res.job.status === 'processing' ? res.job.id : null);
          requestRefresh();
        })
        .catch((error) => {
          if (error && (error.code === 'PAGE_LIMIT' || error.code === 'PARTIAL_REQUIRED')) {
            openCoverageModal(error);
          } else {
            handleRequestError(error, 'Could not start remediation.');
          }
        })
        .finally(() => loading(false));
    },
    [
      selectedReady,
      toast,
      loading,
      clearSelection,
      requestRefresh,
      openCoverageModal,
      handleRequestError,
    ]
  );

  /**
   * Polls the active job once a second. Only the progress bar repaints on each
   * tick — the rows do not change until the job completes.
   */
  useEffect(() => {
    window.clearInterval(jobTimer.current);

    if (!job || job.status !== 'processing') {
      return undefined;
    }

    const jobId = job.id;

    jobTimer.current = window.setInterval(() => {
      api
        .pollJob(jobId)
        .then((data) => {
          setJob(data.job);
          setUser((current) => data.user || current);

          if (data.job && data.job.status === 'completed') {
            window.clearInterval(jobTimer.current);
            api.setActiveJobId(null);
            toast('Remediation complete! Files are ready in the Remediated tab.', 'success');

            /* The run has just spent pages, so the plan meter is now wrong.
               The poll may carry a fresh `user`, but it is not guaranteed to —
               one read settles it either way. */
            api
              .fetchMe()
              .then((me) => setUser((current) => me || current))
              .catch(() => {
                /* the count stays as it was until the next load */
              });

            reloadDocuments();
            setTab('remediated');
            window.setTimeout(() => {
              setJob(null);
              requestRefresh();
            }, 1200);
          }
        })
        .catch(() => {
          window.clearInterval(jobTimer.current);
          api.setActiveJobId(null);
          setJob(null);
          requestRefresh();
        });
    }, 1000);

    return () => window.clearInterval(jobTimer.current);
  }, [job, toast, reloadDocuments, setTab, requestRefresh]);

  /* ---------------------------------------------------------------- *
   * Confirmation modal
   * ---------------------------------------------------------------- */
  const openConfirm = useCallback((options) => setConfirmState(options), []);
  const closeConfirm = useCallback(() => setConfirmState(null), []);

  const removeDocuments = useCallback(
    (ids) => {
      loading(true);
      Promise.all(
        ids.map((id) =>
          api.removeDocument(id).catch((error) => {
            handleRequestError(error, 'Failed to remove document');

            return null;
          })
        )
      ).finally(() => {
        selectMany(ids, false);
        loading(false);
        reloadDocuments();
        requestRefresh();
      });
    },
    [loading, handleRequestError, selectMany, reloadDocuments, requestRefresh]
  );

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */
  /* Plans are public and only feed the upgrade recommendation, so they load
     once regardless of whether an account is connected. */
  useEffect(() => {
    let cancelled = false;

    api.adoptTokenFromQuery();
    api
      .fetchPlans()
      .then((list) => {
        if (!cancelled) {
          setPlans(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlans([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Picks a running job back up after a reload.
   *
   * The job only ever lived in React state, so refreshing the admin panel lost
   * the progress bar even though the service was still working — the rows just
   * sat on "Processing" with nothing counting down. The id is remembered
   * alongside the session token; one poll says whether it is still going.
   */
  const resumeJob = useCallback(() => {
    const id = api.activeJobId();

    if (!id) {
      return Promise.resolve();
    }

    return api
      .pollJob(id)
      .then((data) => {
        if (data.job && data.job.status === 'processing') {
          setJob(data.job);
          setUser((current) => data.user || current);

          return;
        }

        /* Finished, or gone, while the panel was closed. */
        api.setActiveJobId(null);
      })
      .catch(() => api.setActiveJobId(null));
  }, []);

  /*
   * Sign in — and re-run when an account is connected or swapped.
   *
   * With no account there is nothing to sign in as and no form has been
   * submitted yet, so nothing is sent: boot simply finishes and the panel shows
   * the connect form. This is what replaced provisioning silently against a
   * made-up `no-reply@` address.
   */
  useEffect(() => {
    if (!account) {
      setBooting(false);

      return undefined;
    }

    let cancelled = false;

    loading(true);
    api
      .ensureSession()
      .then((ok) => {
        if (!cancelled && !ok) {
          setSignedIn(false);
          toast('Could not sign in to the remediation service.', 'error');
        }

        return api.fetchMe();
      })
      .then((me) => {
        if (!cancelled) {
          setUser(me);
        }

        return resumeJob();
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        loading(false);

        if (cancelled) {
          return;
        }

        setBooting(false);
        reloadDocuments();
        requestRefresh();
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current);
      window.clearInterval(jobTimer.current);
    },
    []
  );

  const value = useMemo(
    () => ({
      tab,
      setTab,
      user,
      plans,
      documents,
      selected,
      selectedReady,
      selectedPages,
      readyDocs,
      activeDomain,
      job,
      busy,
      booting,
      signedIn,
      account,
      accountPrompt,
      accountDraft,
      connected: Boolean(account),
      scanDomain,
      connect,
      requireAccount,
      closeAccountPrompt,
      updateAccountDraft,
      isLoading: loaders > 0,
      toastState,
      refreshSignal,
      confirmState,
      partialState,

      toast,
      loading,
      handleRequestError,
      toggleSelect,
      selectMany,
      clearSelection,
      reloadDocuments,
      requestRefresh,
      startRemediation,
      removeDocuments,
      openConfirm,
      closeConfirm,
      closePartial,
    }),
    [
      tab,
      setTab,
      user,
      plans,
      documents,
      selected,
      selectedReady,
      selectedPages,
      readyDocs,
      activeDomain,
      job,
      busy,
      booting,
      signedIn,
      account,
      accountPrompt,
      accountDraft,
      connect,
      requireAccount,
      closeAccountPrompt,
      updateAccountDraft,
      scanDomain,
      loaders,
      toastState,
      refreshSignal,
      confirmState,
      partialState,
      toast,
      loading,
      handleRequestError,
      toggleSelect,
      selectMany,
      clearSelection,
      reloadDocuments,
      requestRefresh,
      startRemediation,
      removeDocuments,
      openConfirm,
      closeConfirm,
      closePartial,
    ]
  );

  return <RemediationContext.Provider value={value}>{children}</RemediationContext.Provider>;
};

export function useRemediation() {
  const context = useContext(RemediationContext);

  if (!context) {
    throw new Error('useRemediation must be used inside <RemediationProvider>');
  }

  return context;
}

export { TABS };
