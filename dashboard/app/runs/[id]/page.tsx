import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RunRow = {
  id: string;
  created_at: string;
  mode: string | null;
  status: string | null;
  policy_version: string | null;
  bundle_sha256: string | null;
  evidence_sha256: string | null;
  report_sha256: string | null;
  evidence_source: string | null;
  closed_at: string | null;
};

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

function fmt(ts: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("cs-CZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hashBlock(label: string, value: string | null) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          padding: 12,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.15)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
          wordBreak: "break-all",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function norm(v: string | null) {
  return (v ?? "").trim().toLowerCase();
}

function checkRowStyle(ok: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 10px",
    borderRadius: 12,
    border: ok ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.28)",
    background: ok ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.09)",
    fontSize: 13,
  };
}

function CheckRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div style={checkRowStyle(ok)}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ opacity: 0.85 }}>{detail}</div>
    </div>
  );
}

async function fetchSignedUrls(runId: string): Promise<SignedUrlsResponse> {
  // Server component fetch to our server route
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/storage/signed-urls?runId=${encodeURIComponent(runId)}`, {
    cache: "no-store",
  });

  // If NEXT_PUBLIC_SITE_URL is not set (local dev), fallback to relative fetch
  if (!res.ok && !(process.env.NEXT_PUBLIC_SITE_URL ?? "")) {
    const res2 = await fetch(`/api/storage/signed-urls?runId=${encodeURIComponent(runId)}`, {
      cache: "no-store",
    });
    return (await res2.json()) as SignedUrlsResponse;
  }

  return (await res.json()) as SignedUrlsResponse;
}

function DownloadLink({ label, href }: { label: string; href: string | null | undefined }) {
  if (!href) {
    return (
      <div style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", opacity: 0.75 }}>
        {label}: unavailable
      </div>
    );
  }

  return (
    <a
      href={href}
      style={{
        display: "block",
        padding: "8px 10px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.18)",
        textDecoration: "underline",
      }}
      target="_blank"
      rel="noreferrer"
    >
      {label}
    </a>
  );
}

export default async function RunDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("runs")
    .select(
      "id,created_at,mode,status,policy_version,bundle_sha256,evidence_sha256,report_sha256,evidence_source,closed_at"
    )
    .eq("id", params.id)
    .single();

  if (error || !data) notFound();

  const r = data as RunRow;

  const mode = norm(r.mode);
  const status = norm(r.status);

  const isProd = mode === "prod";
  const isCi = mode === "ci";
  const isValid = status === "valid";

  const hasBundle = Boolean(r.bundle_sha256 && r.bundle_sha256.trim().length > 0);
  const hasEvidence = Boolean(r.evidence_sha256 && r.evidence_sha256.trim().length > 0);
  const hasReport = Boolean(r.report_sha256 && r.report_sha256.trim().length > 0);
  const hasClosed = Boolean(r.closed_at && String(r.closed_at).trim().length > 0);

  const prodGateOk = !isProd || isValid;

  const signed = await fetchSignedUrls(r.id);

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Run detail</h1>
        <a href="/runs" style={{ textDecoration: "underline", fontSize: 14 }}>
          Back to runs
        </a>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.14)",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div>
            <strong>ID:</strong>{" "}
            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{r.id}</span>
          </div>
          <div>
            <strong>Created:</strong> {fmt(r.created_at)}
          </div>
          <div>
            <strong>Mode:</strong> {r.mode ?? "—"}
          </div>
          <div>
            <strong>Status:</strong> {r.status ?? "—"}
          </div>
          <div>
            <strong>Policy version:</strong> {r.policy_version ?? "—"}
          </div>
          <div>
            <strong>Evidence source:</strong> {r.evidence_source ?? "—"}
          </div>
          <div>
            <strong>Closed at:</strong> {fmt(r.closed_at)}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Integrity summary</div>

          <div style={{ display: "grid", gap: 10 }}>
            <CheckRow
              label="Mode allowed"
              ok={isProd || isCi}
              detail={isProd || isCi ? "ci or prod" : `unexpected: ${r.mode ?? "—"}`}
            />
            <CheckRow label="Bundle hash present" ok={hasBundle} detail={hasBundle ? "present" : "missing"} />
            <CheckRow label="Evidence hash present" ok={hasEvidence} detail={hasEvidence ? "present" : "missing"} />
            <CheckRow label="Report hash present" ok={hasReport} detail={hasReport ? "present" : "missing"} />
            <CheckRow label="Closed timestamp" ok={hasClosed} detail={hasClosed ? "set" : "missing"} />
            <CheckRow label="Prod gate" ok={prodGateOk} detail={prodGateOk ? "ok" : "prod requires status=valid"} />
          </div>
        </div>

        {isProd && !isValid ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.20)",
              opacity: 0.95,
            }}
          >
            <strong>Warning:</strong> Prod run není valid. Tohle by v produkci nemělo projít.
          </div>
        ) : null}

        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Downloads</div>

          {!signed.ok ? (
            <div style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Signed URL error</div>
              <div style={{ opacity: 0.85, fontSize: 13 }}>{signed.message ?? signed.error ?? "Unknown error"}</div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <DownloadLink label="Pack zip" href={signed.urls?.packZip} />
              <DownloadLink label="Audit JSON" href={signed.urls?.auditJson} />
              <DownloadLink label="Evidence JSON" href={signed.urls?.evidenceJson} />
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Links expire in {signed.expiresIn ?? 600}s.
              </div>
            </div>
          )}
        </div>

        {hashBlock("Bundle SHA256", r.bundle_sha256)}
        {hashBlock("Evidence SHA256", r.evidence_sha256)}
        {hashBlock("Report SHA256", r.report_sha256)}
      </div>
    </main>
  );
}
