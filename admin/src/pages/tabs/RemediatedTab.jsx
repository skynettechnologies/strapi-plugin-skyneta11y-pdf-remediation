import { useState } from 'react';

import { Icon } from '../../components/Icons';
import { Pagination } from '../../components/Pagination';
import { useDocumentsTable } from '../../hooks/useDocumentsTable';
import { useRemediation } from '../../hooks/RemediationContext';
import { downloadRemediated } from '../../utils/api';
import { formatDate } from '../../utils/format';

const SOURCE_LABELS = {
  web: 'Website Scan',
  url: 'Scan PDF URL',
  file: 'Upload PDF',
};

/**
 * Remediated tab — a port of `DashRemediatedPage`.
 *
 * The finished files, filterable by where they came from, each with an
 * authenticated download.
 */
const RemediatedTab = ({ active }) => {
  const { toast } = useRemediation();

  const [source, setSource] = useState('all');
  const [downloading, setDownloading] = useState(null);

  const table = useDocumentsTable({
    type: 'remediated',
    active,
    extraParams: { source },
    errorMessage: 'Could not load remediated PDFs.',
  });

  const download = (doc, name) => {
    setDownloading(doc.id);

    downloadRemediated(doc.id, name).then((ok) => {
      setDownloading(null);

      if (!ok) {
        toast('Could not download this file.', 'error');
      }
    });
  };

  return (
    <section className="aiopdf-tab-panel" hidden={!active}>
      <div className="panel">
        <div className="filters-row">
          <h3 style={{ fontSize: '24px' }}>Remediated PDFs</h3>
          <div className="grow" />
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              className="input"
              type="search"
              placeholder="Search remediated PDFs"
              aria-label="Search remediated PDFs"
              value={table.search}
              onChange={(event) => table.setSearch(event.target.value)}
            />
          </div>
          <div className="filter-group">
            <select
              className="select select-arrow"
              aria-label="Filter by source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              <option value="all">All sources</option>
              <option value="file">Upload PDF</option>
              <option value="url">Scan PDF URL</option>
              <option value="web">Website Scan</option>
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="aiopdf-rem-per-page">Items per page</label>
            <select
              id="aiopdf-rem-per-page"
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

        {table.docs.length ? (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th className="text-center">Added From</th>
                  <th className="text-center">Remediated On</th>
                  <th className="text-center" style={{ width: '100px' }}>
                    Pages
                  </th>
                  <th style={{ width: '310px', textAlign: 'right' }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {table.docs.map((doc) => {
                  const name = doc.remediatedName || doc.name;

                  return (
                    <tr key={doc.id}>
                      <td>
                        <div className="doc-cell">
                          <span className="mini-icon purple">PDF</span>
                          {name}
                        </div>
                      </td>
                      <td className="text-center">
                        <span className={`src-chip ${doc.source}`}>
                          {SOURCE_LABELS[doc.source] || 'Upload PDF'}
                        </span>
                      </td>
                      <td className="text-center">{formatDate(doc.remediatedAt)}</td>
                      <td className="text-center">
                        {doc.remediatedPages != null ? doc.remediatedPages : doc.pages}
                      </td>
                      <td className="actions-column" style={{ textAlign: 'right' }}>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={downloading === doc.id}
                            onClick={() => download(doc, name)}
                          >
                            <Icon name="download" size={16} /> Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          <div className="empty-state">
            {table.debouncedSearch || source !== 'all'
              ? 'No remediated PDFs match your search/filter.'
              : 'No remediated PDFs yet — run AI remediation from the Upload or Website Scan tab.'}
          </div>
        )}
      </div>
    </section>
  );
};

export { RemediatedTab };
