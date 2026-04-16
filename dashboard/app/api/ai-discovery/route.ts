import { relative } from "node:path";

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getDiscoveryRepoRoot,
  safeResolveScanPath,
} from "@/lib/ai-discovery/safeScanPath";
import { appendSuccessfulScan } from "@/lib/ai-discovery/scanHistoryPersistence.server";
import { loadRunDiscovery } from "@/lib/ai-discovery/loadEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type AiDiscoveryPostBody = {
  /** Path relative to the configured repository root (optional). */
  target?: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return NextResponse.json(
      { ok: false, error: "auth_error", message: userErr.message },
      { status: 401 }
    );
  }

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "Not signed in." },
      { status: 401 }
    );
  }

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
      appendSuccessfulScan({
        scanRoot: scanRootDisplay,
        detections: result.detections,
        groupedSummary: result.groupedSummary,
        notes: result.notes,
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
