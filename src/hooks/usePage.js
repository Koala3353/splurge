import { useState } from 'react';

export const PAGE_SIZE = 8;

/**
 * Keeps a long list browsable: slices it, and rewinds if the list shrinks
 * under us (a payment undone, a split settled).
 *
 * Lives beside <Pager> rather than inside it so that file exports a component
 * and nothing else, which is what keeps fast refresh working.
 */
export function usePage(total) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safe = Math.min(page, pageCount - 1);
  if (safe !== page) setPage(safe);
  const start = safe * PAGE_SIZE;
  return {
    page: safe,
    pageCount,
    start,
    end: Math.min(start + PAGE_SIZE, total),
    setPage,
  };
}
