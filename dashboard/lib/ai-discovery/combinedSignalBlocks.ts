import type { DiscoveryGroupedSummary, DiscoveryNote } from "./apiTypes";

import { pathDirname } from "./pathUtils";

export type CombinedSignalFolderBlock = {
  folder: string;
  files: string[];
};

/**
 * For each folder in the combined-local-inference note, list transformer + model-artifact
 * files whose dirname matches that folder (same rule as the discovery engine).
 */
export function buildCombinedSignalFolderBlocks(
  grouped: DiscoveryGroupedSummary,
  notes: DiscoveryNote[]
): CombinedSignalFolderBlock[] {
  const note = notes.find((n) => n.code === "combined_local_inference");
  if (!note || note.folders.length === 0) return [];

  const tf = grouped.experimental.transformers.files;
  const ma = grouped.experimental.modelArtifacts.files;

  return note.folders.map((folder) => {
    const set = new Set<string>();
    for (const f of tf) {
      if (pathDirname(f) === folder) set.add(f);
    }
    for (const f of ma) {
      if (pathDirname(f) === folder) set.add(f);
    }
    return { folder, files: [...set].sort() };
  });
}
