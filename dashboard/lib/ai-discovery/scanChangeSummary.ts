import type { DiscoveryRunDiff } from "./compareDiscoveryRuns";

export type DiscoveryCategoryCounts = {
  openai: number;
  transformers: number;
  modelArtifacts: number;
  combinedFolders: number;
};

export type DiscoveryScanChangeSummary = {
  hasChanges: boolean;
  addedCounts: DiscoveryCategoryCounts;
  removedCounts: DiscoveryCategoryCounts;
};

export const ZERO_CATEGORY_COUNTS: DiscoveryCategoryCounts = {
  openai: 0,
  transformers: 0,
  modelArtifacts: 0,
  combinedFolders: 0,
};

export function buildChangeSummaryFromDiff(diff: DiscoveryRunDiff): DiscoveryScanChangeSummary {
  const addedCounts: DiscoveryCategoryCounts = {
    openai: diff.openai.added.length,
    transformers: diff.transformers.added.length,
    modelArtifacts: diff.modelArtifacts.added.length,
    combinedFolders: diff.combinedFolders.added.length,
  };
  const removedCounts: DiscoveryCategoryCounts = {
    openai: diff.openai.removed.length,
    transformers: diff.transformers.removed.length,
    modelArtifacts: diff.modelArtifacts.removed.length,
    combinedFolders: diff.combinedFolders.removed.length,
  };
  const hasChanges =
    Object.values(addedCounts).some((n) => n > 0) ||
    Object.values(removedCounts).some((n) => n > 0);

  return { hasChanges, addedCounts, removedCounts };
}
