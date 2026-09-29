/** Transient status message, bottom-right. Dismisses itself after 4.2 s. */
const Toast = ({ toast }) => {
  if (!toast) {
    return null;
  }

  return (
    <div className={`toast${toast.kind ? ` ${toast.kind}` : ''}`} role="status">
      {toast.message}
    </div>
  );
};

export { Toast };
