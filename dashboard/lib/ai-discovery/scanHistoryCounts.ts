import type { DiscoveryGroupedSummary, DiscoveryNote } from "./apiTypes";

export type DiscoveryScanCounts = {
  openai: number;
  transformers: number;
  modelArtifacts: number;
  combinedFolders: number;
};

export function countsFromDiscoveryResult(
  groupedSummary: DiscoveryGroupedSummary,
  notes: DiscoveryNote[]
): DiscoveryScanCounts {
  const g = groupedSummary;
  const combined = notes.find((n) => n.code === "combined_local_inference");
  return {
    openai: g.highConfidence.openai.files.length,
    transformers: g.experimental.transformers.files.length,
    modelArtifacts: g.experimental.modelArtifacts.files.length,
    combinedFolders: combined?.folders.length ?? 0,
  };
}
