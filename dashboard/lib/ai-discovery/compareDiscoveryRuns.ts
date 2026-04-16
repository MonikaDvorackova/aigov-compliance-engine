import type { DiscoveryGroupedSummary, DiscoveryNote } from "./apiTypes";

export type CategoryFileDiff = {
  added: string[];
  removed: string[];
};

export type CombinedFoldersDiff = {
  added: string[];
  removed: string[];
};

export type DiscoveryRunDiff = {
  openai: CategoryFileDiff;
  transformers: CategoryFileDiff;
  modelArtifacts: CategoryFileDiff;
  combinedFolders: CombinedFoldersDiff;
};

function sortUnique(paths: string[]): string[] {
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}

function diffSets(before: Set<string>, after: Set<string>): CategoryFileDiff {
  const added: string[] = [];
  const removed: string[] = [];
  for (const p of after) {
    if (!before.has(p)) added.push(p);
  }
  for (const p of before) {
    if (!after.has(p)) removed.push(p);
  }
  return { added: sortUnique(added), removed: sortUnique(removed) };
}

function filesByCategory(gs: DiscoveryGroupedSummary) {
  return {
    openai: new Set(gs.highConfidence.openai.files),
    transformers: new Set(gs.experimental.transformers.files),
    modelArtifacts: new Set(gs.experimental.modelArtifacts.files),
  };
}

function combinedFolderSet(notes: DiscoveryNote[]): Set<string> {
  const n = notes.find((x) => x.code === "combined_local_inference");
  return new Set(n?.folders ?? []);
}

/**
 * Compare two successful runs. `older` and `newer` should reflect scan order (by createdAt).
 * "Added" = present in newer but not older; "removed" = present in older but not newer.
 */
export function compareDiscoveryRuns(
  older: { groupedSummary: DiscoveryGroupedSummary; notes: DiscoveryNote[] },
  newer: { groupedSummary: DiscoveryGroupedSummary; notes: DiscoveryNote[] }
): DiscoveryRunDiff {
  const o = filesByCategory(older.groupedSummary);
  const n = filesByCategory(newer.groupedSummary);
  const co = combinedFolderSet(older.notes);
  const cn = combinedFolderSet(newer.notes);

  return {
    openai: diffSets(o.openai, n.openai),
    transformers: diffSets(o.transformers, n.transformers),
    modelArtifacts: diffSets(o.modelArtifacts, n.modelArtifacts),
    combinedFolders: diffSets(co, cn),
  };
}
