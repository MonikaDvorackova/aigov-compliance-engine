import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRunTeamAccess } from "@/lib/console/runAccess.server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function repoRootFromCwd() {
  return process.cwd();
}

function localEvidencePath(runId: string) {
  const root = repoRootFromCwd();
  return path.join(root, "docs", "evidence", `${runId}.json`);
}

function contentDisposition(name: string) {
  return `inline; filename="${name}"`;
}

function respondJsonText(jsonText: string, filename: string) {
  return new NextResponse(jsonText, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const runId = (id ?? "").trim();

  if (!runId) {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "Missing run id." },
      { status: 400 }
    );
  }

  const authz = await requireRunTeamAccess(runId);
  if (!authz.ok) return authz.response;

  const supabase = await createSupabaseServerClient();

  const filename = `${runId}.json`;

  const p = localEvidencePath(runId);
  if (fs.existsSync(p)) {
    const txt = fs.readFileSync(p, "utf8");
    return respondJsonText(txt, filename);
  }

  const { data, error } = await supabase.storage.from("evidence").download(filename);

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "Evidence json not found." },
      { status: 404 }
    );
  }

  const text = await data.text();
  return respondJsonText(text, filename);
}
