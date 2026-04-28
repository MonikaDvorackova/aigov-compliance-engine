import { relative, resolve } from "node:path";

/**
 * Discovery root.
 *
 * Production/custom deployments should set AI_DISCOVERY_ROOT explicitly.
 * The fallback is intentionally scoped to the dashboard directory to avoid
 * making Next/Turbopack track the whole monorepo during build.
 */
export function getDiscoveryRepoRoot(): string {
  const fromEnv = process.env.AI_DISCOVERY_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);
  return resolve(process.cwd());
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
