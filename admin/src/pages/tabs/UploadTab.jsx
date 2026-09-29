import { useRef, useState } from 'react';

import { Icon } from '../../components/Icons';
import { Pagination } from '../../components/Pagination';
import { useDocumentsTable } from '../../hooks/useDocumentsTable';
import { useRemediation } from '../../hooks/RemediationContext';
import { uploadPdf } from '../../utils/api';
import { plural } from '../../utils/format';

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Upload tab — a port of `DashUploadPage`.
 *
 * Drag-and-drop or browse upload, and the documents queue with search, page
 * size, pagination, per-row and bulk removal, bulk remediation and the live
 * progress bar.
 */
const UploadTab = ({ active }) => {
  const {
    selected,
    selectedReady,
    selectedPages,
    toggleSelect,
    selectMany,
    busy,
    job,
    toast,
    loading,
    handleRequestError,
    reloadDocuments,
    requestRefresh,
    startRemediation,
    removeDocuments,
    openConfirm,
    requireAccount,
  } = useRemediation();

  const table = useDocumentsTable({
    type: 'upload',
    active,
    errorMessage: 'Could not load documents.',
  });

  const fileInput = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const hasSelection = selectedReady.length > 0;
  const eligibleOnPage = table.docs.filter((doc) => doc.status === 'ready');
  const allOnPageSelected =
    eligibleOnPage.length > 0 && eligibleOnPage.every((doc) => selected.has(doc.id));

  /** Uploads the files that passed the format and size checks. */
  const sendFiles = (accepted) => {
    setUploading(true);
    loading(true);

    Promise.all(
      accepted.map((file) =>
        uploadPdf(file).catch((error) => {
          handleRequestError(error, 'Upload failed');

          return null;
        })
      )
    )
      .then((docs) => {
        const ok = docs.filter(Boolean).length;

        if (ok) {
          toast(`${plural(ok, 'file')} uploaded.`, 'success');
        }
      })
      .finally(() => {
        setUploading(false);
        loading(false);
        reloadDocuments();
        requestRefresh();
      });
  };

  const handleFiles = (files) => {
    if (!files || !files.length) {
      return;
    }

    const accepted = [];

    Array.prototype.forEach.call(files, (file) => {
      if (!/\.pdf$/i.test(file.name)) {
        toast('PDF format only — please choose a .pdf file.', 'error');

        return;
      }

      if (file.size > MAX_BYTES) {
        toast('File is too large. Up to 50 MB is allowed.', 'error');

        return;
      }

      accepted.push(file);
    });

    if (!accepted.length) {
      return;
    }

    /* The first upload is where the account is asked for. The files are held in
       the closure, so they are sent as soon as the details are saved — nobody
       has to pick them again. */
    requireAccount(
      () => sendFiles(accepted),
      `Before ${plural(accepted.length, 'file')} can be remediated, we need to know who this is for.`
    );
  };

  const openPicker = () => fileInput.current && fileInput.current.click();

  const confirmRemoveOne = (doc) =>
    openConfirm({
      title: 'Remove Document',
      message: 'Are you sure you want to remove',
      itemName: `${doc ? doc.name : 'this document'}?`,
      onConfirm: () => removeDocuments([doc.id]),
    });

  const confirmRemoveSelected = () => {
    const ids = selectedReady.map((doc) => doc.id);

    if (!ids.length) {
      return;
    }

    openConfirm({
      title: 'Remove Document',
      message: 'Are you sure you want to remove the selected document?',
      onConfirm: () => removeDocuments(ids),
    });
  };

  return (
    <section className="aiopdf-tab-panel" hidden={!active}>
      {/* ---------- Drop zone ---------- */}
      <div className="panel">
        <div className="upload-split upload-split-single">
          <div
            className={`dropzone${dragging ? ' drag' : ''}`}
            style={{ padding: '44px 16px' }}
            tabIndex={0}
            role="button"
            aria-label="Drag and drop a PDF file here, or click to browse"
            onClick={openPicker}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openPicker();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            <div className="dz-icon">
              <Icon name="doc" size={26} />
            </div>
            <span>{uploading ? 'Uploading…' : 'Drag and Drop file here'}</span>
          </div>
        </div>

        <div className="dz-note" style={{ marginTop: 0 }}>
          <span>PDF format only</span>
          <span className="dot">&bull;</span>
          <span>Up to 50 MB</span>
          <span className="dot">&bull;</span>
          <span style={{ color: 'var(--accent)' }}>Unencrypted files</span>
        </div>
        <div className="dz-subnote">Password-protected PDFs are not supported.</div>
      </div>

      {/* ---------- Documents table ---------- */}
      <div className="panel table-panel">
        <div className="filters-row">
          <h3>Documents</h3>
          <div className="grow" />
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              className="input"
              type="search"
              placeholder="Search documents"
              aria-label="Search documents"
              value={table.search}
              onChange={(event) => table.setSearch(event.target.value)}
            />
          </div>
          <div className="filter-group">
            <label htmlFor="aiopdf-upload-per-page">Items per page</label>
            <select
              id="aiopdf-upload-per-page"
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
                  <th>File Name</th>
                  <th style={{ textAlign: 'center' }}>Source</th>
                  <th style={{ textAlign: 'center' }}>Pages</th>
                  <th style={{ width: '280px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {table.docs.map((doc) => {
                  const scanning = doc.status === 'pending_scan' || doc.status === 'scanning';

                  return (
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
                          <span className={`mini-icon${doc.source === 'url' ? ' link' : ''}`}>
                            {doc.source === 'url' ? <Icon name="link" size={16} /> : 'PDF'}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            {doc.name}
                            {doc.sourceUrl ? (
                              <span className="doc-sub">{doc.sourceUrl}</span>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <span className={`src-chip ${doc.source}`}>
                          {doc.source === 'url' ? 'URL' : 'File'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        {scanning ? (
                          <span className="status-chip scanning">Scanning…</span>
                        ) : doc.status === 'processing' ? (
                          <span className="status-chip processing">Processing</span>
                        ) : (
                          String(doc.pages == null ? '—' : doc.pages)
                        )}
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <div className="row-actions">
                          {doc.status === 'processing' ? null : (
                            <button
                              type="button"
                              className="link-danger"
                              disabled={hasSelection || busy}
                              onClick={() => confirmRemoveOne(doc)}
                            >
                              <Icon name="x" size={14} /> Remove
                            </button>
                          )}
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
            {table.debouncedSearch
              ? 'No documents match your search.'
              : 'No documents in the queue — add a PDF above to get started.'}
          </div>
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
              className="btn btn-delete"
              disabled={selectedReady.length === 0 || busy}
              onClick={confirmRemoveSelected}
            >
              <Icon name="trash" size={20} /> Remove Selected
            </button>
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

      {/* Hidden file input driving the drop zone. */}
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </section>
  );
};

export { UploadTab };
