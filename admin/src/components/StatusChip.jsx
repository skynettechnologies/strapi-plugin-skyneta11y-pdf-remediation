import { Icon } from './Icons';

/**
 * Status pill for the Website Scan table.
 *
 * A `pending_scan` row is a button rather than a span: clicking it scans the
 * document there and then, which is how the original filled in a page count for
 * a PDF discovered by a crawl.
 */
const StatusChip = ({ document: doc, onScan }) => {
  switch (doc.status) {
    case 'scanning':
      return (
        <span className="status-chip scanning">
          <Icon name="spinner" size={13} /> Scanning
        </span>
      );

    case 'pending_scan':
      return (
        <button
          type="button"
          className="status-chip pending"
          style={{ border: 'none', cursor: 'pointer' }}
          title="Click to scan now"
          onClick={() => onScan(doc.id)}
        >
          <Icon name="warning" size={13} /> Pending scan
        </button>
      );

    case 'ready':
      /* Scanned and awaiting remediation — labelled "Pending" so it reads
         consistently with the other pending states. */
      return (
        <span className="status-chip ready">
          <Icon name="info" size={12} /> Pending
        </span>
      );

    case 'processing':
      return (
        <span className="status-chip processing">
          <Icon name="spinner" size={13} /> Remediating
        </span>
      );

    case 'remediated':
      return (
        <span className="status-chip remediated">
          <Icon name="check" size={12} /> Remediated
        </span>
      );

    default:
      return <span className="status-chip error">Error</span>;
  }
};

export { StatusChip };
