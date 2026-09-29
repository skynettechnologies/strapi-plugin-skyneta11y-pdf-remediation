import { LoaderSpinner } from './Icons';

/** The full-screen table loader shown while any request is in flight. */
const FullscreenLoader = ({ visible }) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="aioa_dashboard-fullscreen-loader" role="alert" aria-live="polite">
      <div className="aioa_dashboard-loader">
        <LoaderSpinner />
        <span className="visually-hidden">Loading…</span>
      </div>
    </div>
  );
};

export { FullscreenLoader };
