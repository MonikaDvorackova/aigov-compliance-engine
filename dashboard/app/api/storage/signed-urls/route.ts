import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SignedUrlsResponse = {
  ok: boolean;
  runId?: string;
  expiresIn?: number;
  urls?: {
    packZip?: string | null;
    auditJson?: string | null;
    evidenceJson?: string | null;
  };
  error?: string;
  message?: string;
};

function qp(req: Request, key: string): string | null {
  const u = new URL(req.url);
  const v = u.searchParams.get(key);
  return v && v.trim() ? v.trim() : null;
}

export async function GET(req: Request) {
  const runId = qp(req, "runId");
  if (!runId) {
    return NextResponse.json<SignedUrlsResponse>(
      { ok: false, error: "bad_request", message: "Missing runId query parameter." },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return NextResponse.json<SignedUrlsResponse>(
      { ok: false, error: "auth_error", message: userErr.message },
      { status: 401 }
    );
  }

  if (!user) {
    return NextResponse.json<SignedUrlsResponse>(
      { ok: false, error: "unauthorized", message: "Not signed in." },
      { status: 401 }
    );
  }

  // 10 minutes
  const expiresIn = 600;

  const packPath = `${runId}.zip`;
  const auditPath = `${runId}.json`;
  const evidencePath = `${runId}.json`;

  const [packRes, auditRes, evidenceRes] = await Promise.all([
    supabase.storage.from("packs").createSignedUrl(packPath, expiresIn),
    supabase.storage.from("audit").createSignedUrl(auditPath, expiresIn),
    supabase.storage.from("evidence").createSignedUrl(evidencePath, expiresIn),
  ]);

  const packZip = packRes?.data?.signedUrl ?? null;
  const auditJson = auditRes?.data?.signedUrl ?? null;
  const evidenceJson = evidenceRes?.data?.signedUrl ?? null;

  const anyErr = packRes.error || auditRes.error || evidenceRes.error;

  if (anyErr) {
    const msg =
      packRes.error?.message ||
      auditRes.error?.message ||
      evidenceRes.error?.message ||
      "Failed to create one or more signed URLs.";

    return NextResponse.json<SignedUrlsResponse>(
      {
        ok: false,
        error: "storage_error",
        message: msg,
        runId,
        expiresIn,
        urls: { packZip, auditJson, evidenceJson },
      },
      { status: 500 }
    );
  }

  return NextResponse.json<SignedUrlsResponse>(
    {
      ok: true,
      runId,
      expiresIn,
      urls: { packZip, auditJson, evidenceJson },
    },
    { status: 200 }
  );
}
