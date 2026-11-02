const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

export function formatCurrency(amount) {
  const n = Number.isFinite(amount) ? amount : 0;
  return pesoFormatter.format(n);
}

// Compact form for headline figures, e.g. ₱12.3K — keeps balances from
// overflowing fixed-width cards and chart columns on small phones.
//
// Centavos are dropped at EVERY size, not only above ₱1,000. Falling through
// to the full formatter under a thousand produced "₱480.00" in a 37px chart
// column, which overflowed it and collided with the next month — and two
// decimals are noise in a figure that is already rounded to one significant
// place above it. Exact amounts use formatCurrency; this is for glanceable
// ones.
export function formatCompact(amount) {
  const n = Number.isFinite(amount) ? amount : 0;
  if (Math.abs(n) >= 1000) {
    return '₱' + new Intl.NumberFormat('en-PH', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  }
  return '₱' + new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 0,
  }).format(n);
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
