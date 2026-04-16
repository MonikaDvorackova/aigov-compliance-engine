import { describe, expect, it } from "vitest";

import { deriveDiscoveryTargetStatuses } from "./deriveDiscoveryTargetStatus.server";
import type { StoredDiscoveryScan } from "./scanHistoryTypes";

const baseScan = (over: Partial<StoredDiscoveryScan>): StoredDiscoveryScan =>
  ({
    id: "x",
    createdAt: "2020-01-01T00:00:00.000Z",
    scanRoot: ".",
    detections: [],
    groupedSummary: {
      highConfidence: { openai: { files: [] } },
      experimental: {
        transformers: { files: [] },
        modelArtifacts: { files: [] },
      },
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
    triggerType: null,
    scheduledTargetId: null,
    changeSummary: null,
    ...over,
  }) as StoredDiscoveryScan;

describe("deriveDiscoveryTargetStatuses", () => {
  it("groups manual scans by scanRoot and scheduled by scheduledTargetId", () => {
    const scans: StoredDiscoveryScan[] = [
      baseScan({
        id: "a",
        createdAt: "2024-02-01T00:00:00.000Z",
        scanRoot: "python",
        scheduledTargetId: null,
        triggerType: "manual",
        reviewStatus: "reviewed",
        groupedSummary: {
          highConfidence: { openai: { files: ["a.ts"] } },
          experimental: { transformers: { files: [] }, modelArtifacts: { files: [] } },
        },
      }),
      baseScan({
        id: "b",
        createdAt: "2024-01-01T00:00:00.000Z",
        scanRoot: "dashboard",
        scheduledTargetId: "t1",
        triggerType: "scheduled",
        changeSummary: { hasChanges: true, addedCounts: {
          openai: 1, transformers: 0, modelArtifacts: 0, combinedFolders: 0,
        }, removedCounts: {
          openai: 0, transformers: 0, modelArtifacts: 0, combinedFolders: 0,
        } },
        reviewStatus: "unreviewed",
        groupedSummary: {
          highConfidence: { openai: { files: ["b.ts"] } },
          experimental: { transformers: { files: [] }, modelArtifacts: { files: [] } },
        },
      }),
    ];
    const rows = deriveDiscoveryTargetStatuses(scans);
    expect(rows).toHaveLength(2);
    const manual = rows.find((r) => r.targetId === "root:python");
    expect(manual?.latestCounts.openai).toBe(1);
    expect(manual?.latestScanId).toBe("a");
    const sched = rows.find((r) => r.targetId === "t1");
    expect(sched?.hasOpenChanges).toBe(true);
    expect(sched?.latestScanId).toBe("b");
    expect(sched?.lastChangeAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("hasOpenChanges false when latest change scan is reviewed", () => {
    const scans: StoredDiscoveryScan[] = [
      baseScan({
        id: "c",
        createdAt: "2024-03-01T00:00:00.000Z",
        scanRoot: ".",
        scheduledTargetId: "job",
        triggerType: "scheduled",
        changeSummary: {
          hasChanges: true,
          addedCounts: { openai: 0, transformers: 1, modelArtifacts: 0, combinedFolders: 0 },
          removedCounts: { openai: 0, transformers: 0, modelArtifacts: 0, combinedFolders: 0 },
        },
        reviewStatus: "reviewed",
        groupedSummary: {
          highConfidence: { openai: { files: [] } },
          experimental: { transformers: { files: ["t.py"] }, modelArtifacts: { files: [] } },
        },
      }),
    ];
    const rows = deriveDiscoveryTargetStatuses(scans);
    expect(rows[0]?.hasOpenChanges).toBe(false);
    expect(rows[0]?.latestScanId).toBe("c");
  });
});
