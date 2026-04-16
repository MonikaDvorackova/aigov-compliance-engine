/**
 * Candidate path normalization for UI keys and POST body.
 * Keep in sync with `normalizeCandidatePath` in `ai_discovery/confirmedStore.ts`.
 */
export function normalizeCandidatePath(file: string): string {
  return file
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .toLowerCase();
}

/** Directory key for grouping (normalized, comparable). */
export function candidateFolderGroupKey(file: string): string {
  const n = normalizeCandidatePath(file);
  const i = n.lastIndexOf("/");
  if (i <= 0) return ".";
  return n.slice(0, i) || ".";
}

/** Display folder line from original path (trim + slashes, preserve case). */
export function candidateFolderDisplay(file: string): string {
  const s = file.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
  const i = s.lastIndexOf("/");
  if (i <= 0) return ".";
  return s.slice(0, i) || ".";
}
