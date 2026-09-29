/** Human-readable date for the Remediated table. */
export function formatDate(iso) {
  if (!iso) {
    return '—';
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

/** `1 file` / `3 files`. */
export function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm || `${singular}s`}`;
}

export function errorMessage(error) {
  return (error && error.message) || 'Something went wrong. Please try again.';
}
