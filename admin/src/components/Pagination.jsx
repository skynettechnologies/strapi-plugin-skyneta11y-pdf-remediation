/*
 * Table pagination — a port of the module's `components/Pagination.tsx`.
 *
 * A three-page window centred as closely as possible on the current page, with
 * first / previous / next / last controls either side and a record count above.
 */
const Pagination = ({ page, perPage, total, onChange }) => {
  const totalPages = Math.ceil(total / perPage) || 0;
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  const startPage = Math.max(1, page - 1);
  const endPage = Math.min(totalPages, startPage + 2);
  const pages = [];

  for (let index = startPage; index <= endPage; index += 1) {
    pages.push(index);
  }

  const isFirst = page === 1;
  const isLast = page === totalPages || totalPages === 0;

  const go = (target) => {
    if (!target || target < 1 || target > totalPages || target === page) {
      return;
    }

    onChange(target);
  };

  const item = (label, target, disabled, active) => (
    <li
      key={`${label}-${target}`}
      className={`page-item${disabled ? ' disabled' : ''}${active ? ' active' : ''}`}
    >
      <button
        type="button"
        className="page-link"
        disabled={disabled}
        onClick={() => go(target)}
        dangerouslySetInnerHTML={{ __html: label }}
      />
    </li>
  );

  return (
    <>
      <div className="record-count">
        <strong>{`Showing ${start} - ${end} of ${total} item(s)`}</strong>
      </div>
      <ul className="pagination">
        {item('&laquo;', 1, isFirst)}
        {item('&lsaquo;', page - 1, isFirst)}
        {pages.map((value) => item(String(value), value, false, value === page))}
        {item('&rsaquo;', page + 1, isLast)}
        {item('&raquo;', totalPages || 1, isLast)}
      </ul>
    </>
  );
};

export { Pagination };
