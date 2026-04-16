import { describe, expect, it } from "vitest";

import { compareDiscoveryRuns } from "./compareDiscoveryRuns";
import type { DiscoveryGroupedSummary, DiscoveryNote } from "./apiTypes";

const emptyNotes: DiscoveryNote[] = [];

function gs(partial: Partial<DiscoveryGroupedSummary>): DiscoveryGroupedSummary {
  return {
    highConfidence: {
      openai: { files: partial.highConfidence?.openai?.files ?? [] },
    },
    experimental: {
      transformers: { files: partial.experimental?.transformers?.files ?? [] },
      modelArtifacts: { files: partial.experimental?.modelArtifacts?.files ?? [] },
    },
  };
}

describe("compareDiscoveryRuns", () => {
  it("reports added and removed files per category", () => {
    const older = {
      groupedSummary: gs({
        highConfidence: { openai: { files: ["a.ts", "b.ts"] } },
        experimental: {
          transformers: { files: ["x.py"] },
          modelArtifacts: { files: ["m.pt"] },
        },
      }),
      notes: emptyNotes,
    };
    const newer = {
      groupedSummary: gs({
        highConfidence: { openai: { files: ["b.ts", "c.ts"] } },
        experimental: {
          transformers: { files: ["x.py", "y.py"] },
          modelArtifacts: { files: [] },
        },
      }),
      notes: emptyNotes,
    };
    const d = compareDiscoveryRuns(older, newer);
    expect(d.openai.added).toEqual(["c.ts"]);
    expect(d.openai.removed).toEqual(["a.ts"]);
    expect(d.transformers.added).toEqual(["y.py"]);
    expect(d.transformers.removed).toEqual([]);
    expect(d.modelArtifacts.added).toEqual([]);
    expect(d.modelArtifacts.removed).toEqual(["m.pt"]);
  });

  it("diffs combined-signal folders from notes", () => {
    const notesOld: DiscoveryNote[] = [
      {
        code: "combined_local_inference",
        message: "x",
        folders: ["pkg/a", "pkg/b"],
      },
    ];
    const notesNew: DiscoveryNote[] = [
      {
        code: "combined_local_inference",
        message: "x",
        folders: ["pkg/b", "pkg/c"],
      },
    ];
    const d = compareDiscoveryRuns(
      { groupedSummary: gs({}), notes: notesOld },
      { groupedSummary: gs({}), notes: notesNew }
    );
    expect(d.combinedFolders.added).toEqual(["pkg/c"]);
    expect(d.combinedFolders.removed).toEqual(["pkg/a"]);
  });
});
