import path from "node:path";
import { pathToFileURL } from "node:url";

import type { DiscoveryResponse } from "./apiTypes";

type RunDiscoveryFn = (absoluteRoot: string) => DiscoveryResponse;

let cached: RunDiscoveryFn | null = null;

/**
 * Loads the compiled `ai_discovery` engine from disk at runtime (avoids bundling repo-root sources).
 * Requires `tsc -p ../ai_discovery/tsconfig.json` before `next build` / `next dev`.
 */
export async function loadRunDiscovery(): Promise<RunDiscoveryFn> {
  if (cached) return cached;

  const engineJs = path.join(
    process.cwd(),
    "..",
    "ai_discovery",
    "dist",
    "runDiscovery.js"
  );

  const mod = (await import(
    /* webpackIgnore: true */
    pathToFileURL(engineJs).href
  )) as { runDiscovery: RunDiscoveryFn };

  cached = mod.runDiscovery;
  return mod.runDiscovery;
}
