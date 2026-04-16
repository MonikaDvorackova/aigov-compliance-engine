import type { DiscoveryInboxItem } from "./discoveryInboxTypes";
import type { DiscoveryTargetCurrentStatus } from "./discoveryTargetStatusTypes";
import { discoveryTargetKey } from "./discoveryTargetKey";
import type { DiscoveryScanReviewStatus } from "./scanReviewTypes";
import type { DiscoveryScanTriggerType, StoredDiscoveryScan } from "./scanHistoryTypes";
import type { DiscoveryTargetAlertDeliveryStatus } from "./discoveryTargetStatusTypes";
import { isValidReviewStatus } from "./scanReviewTypes";

const MAX_LIMIT = 500;

export function scanRecordAlertStatus(
  scan: StoredDiscoveryScan
): DiscoveryTargetAlertDeliveryStatus | null {
  const raw = (scan as Record<string, unknown>).alertDeliveryStatus;
  if (raw === "sent" || raw === "failed" || raw === "not_attempted") return raw;
  return null;
}

const MAX_OFFSET = 1_000_000;

/** `target` query param: exact id match (deep links). `targetQuery`: substring match (manual search). */
export function matchesTargetFilters(
  targetId: string,
  exact: string | undefined,
  fuzzy: string | undefined
): boolean {
  const e = exact?.trim();
  if (e !== undefined && e !== "" && targetId !== e) return false;
  const f = fuzzy?.trim();
  if (f !== undefined && f !== "" && !targetId.includes(f)) return false;
  return true;
}

function parseOffset(raw: string | null): number | undefined {
  if (raw === null || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.min(n, MAX_OFFSET);
}

function parseLimit(raw: string | null): number | undefined {
  if (raw === null || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(n, MAX_LIMIT);
}

function parseHasOpenChanges(raw: string | null): boolean | undefined {
  if (raw === null || raw === "") return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

function parseReviewStatusParam(raw: string | null): DiscoveryScanReviewStatus | undefined {
  if (!raw || !isValidReviewStatus(raw)) return undefined;
  return raw;
}

function parseAlertStatusParam(
  raw: string | null
): DiscoveryTargetAlertDeliveryStatus | "none" | undefined {
  if (!raw) return undefined;
  if (raw === "none") return "none";
  if (raw === "not_attempted" || raw === "sent" || raw === "failed") return raw;
  return undefined;
}

function parseTriggerTypeParam(raw: string | null): DiscoveryScanTriggerType | undefined {
  if (raw === "manual" || raw === "scheduled") return raw;
  return undefined;
}

export type ParsedInboxQuery = {
  /** Exact target id (e.g. deep links `?target=`). */
  target?: string;
  /** Substring match on target id (e.g. `?targetQuery=`). */
  targetQuery?: string;
  reviewStatus?: DiscoveryScanReviewStatus;
  alertStatus?: DiscoveryTargetAlertDeliveryStatus | "none";
  hasOpenChanges?: boolean;
  limit?: number;
  sort: "lastScanAt_desc" | "lastScanAt_asc";
};

export function parseInboxQuery(searchParams: URLSearchParams): ParsedInboxQuery {
  const sortRaw = searchParams.get("sort");
  const sort: ParsedInboxQuery["sort"] =
    sortRaw === "lastScanAt_asc" ? "lastScanAt_asc" : "lastScanAt_desc";
  return {
    target: searchParams.get("target")?.trim() || undefined,
    targetQuery: searchParams.get("targetQuery")?.trim() || undefined,
    reviewStatus: parseReviewStatusParam(searchParams.get("reviewStatus")),
    alertStatus: parseAlertStatusParam(searchParams.get("alertStatus")),
    hasOpenChanges: parseHasOpenChanges(searchParams.get("hasOpenChanges")),
    limit: parseLimit(searchParams.get("limit")),
    sort,
  };
}

export function filterAndSortInboxItems(
  items: DiscoveryInboxItem[],
  q: ParsedInboxQuery
): DiscoveryInboxItem[] {
  let out = items.filter((item) => {
    if (!matchesTargetFilters(item.targetId, q.target, q.targetQuery)) return false;
    if (q.reviewStatus !== undefined && item.reviewStatus !== q.reviewStatus) return false;
    if (q.alertStatus !== undefined) {
      if (q.alertStatus === "none") {
        if (item.alertStatus !== null) return false;
      } else if (item.alertStatus !== q.alertStatus) return false;
    }
    if (q.hasOpenChanges !== undefined && item.hasOpenChanges !== q.hasOpenChanges) return false;
    return true;
  });

  out = [...out].sort((a, b) => {
    const ta = a.lastScanAt ? new Date(a.lastScanAt).getTime() : 0;
    const tb = b.lastScanAt ? new Date(b.lastScanAt).getTime() : 0;
    return q.sort === "lastScanAt_asc" ? ta - tb : tb - ta;
  });

  if (q.limit !== undefined) {
    out = out.slice(0, q.limit);
  }
  return out;
}

export type ParsedTargetStatusQuery = {
  target?: string;
  targetQuery?: string;
  reviewStatus?: DiscoveryScanReviewStatus;
  alertStatus?: DiscoveryTargetAlertDeliveryStatus | "none";
  hasOpenChanges?: boolean;
  sort: "lastScanAt_desc" | "lastScanAt_asc" | "openChanges_desc";
};

export function parseTargetStatusQuery(searchParams: URLSearchParams): ParsedTargetStatusQuery {
  const sortRaw = searchParams.get("sort");
  let sort: ParsedTargetStatusQuery["sort"] = "lastScanAt_desc";
  if (sortRaw === "lastScanAt_asc") sort = "lastScanAt_asc";
  else if (sortRaw === "openChanges_desc") sort = "openChanges_desc";

  return {
    target: searchParams.get("target")?.trim() || undefined,
    targetQuery: searchParams.get("targetQuery")?.trim() || undefined,
    reviewStatus: parseReviewStatusParam(searchParams.get("reviewStatus")),
    alertStatus: parseAlertStatusParam(searchParams.get("alertStatus")),
    hasOpenChanges: parseHasOpenChanges(searchParams.get("hasOpenChanges")),
    sort,
  };
}

export function filterAndSortTargetStatuses(
  targets: DiscoveryTargetCurrentStatus[],
  q: ParsedTargetStatusQuery
): DiscoveryTargetCurrentStatus[] {
  let out = targets.filter((t) => {
    if (!matchesTargetFilters(t.targetId, q.target, q.targetQuery)) return false;
    if (q.reviewStatus !== undefined && t.lastScanReviewStatus !== q.reviewStatus) return false;
    if (q.alertStatus !== undefined) {
      if (q.alertStatus === "none") {
        if (t.lastAlertDeliveryStatus !== null) return false;
      } else if (t.lastAlertDeliveryStatus !== q.alertStatus) return false;
    }
    if (q.hasOpenChanges !== undefined && t.hasOpenChanges !== q.hasOpenChanges) return false;
    return true;
  });

  out = [...out].sort((a, b) => {
    if (q.sort === "openChanges_desc") {
      if (a.hasOpenChanges !== b.hasOpenChanges) return a.hasOpenChanges ? -1 : 1;
    }
    const ta = a.lastScanAt ? new Date(a.lastScanAt).getTime() : 0;
    const tb = b.lastScanAt ? new Date(b.lastScanAt).getTime() : 0;
    return q.sort === "lastScanAt_asc" ? ta - tb : tb - ta;
  });

  return out;
}

export type ParsedHistoryQuery = {
  target?: string;
  targetQuery?: string;
  triggerType?: DiscoveryScanTriggerType;
  reviewStatus?: DiscoveryScanReviewStatus;
  alertStatus?: DiscoveryTargetAlertDeliveryStatus | "none";
  /** When set with `limit`, returns a page of matching rows. When omitted, returns all matches (backward compatible). */
  limit?: number;
  offset?: number;
  sort: "createdAt_desc" | "createdAt_asc";
};

export function parseHistoryQuery(searchParams: URLSearchParams): ParsedHistoryQuery {
  const sortRaw = searchParams.get("sort");
  const sort: ParsedHistoryQuery["sort"] =
    sortRaw === "createdAt_asc" ? "createdAt_asc" : "createdAt_desc";
  return {
    target: searchParams.get("target")?.trim() || undefined,
    targetQuery: searchParams.get("targetQuery")?.trim() || undefined,
    triggerType: parseTriggerTypeParam(searchParams.get("triggerType")),
    reviewStatus: parseReviewStatusParam(searchParams.get("reviewStatus")),
    alertStatus: parseAlertStatusParam(searchParams.get("alertStatus")),
    limit: parseLimit(searchParams.get("limit")),
    offset: parseOffset(searchParams.get("offset")),
    sort,
  };
}

export function filterAndSortStoredScans(
  scans: StoredDiscoveryScan[],
  q: ParsedHistoryQuery
): StoredDiscoveryScan[] {
  let out = scans.filter((s) => {
    if (!matchesTargetFilters(discoveryTargetKey(s), q.target, q.targetQuery)) return false;
    if (q.triggerType !== undefined) {
      if (q.triggerType === "scheduled") {
        if (s.triggerType !== "scheduled") return false;
      } else {
        if (s.triggerType !== "manual" && s.triggerType !== null) return false;
      }
    }
    if (q.reviewStatus !== undefined && s.reviewStatus !== q.reviewStatus) return false;
    if (q.alertStatus !== undefined) {
      const a = scanRecordAlertStatus(s);
      if (q.alertStatus === "none") {
        if (a !== null) return false;
      } else if (a !== q.alertStatus) return false;
    }
    return true;
  });

  out = [...out].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return q.sort === "createdAt_asc" ? ta - tb : tb - ta;
  });

  return out;
}

/** Applies optional limit/offset pagination after filter+sort. Omits slice when `limit` is undefined (full result). */
export function pageHistoryScanResults(
  ordered: StoredDiscoveryScan[],
  q: ParsedHistoryQuery
): { page: StoredDiscoveryScan[]; totalFiltered: number; hasMore: boolean } {
  const totalFiltered = ordered.length;
  if (q.limit === undefined) {
    return { page: ordered, totalFiltered, hasMore: false };
  }
  const off = q.offset ?? 0;
  const page = ordered.slice(off, off + q.limit);
  const hasMore = off + page.length < totalFiltered;
  return { page, totalFiltered, hasMore };
}
