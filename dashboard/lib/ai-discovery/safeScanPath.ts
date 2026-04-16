import { relative, resolve } from "node:path";

/** Default: parent of the dashboard app (repository root in this monorepo layout). */
export function getDiscoveryRepoRoot(): string {
  const fromEnv = process.env.AI_DISCOVERY_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);
  return resolve(process.cwd(), "..");
}

export type SafeResolveResult =
  | { ok: true; absolutePath: string }
  | { ok: false; error: "invalid_target" | "path_traversal" };

/**
 * Resolve `target` under `repoRoot` and reject path traversal.
 * Empty `target` scans the whole repo root.
 */
export function safeResolveScanPath(
  repoRoot: string,
  target: string | undefined
): SafeResolveResult {
  const root = resolve(repoRoot);
  const raw = (target ?? "").trim();
  if (raw.includes("\0")) {
    return { ok: false, error: "invalid_target" };
  }
  const abs = resolve(root, raw);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || rel.includes("..")) {
    return { ok: false, error: "path_traversal" };
  }
  return { ok: true, absolutePath: abs };
}
