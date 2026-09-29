import { useState } from 'react';

import { Icon } from '../../components/Icons';
import { Pagination } from '../../components/Pagination';
import { StatusChip } from '../../components/StatusChip';
import { useDocumentsTable } from '../../hooks/useDocumentsTable';
import { useRemediation } from '../../hooks/RemediationContext';
import { crawlDomain, scanPdfUrl } from '../../utils/api';
import { plural } from '../../utils/format';

/**
 * Website Scan tab — a port of `DashScanPage`.
 *
 * Crawls the account's domain for linked PDFs and lists what has been found,
 * with a status filter and bulk remediation.
 */
const ScanTab = ({ active }) => {
  const {
    selected,
    selectedReady,
    selectedPages,
    toggleSelect,
    selectMany,
    activeDomain,
    busy,
    job,
    toast,
    loading,
    handleRequestError,
    reloadDocuments,
    requestRefresh,
    startRemediation,
    requireAccount,
    scanDomain,
  } = useRemediation();

  const [status, setStatus] = useState('all');
  const [crawling, setCrawling] = useState(false);

  const table = useDocumentsTable({
    type: 'scan',
    active,
    enabled: Boolean(activeDomain),
    extraParams: { status, domain: activeDomain },
    errorMessage: 'Could not load scanned documents.',
  });

  const eligibleOnPage = table.docs.filter((doc) => doc.status === 'ready');
  const allOnPageSelected =
    eligibleOnPage.length > 0 && eligibleOnPage.every((doc) => selected.has(doc.id));

  const scanRow = (id) => {
    loading(true);
    scanPdfUrl(id)
      .catch((error) => handleRequestError(error, 'Scan failed'))
      .finally(() => {
        loading(false);
        reloadDocuments();
        requestRefresh();
      });
  };

  /** Sweeps `domain` for linked PDFs. */
  const runCrawl = (domain) => {
    if (!domain || crawling) {
      return;
    }

    setCrawling(true);

    crawlDomain(domain)
      .then((res) => {
        const coverage =
          `${plural(res.pagesCrawled, 'page')} crawled` +
          (res.sitemapUrlsFound > 0 ? `, ${res.sitemapUrlsFound} from sitemap` : '');

        // Large sites are swept across several runs — each picks up where the
        // last left off, so say so rather than implying full coverage.
        const truncated = res.truncated
          ? res.sitemapUrlsFound > 0
            ? ` — this is a large site (${res.sitemapUrlsFound} pages in its sitemap), so not every page could be checked in one pass; run it again to sweep the next part of the site.`
            : ' — this is a large site, so not every page could be checked in one pass; run it again to keep discovering more.'
          : '';

        if (res.found === 0) {
          toast(`No PDF links found on ${domain} (${coverage}).${truncated}`);
        } else if (res.added === 0) {
          toast(
            `Found ${plural(res.found, 'PDF')} on ${domain} — all already in your list (${coverage}).${truncated}`
          );
        } else {
          toast(
            `Found ${plural(res.found, 'PDF')} on ${domain} — added ${res.added} new (${coverage}). Scanning…${truncated}`,
            'success'
          );

          // Kick off the scan for each newly discovered document.
          Promise.all(
            (res.documents || []).map((doc) => scanPdfUrl(doc.id).catch(() => null))
          ).then(() => {
            reloadDocuments();
            requestRefresh();
          });
        }
      })
      .catch((error) => handleRequestError(error, 'Could not crawl the website.'))
      .finally(() => {
        setCrawling(false);
        reloadDocuments();
        requestRefresh();
      });
  };

  /* Crawls the account's domain once there is one; before that, whatever the
     administrator confirms in the account dialog. */
  const startCrawl = () =>
    requireAccount(
      (acct) => runCrawl(activeDomain || acct.domain),
      `Before ${scanDomain} can be scanned for PDFs, we need to know who this is for.`
    );

  const emptyMessage =
    table.debouncedSearch || status !== 'all'
      ? 'No documents match your search/filter.'
      : `No scanned documents yet — click "Find PDFs on ${scanDomain}" above.`;

  return (
    <section className="aiopdf-tab-panel" hidden={!active}>
      <div className="panel">
        <div className="filters-row">
          {scanDomain ? (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={crawling || busy}
              onClick={startCrawl}
            >
              {crawling ? (
                <>
                  <Icon name="spinner" size={15} /> {`Crawling ${scanDomain}…`}
                </>
              ) : (
                `Find PDFs on ${scanDomain}`
              )}
            </button>
          ) : null}
          <div className="grow" />
          <div className="filters-actions">
            <div className="search-box">
              <Icon name="search" size={16} />
              <input
                className="input"
                type="search"
                placeholder="Search documents"
                aria-label="Search scanned documents"
                value={table.search}
                onChange={(event) => table.setSearch(event.target.value)}
              />
            </div>
            <div className="filter-group">
              <label htmlFor="aiopdf-scan-status">Status</label>
              <select
                id="aiopdf-scan-status"
                className="select select-arrow"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">All status</option>
                <option value="scanning">Scanning</option>
                <option value="pending">Pending scan</option>
                <option value="ready">Pending</option>
                <option value="remediated">Remediated</option>
              </select>
            </div>
            <div className="filter-group">
              <label htmlFor="aiopdf-scan-per-page">Items per page</label>
              <select
                id="aiopdf-scan-per-page"
                className="select select-arrow"
                value={table.perPage}
                onChange={(event) => table.setPerPage(Number(event.target.value))}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>
        </div>

        {busy ? (
          <div className="inline-progress">
            <div className="processing-label" style={{ fontSize: '15.5px' }}>
              AI remediation in progress…
            </div>
            <div className="progress-track" style={{ height: '9px' }}>
              <div
                className="progress-fill"
                style={{ width: `${Math.max((job && job.progress) || 0, 4)}%` }}
              />
            </div>
          </div>
        ) : null}

        {table.docs.length ? (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '44px' }}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      aria-label="Select all documents"
                      checked={allOnPageSelected}
                      onChange={(event) =>
                        selectMany(
                          eligibleOnPage.map((doc) => doc.id),
                          event.target.checked
                        )
                      }
                    />
                  </th>
                  <th>File Name / Source</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Pages</th>
                  <th style={{ width: '160px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {table.docs.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox"
                        aria-label={`Select ${doc.name}`}
                        checked={selected.has(doc.id)}
                        disabled={doc.status !== 'ready'}
                        onChange={(event) => toggleSelect(doc.id, event.target.checked)}
                      />
                    </td>

                    <td>
                      <div className="doc-cell">
                        <span className="mini-icon">PDF</span>
                        <div style={{ minWidth: 0 }}>
                          {doc.name}
                          <span className="doc-sub">
                            {'Source: '}
                            {doc.sourceUrl ? (
                              <a href={doc.sourceUrl} target="_blank" rel="noreferrer">
                                {doc.sourceUrl}
                              </a>
                            ) : (
                              'Uploaded file'
                            )}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td style={{ textAlign: 'center' }}>{doc.pages || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <StatusChip document={doc} onScan={scanRow} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="aiopdf_dashboard-table-pagination-main">
              <Pagination
                page={table.page}
                perPage={table.perPage}
                total={table.total}
                onChange={(page) => {
                  table.setPage(page);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          </div>
        ) : (
          <div className="empty-state">{emptyMessage}</div>
        )}

        <div className="bulk-footer">
          <span className="bulk-icon">
            <Icon name="doc" size={20} />
          </span>
          <div className="bulk-meta">
            <span>
              Selected: <b>{selectedReady.length}</b> documents
            </span>
            <span className="bulk-sep" />
            <span>
              Total: <b>{selectedPages}</b> pages
            </span>
          </div>
          <div className="bulk-actions">
            <button
              type="button"
              className="btn btn-gradient"
              disabled={selectedReady.length === 0 || busy}
              onClick={() => startRemediation(false)}
            >
              <Icon name="sparkles" size={20} /> Add Selected for Remediation
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export { ScanTab };
