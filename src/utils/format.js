const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

export function formatCurrency(amount) {
  const n = Number.isFinite(amount) ? amount : 0;
  return pesoFormatter.format(n);
}

// Compact form for large headline figures, e.g. ₱12.3k — keeps big balances
// from overflowing fixed-width cards on small phones.
export function formatCompact(amount) {
  const n = Number.isFinite(amount) ? amount : 0;
  if (Math.abs(n) >= 1000) {
    return '₱' + new Intl.NumberFormat('en-PH', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  }
  return formatCurrency(n);
}

export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

// "Today", "Yesterday", or a short date — friendlier for a recent-bills feed.
export function formatRelativeDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return formatDate(iso);
}

export function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
