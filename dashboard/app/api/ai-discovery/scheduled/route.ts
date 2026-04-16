import { NextResponse } from "next/server";

import { runScheduledDiscoveryForAllEnabledTargets } from "@/lib/ai-discovery/runScheduledDiscovery.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cron entrypoint (e.g. Vercel Cron). Secured with `CRON_SECRET` or `AI_DISCOVERY_CRON_SECRET`:
 * `Authorization: Bearer <secret>`.
 *
 * Configure targets in `.govai/ai-discovery-schedule.json` (see example in repo).
 */
function cronSecret(): string | undefined {
  return process.env.CRON_SECRET?.trim() || process.env.AI_DISCOVERY_CRON_SECRET?.trim();
}

function authorize(request: Request): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!cronSecret()) {
    return NextResponse.json(
      { ok: false, error: "cron_not_configured", message: "Set CRON_SECRET or AI_DISCOVERY_CRON_SECRET." },
      { status: 503 }
    );
  }
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const { results } = await runScheduledDiscoveryForAllEnabledTargets();
    return NextResponse.json({ ok: true, results }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scheduled discovery failed.";
    console.error("[ai-discovery/scheduled]", e);
    return NextResponse.json({ ok: false, error: "scheduled_failed", message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
