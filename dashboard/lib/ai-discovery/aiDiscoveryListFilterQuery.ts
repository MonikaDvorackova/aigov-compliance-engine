/**
 * Builds query strings for AI Discovery list APIs from page URL search params.
 * Page uses `sortInbox`, `sortTargets`, `sortHistory` so each section can sort independently
 * (each API accepts a single `sort` param).
 *
 * - `target` = exact target id (deep links). Passed through to APIs as `target`.
 * - `targetQuery` = substring search on target id. Passed through as `targetQuery`.
 */
export function inboxApiQueryFromPageParams(sp: URLSearchParams): string {
  const p = new URLSearchParams();
  for (const key of ["target", "targetQuery", "reviewStatus", "alertStatus", "hasOpenChanges", "limit"] as const) {
    const v = sp.get(key)?.trim();
    if (v) p.set(key, v);
  }
  const sort = sp.get("sortInbox")?.trim();
  if (sort) p.set("sort", sort);
  return p.toString();
}

export function targetStatusApiQueryFromPageParams(sp: URLSearchParams): string {
  const p = new URLSearchParams();
  for (const key of ["target", "targetQuery", "reviewStatus", "alertStatus", "hasOpenChanges"] as const) {
    const v = sp.get(key)?.trim();
    if (v) p.set(key, v);
  }
  const sort = sp.get("sortTargets")?.trim();
  if (sort) p.set("sort", sort);
  return p.toString();
}

/**
 * Filter/sort params only — history section appends `limit` / `offset` for pagination client-side.
 */
export function historyApiQueryFromPageParams(sp: URLSearchParams): string {
  const p = new URLSearchParams();
  for (const key of ["target", "targetQuery", "reviewStatus", "alertStatus", "triggerType"] as const) {
    const v = sp.get(key)?.trim();
    if (v) p.set(key, v);
  }
  const sort = sp.get("sortHistory")?.trim();
  if (sort) p.set("sort", sort);
  return p.toString();
}

/** Page size for history “Load more” requests (API uses `limit` / `offset`). */
export const AI_DISCOVERY_HISTORY_PAGE_SIZE = 50;

/** Merges filter query with pagination params for `GET /api/ai-discovery/history`. */
export function historyFetchQuery(
  baseListQuery: string,
  opts: { offset: number; limit: number }
): string {
  const p = new URLSearchParams(baseListQuery);
  p.set("limit", String(opts.limit));
  p.set("offset", String(opts.offset));
  return p.toString();
}
