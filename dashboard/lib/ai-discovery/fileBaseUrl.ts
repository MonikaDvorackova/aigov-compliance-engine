/**
 * Join a repository "blob" base URL with a repo-relative file path.
 * - One slash between base and path (base trailing slashes stripped).
 * - Path segments split on `/` (and normalized from `\`); slashes are not encoded.
 * - Each segment is encoded once with encodeURIComponent (nested dirs, spaces, `#`, `?`, Unicode).
 */
export function joinRepoBlobUrl(baseUrl: string, repoRelativePath: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const normalized = repoRelativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return base;
  const segments = normalized.split("/").filter((s) => s.length > 0);
  const encodedPath = segments.map((seg) => encodeURIComponent(seg)).join("/");
  return `${base}/${encodedPath}`;
}

/** Reads `NEXT_PUBLIC_AI_DISCOVERY_FILES_BASE` (e.g. GitHub blob prefix). */
export function buildAiDiscoveryFileUrl(repoRelativePath: string): string | null {
  const raw = process.env.NEXT_PUBLIC_AI_DISCOVERY_FILES_BASE?.trim();
  if (!raw) return null;
  return joinRepoBlobUrl(raw, repoRelativePath);
}
