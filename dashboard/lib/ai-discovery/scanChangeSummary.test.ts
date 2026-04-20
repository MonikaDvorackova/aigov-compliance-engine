import { describe, expect, it } from "vitest";

import { compareDiscoveryRuns } from "./compareDiscoveryRuns";
import { buildChangeSummaryFromDiff } from "./scanChangeSummary";

describe("buildChangeSummaryFromDiff", () => {
  it("counts added and removed paths per category", () => {
    const older = {
      groupedSummary: {
        highConfidence: { openai: { files: ["a.ts"] } },
        experimental: {
          transformers: { files: [] },
          modelArtifacts: { files: ["m.bin"] },
        },
      },
      notes: [{ code: "combined_local_inference" as const, message: "", folders: ["/x"] }],
    };
    const newer = {
      groupedSummary: {
        highConfidence: { openai: { files: ["a.ts", "b.ts"] } },
        experimental: {
          transformers: { files: ["t.py"] },
          modelArtifacts: { files: [] },
        },
      },
      notes: [{ code: "combined_local_inference" as const, message: "", folders: ["/x", "/y"] }],
    };
    const diff = compareDiscoveryRuns(older, newer);
    const s = buildChangeSummaryFromDiff(diff);
    expect(s.hasChanges).toBe(true);
    expect(s.addedCounts.openai).toBe(1);
    expect(s.removedCounts.modelArtifacts).toBe(1);
    expect(s.addedCounts.transformers).toBe(1);
    expect(s.addedCounts.combinedFolders).toBe(1);
  });

  it("reports no changes when identical", () => {
    const gs = {
      highConfidence: { openai: { files: ["a.ts"] } },
      experimental: {
        transformers: { files: [] },
        modelArtifacts: { files: [] },
      },
    };
    const n = [{ code: "combined_local_inference" as const, message: "", folders: [] }];
    const diff = compareDiscoveryRuns(
      { groupedSummary: gs, notes: n },
      { groupedSummary: gs, notes: n }
    );
    const s = buildChangeSummaryFromDiff(diff);
    expect(s.hasChanges).toBe(false);
    expect(s.addedCounts.openai).toBe(0);
    expect(s.removedCounts.openai).toBe(0);
  });
});
