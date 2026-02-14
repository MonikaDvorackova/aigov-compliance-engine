import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function filenameFor(runId: string) {
  return `${runId}.zip`;
}

function contentDisposition(name: string) {
  return `attachment; filename="${name}"`;
}

function repoRootFromCwd() {
  return process.cwd();
}

function localPackPath(runId: string) {
  const root = repoRootFromCwd();
  return path.join(root, "docs", "packs", filenameFor(runId));
}

function streamFile(filePath: string, downloadName: string) {
  const stat = fs.statSync(filePath);

  const stream = fs.createReadStream(filePath);

  return new NextResponse(stream as any, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(stat.size),
      "Content-Disposition": contentDisposition(downloadName),
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

  const name = filenameFor(runId);

  const packPath = localPackPath(runId);
  if (fs.existsSync(packPath)) {
    return streamFile(packPath, name);
  }

  const { data, error } = await supabase.storage.from("packs").download(name);

  if (error || !data) {
    return NextResponse.json(
      {
        ok: false,
        error: "not_found",
        message:
          "Bundle not found locally and not present in Supabase Storage bucket packs.",
      },
      { status: 404 }
    );
  }

  const arrayBuffer = await data.arrayBuffer();

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(name),
      "Cache-Control": "no-store",
    },
  });
}
