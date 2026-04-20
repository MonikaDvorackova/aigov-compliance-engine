import { describe, expect, it } from "vitest";

import {
  buildDiscoveryInboxReasonTags,
  deriveDiscoveryInboxFromScans,
  isDiscoveryTargetActionable,
} from "./deriveDiscoveryInbox.server";
import type { DiscoveryTargetCurrentStatus } from "./discoveryTargetStatusTypes";
import type { StoredDiscoveryScan } from "./scanHistoryTypes";

const emptyGs = {
  highConfidence: { openai: { files: [] as string[] } },
  experimental: {
    transformers: { files: [] as string[] },
    modelArtifacts: { files: [] as string[] },
  },
};

const baseScan = (over: Partial<StoredDiscoveryScan>): StoredDiscoveryScan =>
  ({
    id: "id",
    createdAt: "2024-01-01T00:00:00.000Z",
    scanRoot: ".",
    detections: [],
    groupedSummary: emptyGs,
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

describe("deriveDiscoveryInboxFromScans", () => {
  it("includes unreviewed manual target", () => {
    const scans = [
      baseScan({
        id: "a",
        createdAt: "2024-06-01T00:00:00.000Z",
        reviewStatus: "unreviewed",
        scanRoot: "app",
      }),
    ];
    const items = deriveDiscoveryInboxFromScans(scans);
    expect(items).toHaveLength(1);
    expect(items[0]?.linkTarget).toBe("root:app");
    expect(items[0]?.reasonTags).toContain("Unreviewed");
  });

  it("excludes reviewed target with no other signals", () => {
    const scans = [
      baseScan({
        id: "b",
        reviewStatus: "reviewed",
        changeSummary: null,
      }),
    ];
    expect(deriveDiscoveryInboxFromScans(scans)).toHaveLength(0);
  });

  it("includes failed alert on latest scan", () => {
    const scans = [
      baseScan({
        id: "c",
        createdAt: "2024-06-02T00:00:00.000Z",
        reviewStatus: "reviewed",
        scheduledTargetId: "sched",
        triggerType: "scheduled",
      }),
    ];
    (scans[0] as unknown as { alertDeliveryStatus: string }).alertDeliveryStatus = "failed";
    const items = deriveDiscoveryInboxFromScans(scans);
    expect(items).toHaveLength(1);
    expect(items[0]?.reasonTags).toContain("Alert failed");
  });
});

describe("isDiscoveryTargetActionable", () => {
  it("matches tag rules", () => {
    const t = (partial: Partial<DiscoveryTargetCurrentStatus>): DiscoveryTargetCurrentStatus => ({
      targetId: "x",
      scanRoot: ".",
      repoUrl: null,
      projectId: null,
      lastScanAt: "2024-01-01T00:00:00.000Z",
      lastScanTriggerType: "manual",
      lastScanReviewStatus: "reviewed",
      lastScanDecision: null,
      lastAlertDeliveryStatus: null,
      lastChangeAt: null,
      hasOpenChanges: false,
      latestScanId: "scan-x",
      latestCounts: {
        openai: 0,
        transformers: 0,
        modelArtifacts: 0,
        combinedFolders: 0,
      },
      ...partial,
    });
    expect(isDiscoveryTargetActionable(t({ hasOpenChanges: true }))).toBe(true);
    expect(isDiscoveryTargetActionable(t({ lastScanReviewStatus: "unreviewed" }))).toBe(true);
    expect(isDiscoveryTargetActionable(t({ lastScanReviewStatus: "needs_follow_up" }))).toBe(true);
    expect(isDiscoveryTargetActionable(t({ lastAlertDeliveryStatus: "failed" }))).toBe(true);
    expect(isDiscoveryTargetActionable(t({}))).toBe(false);
  });
});

describe("buildDiscoveryInboxReasonTags", () => {
  it("returns multiple tags when applicable", () => {
    const tags = buildDiscoveryInboxReasonTags({
      targetId: "t",
      scanRoot: ".",
      repoUrl: null,
      projectId: null,
      lastScanAt: null,
      lastScanTriggerType: "scheduled",
      lastScanReviewStatus: "unreviewed",
      lastScanDecision: null,
      lastAlertDeliveryStatus: "failed",
      lastChangeAt: null,
      hasOpenChanges: true,
      latestScanId: "z",
      latestCounts: {
        openai: 1,
        transformers: 0,
        modelArtifacts: 0,
        combinedFolders: 0,
      },
    });
    expect(tags).toEqual(expect.arrayContaining(["Open changes", "Unreviewed", "Alert failed"]));
  });
});
