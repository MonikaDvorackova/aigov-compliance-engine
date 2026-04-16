import { describe, expect, it } from "vitest";

import {
  filterAndSortInboxItems,
  filterAndSortStoredScans,
  filterAndSortTargetStatuses,
  matchesTargetFilters,
  pageHistoryScanResults,
  parseHistoryQuery,
  parseInboxQuery,
  parseTargetStatusQuery,
} from "./aiDiscoveryListQuery.server";
import type { DiscoveryInboxItem } from "./discoveryInboxTypes";
import type { DiscoveryTargetCurrentStatus } from "./discoveryTargetStatusTypes";
import type { StoredDiscoveryScan } from "./scanHistoryTypes";

const emptyCounts = {
  openai: 0,
  transformers: 0,
  modelArtifacts: 0,
  combinedFolders: 0,
};

const inboxItem = (over: Partial<DiscoveryInboxItem>): DiscoveryInboxItem => ({
  targetId: "root:app",
  scanRoot: "app",
  repoUrl: null,
  projectId: null,
  linkTarget: "root:app",
  latestScanId: "scan-1",
  lastScanAt: "2024-06-01T00:00:00.000Z",
  reviewStatus: "unreviewed",
  alertStatus: null,
  decision: null,
  reasonTags: [],
  hasOpenChanges: false,
  latestCounts: emptyCounts,
  ...over,
});

const targetRow = (over: Partial<DiscoveryTargetCurrentStatus>): DiscoveryTargetCurrentStatus => ({
  targetId: "root:app",
  scanRoot: "app",
  repoUrl: null,
  projectId: null,
  lastScanAt: "2024-06-01T00:00:00.000Z",
  lastScanTriggerType: "manual",
  lastScanReviewStatus: "unreviewed",
  lastScanDecision: null,
  lastAlertDeliveryStatus: null,
  lastChangeAt: null,
  hasOpenChanges: false,
  latestCounts: emptyCounts,
  latestScanId: "scan-1",
  ...over,
});

const scan = (over: Partial<StoredDiscoveryScan>): StoredDiscoveryScan =>
  ({
    id: "id",
    createdAt: "2024-06-01T12:00:00.000Z",
    scanRoot: "app",
    detections: [],
    groupedSummary: {
      highConfidence: { openai: { files: [] } },
      experimental: { transformers: { files: [] }, modelArtifacts: { files: [] } },
    },
    notes: [],
    reviewStatus: "unreviewed",
    reviewNote: null,
    reviewedAt: null,
    reviewedBy: null,
    decision: null,
    projectId: null,
    repoUrl: null,
    branch: null,
    commitSha: null,
    triggeredBy: null,
    triggerType: "manual",
    scheduledTargetId: null,
    changeSummary: null,
    ...over,
  }) as StoredDiscoveryScan;

describe("parseInboxQuery", () => {
  it("defaults sort to lastScanAt_desc", () => {
    const q = parseInboxQuery(new URLSearchParams(""));
    expect(q.sort).toBe("lastScanAt_desc");
  });

  it("parses hasOpenChanges", () => {
    const q = parseInboxQuery(new URLSearchParams("hasOpenChanges=true"));
    expect(q.hasOpenChanges).toBe(true);
  });
});

describe("matchesTargetFilters", () => {
  it("exact target does not match partial id", () => {
    expect(matchesTargetFilters("root:foobar", "root:foo", undefined)).toBe(false);
    expect(matchesTargetFilters("root:foo", "root:foo", undefined)).toBe(true);
  });

  it("fuzzy matches substring", () => {
    expect(matchesTargetFilters("root:foobar", undefined, "oba")).toBe(true);
    expect(matchesTargetFilters("root:foo", undefined, "bar")).toBe(false);
  });
});

describe("filterAndSortInboxItems", () => {
  it("filters by targetQuery substring", () => {
    const items = [
      inboxItem({ targetId: "root:foo", linkTarget: "root:foo" }),
      inboxItem({ targetId: "root:bar", linkTarget: "root:bar" }),
    ];
    const out = filterAndSortInboxItems(
      items,
      parseInboxQuery(new URLSearchParams("targetQuery=bar"))
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.targetId).toBe("root:bar");
  });

  it("filters by exact target", () => {
    const items = [
      inboxItem({ targetId: "root:foo", linkTarget: "root:foo" }),
      inboxItem({ targetId: "root:foobar", linkTarget: "root:foobar" }),
    ];
    const out = filterAndSortInboxItems(
      items,
      parseInboxQuery(new URLSearchParams("target=root:foo"))
    );
    expect(out.map((i) => i.targetId)).toEqual(["root:foo"]);
  });
});

describe("parseTargetStatusQuery", () => {
  it("accepts openChanges_desc", () => {
    const q = parseTargetStatusQuery(new URLSearchParams("sort=openChanges_desc"));
    expect(q.sort).toBe("openChanges_desc");
  });
});

describe("filterAndSortTargetStatuses", () => {
  it("sorts openChanges_desc with open changes first", () => {
    const rows = [
      targetRow({ targetId: "a", hasOpenChanges: false, lastScanAt: "2024-07-01T00:00:00.000Z" }),
      targetRow({ targetId: "b", hasOpenChanges: true, lastScanAt: "2024-06-01T00:00:00.000Z" }),
    ];
    const out = filterAndSortTargetStatuses(
      rows,
      parseTargetStatusQuery(new URLSearchParams("sort=openChanges_desc"))
    );
    expect(out.map((r) => r.targetId)).toEqual(["b", "a"]);
  });
});

describe("parseHistoryQuery", () => {
  it("defaults sort to createdAt_desc", () => {
    const q = parseHistoryQuery(new URLSearchParams(""));
    expect(q.sort).toBe("createdAt_desc");
  });
});

describe("pageHistoryScanResults", () => {
  it("returns full list when limit omitted", () => {
    const rows = [
      scan({ id: "a", createdAt: "2024-01-02T00:00:00.000Z" }),
      scan({ id: "b", createdAt: "2024-01-01T00:00:00.000Z" }),
    ];
    const ordered = filterAndSortStoredScans(rows, parseHistoryQuery(new URLSearchParams("")));
    const { page, hasMore, totalFiltered } = pageHistoryScanResults(ordered, parseHistoryQuery(new URLSearchParams("")));
    expect(totalFiltered).toBe(2);
    expect(page).toHaveLength(2);
    expect(hasMore).toBe(false);
  });

  it("pages by offset and limit", () => {
    const rows = [
      scan({ id: "a", createdAt: "2024-01-03T00:00:00.000Z" }),
      scan({ id: "b", createdAt: "2024-01-02T00:00:00.000Z" }),
      scan({ id: "c", createdAt: "2024-01-01T00:00:00.000Z" }),
    ];
    const ordered = filterAndSortStoredScans(rows, parseHistoryQuery(new URLSearchParams("")));
    const q = parseHistoryQuery(new URLSearchParams("limit=2&offset=1"));
    const { page, hasMore, totalFiltered } = pageHistoryScanResults(ordered, q);
    expect(totalFiltered).toBe(3);
    expect(page.map((s) => s.id)).toEqual(["b", "c"]);
    expect(hasMore).toBe(false);
  });
});

describe("filterAndSortStoredScans", () => {
  it("filters manual trigger including null legacy", () => {
    const rows = [
      scan({ id: "1", triggerType: "manual", createdAt: "2024-01-01T00:00:00.000Z" }),
      scan({ id: "2", triggerType: null, createdAt: "2024-02-01T00:00:00.000Z" }),
      scan({ id: "3", triggerType: "scheduled", createdAt: "2024-03-01T00:00:00.000Z" }),
    ];
    const out = filterAndSortStoredScans(
      rows,
      parseHistoryQuery(new URLSearchParams("triggerType=manual"))
    );
    expect(out.map((s) => s.id).sort()).toEqual(["1", "2"]);
  });

  it("sorts by createdAt_asc", () => {
    const rows = [
      scan({ id: "late", createdAt: "2024-02-01T00:00:00.000Z" }),
      scan({ id: "early", createdAt: "2024-01-01T00:00:00.000Z" }),
    ];
    const out = filterAndSortStoredScans(
      rows,
      parseHistoryQuery(new URLSearchParams("sort=createdAt_asc"))
    );
    expect(out.map((s) => s.id)).toEqual(["early", "late"]);
  });
});
