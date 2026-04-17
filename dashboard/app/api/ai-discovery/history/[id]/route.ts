import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  applyScanReviewFields,
  listStoredScans,
} from "@/lib/ai-discovery/scanHistoryPersistence.server";
import type { DiscoveryScanDecision } from "@/lib/ai-discovery/scanReviewTypes";
import { isValidReviewStatus } from "@/lib/ai-discovery/scanReviewTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseDecision(x: unknown): DiscoveryScanDecision | null | undefined {
  if (x === undefined) return undefined;
  if (x === null) return null;
  if (
    x === "informational" ||
    x === "needs_follow_up" ||
    x === "confirmed_local_model_signal"
  ) {
    return x;
  }
  return undefined;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "Expected JSON body." },
      { status: 400 }
    );
  }

  const existing = listStoredScans().find((s) => s.id === id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "Scan not found." },
      { status: 404 }
    );
  }

  const statusRaw = body.reviewStatus;
  if (!isValidReviewStatus(statusRaw)) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Invalid or missing reviewStatus." },
      { status: 400 }
    );
  }

  const reviewNoteRaw = body.reviewNote;
  const reviewNote =
    reviewNoteRaw === undefined
      ? existing.reviewNote
      : reviewNoteRaw === null || reviewNoteRaw === ""
        ? null
        : typeof reviewNoteRaw === "string"
          ? reviewNoteRaw.slice(0, 12000)
          : existing.reviewNote;

  const decisionParsed = parseDecision(body.decision);
  if (decisionParsed === undefined && body.decision !== undefined) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Invalid decision." },
      { status: 400 }
    );
  }
  const decision =
    decisionParsed === undefined ? existing.decision : decisionParsed;

  const reviewer =
    typeof user.email === "string" && user.email.length > 0
      ? user.email
      : typeof user.id === "string" && user.id.length > 0
        ? user.id
        : "user";

  if (statusRaw === "unreviewed") {
    const updated = applyScanReviewFields(id, {
      reviewStatus: "unreviewed",
      reviewNote,
      reviewedAt: null,
      reviewedBy: null,
      decision: null,
    });
    return NextResponse.json({ ok: true, scan: updated }, { status: 200 });
  }

  const updated = applyScanReviewFields(id, {
    reviewStatus: statusRaw,
    reviewNote,
    reviewedAt: new Date().toISOString(),
    reviewedBy: reviewer,
    decision,
  });

  return NextResponse.json({ ok: true, scan: updated }, { status: 200 });
}
