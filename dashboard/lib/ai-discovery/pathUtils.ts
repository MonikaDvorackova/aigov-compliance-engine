/** Browser-safe dirname aligned with typical `relative()` repo paths (forward slashes). */
export function pathDirname(filePath: string): string {
  const n = filePath.replace(/\\/g, "/");
  const i = n.lastIndexOf("/");
  if (i === -1) return ".";
  return n.slice(0, i) || ".";
}
