import { relative } from "node:path";

import { NextResponse } from "next/server";

import { requireAiDiscoverySession } from "@/lib/ai-discovery/aiDiscoveryRouteAuth.server";
import {
  getDiscoveryRepoRoot,
  safeResolveScanPath,
} from "@/lib/ai-discovery/safeScanPath";
import { gatherScanContextFromEnvironment } from "@/lib/ai-discovery/scanContextMetadata.server";
import { appendSuccessfulScan } from "@/lib/ai-discovery/scanHistoryPersistence.server";
import { loadRunDiscovery } from "@/lib/ai-discovery/loadEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type AiDiscoveryPostBody = {
  /** Path relative to the configured repository root (optional). */
  target?: string;
};

export async function POST(request: Request) {
  const auth = await requireAiDiscoverySession();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let body: AiDiscoveryPostBody = {};
  try {
    body = (await request.json()) as AiDiscoveryPostBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "Expected JSON body." },
      { status: 400 }
    );
  }

  const repoRoot = getDiscoveryRepoRoot();
  const resolved = safeResolveScanPath(repoRoot, body.target);

  if (!resolved.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: resolved.error,
        message:
          resolved.error === "path_traversal"
            ? "Scan target must stay within the repository root."
            : "Invalid scan target.",
      },
      { status: 400 }
    );
  }

  try {
    // Engine: collect paths → scanFiles() → buildDiscoveryResult() → JSON (no CLI text).
    // Model artifacts: filename heuristics only; not all .bin files (see model_artifact_detector.ts).
    const runDiscovery = await loadRunDiscovery();
    const result = runDiscovery(resolved.absolutePath);
    const scanRootDisplay =
      relative(repoRoot, resolved.absolutePath) || ".";

    try {
      const envCtx = gatherScanContextFromEnvironment();
      const triggeredBy =
        user.email?.trim() ||
        (typeof user.id === "string" ? user.id.trim() : null) ||
        null;
      appendSuccessfulScan({
        scanRoot: scanRootDisplay,
        detections: result.detections,
        groupedSummary: result.groupedSummary,
        notes: result.notes,
        ...envCtx,
        triggeredBy,
        triggerType: "manual",
      });
    } catch (e) {
      console.error("[ai-discovery] scan history persist failed:", e);
    }

    return NextResponse.json(
      {
        ok: true,
        scanRoot: scanRootDisplay,
        ...result,
      },
      { status: 200 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scan failed.";
    return NextResponse.json(
      { ok: false, error: "scan_failed", message },
      { status: 500 }
    );
  }
}
