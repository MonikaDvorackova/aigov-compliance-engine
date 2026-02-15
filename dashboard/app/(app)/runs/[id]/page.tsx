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
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function norm(v: string | null) {
  return (v ?? "").trim().toLowerCase();
}

function shortHash(v: string | null) {
  if (!v) return "";
  if (v.length <= 14) return v;
  return `${v.slice(0, 10)}…${v.slice(-4)}`;
}

function surfaceCardStyle(): React.CSSProperties {
  return {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.03)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
    padding: 18,
  };
}

function sectionTitleStyle(): React.CSSProperties {
  return {
    fontWeight: 750,
    marginBottom: 10,
    letterSpacing: "-0.01em",
  };
}

function kvRowStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "160px 1fr",
    gap: 10,
    alignItems: "baseline",
    padding: "8px 0",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  };
}

function kvKeyStyle(): React.CSSProperties {
  return {
    fontSize: 13,
    opacity: 0.72,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
}

function kvValStyle(): React.CSSProperties {
  return {
    fontSize: 14,
    opacity: 0.92,
    wordBreak: "break-word",
  };
}

function monoStyle(): React.CSSProperties {
  return {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    wordBreak: "break-all",
    opacity: 0.92,
  };
}

function badgeStyle(kind: "neutral" | "ok" | "warn") {
  const border =
    kind === "ok"
      ? "1px solid rgba(255,255,255,0.28)"
      : kind === "warn"
      ? "1px solid rgba(255,255,255,0.34)"
      : "1px solid rgba(255,255,255,0.18)";

  const bg =
    kind === "ok"
      ? "rgba(255,255,255,0.09)"
      : kind === "warn"
      ? "rgba(255,255,255,0.11)"
      : "rgba(255,255,255,0.06)";

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 10px",
    borderRadius: 999,
    border,
    background: bg,
    fontSize: 12,
    lineHeight: "18px",
    whiteSpace: "nowrap" as const,
  };
}

function ModeBadge({ mode }: { mode: string | null }) {
  const m = norm(mode);
  const kind: "neutral" | "ok" | "warn" = m === "prod" ? "warn" : "neutral";
  const label = m ? m : "—";
  return <span style={badgeStyle(kind)}>{label}</span>;
}

function StatusBadge({ status }: { status: string | null }) {
  const s = norm(status);
  const kind: "neutral" | "ok" | "warn" =
    s === "valid" ? "ok" : s === "invalid" ? "warn" : "neutral";
  const label = s ? s : "—";
  return <span style={badgeStyle(kind)}>{label}</span>;
}

function hashBlock(label: string, value: string | null) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          padding: 12,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(0,0,0,0.18)",
          ...monoStyle(),
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function checkRowStyle(ok: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 14,
    border: ok ? "1px solid rgba(255,255,255,0.16)" : "1px solid rgba(255,255,255,0.28)",
    background: ok ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.09)",
    fontSize: 13,
  };
}

function CheckRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div style={checkRowStyle(ok)}>
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div style={{ opacity: 0.85 }}>{detail}</div>
    </div>
  );
}

function DownloadLink({ label, href }: { label: string; href: string | null | undefined }) {
  if (!href) {
    return (
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)",
          opacity: 0.78,
          fontSize: 13,
        }}
      >
        {label}: unavailable
      </div>
    );
  }

  return (
    <a
      href={href}
      style={{
        display: "block",
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(255,255,255,0.04)",
        textDecoration: "underline",
        textUnderlineOffset: 4,
        textDecorationColor: "rgba(29,78,216,0.65)",
        fontSize: 13,
        color: "rgba(255,255,255,0.9)",
      }}
      target="_blank"
      rel="noreferrer"
    >
      {label}
    </a>
  );
}

async function fetchSignedUrls(runId: string): Promise<SignedUrlsResponse> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  const path = `/api/storage/signed-urls?runId=${encodeURIComponent(runId)}`;

  if (site) {
    const res = await fetch(`${site}${path}`, { cache: "no-store" });
    return (await res.json()) as SignedUrlsResponse;
  }

  const res = await fetch(path, { cache: "no-store" });
  return (await res.json()) as SignedUrlsResponse;
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
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background:
          "radial-gradient(1100px 520px at 50% 8%, rgba(255,255,255,0.08), rgba(0,0,0,0))",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.01em" }}>Run detail</h1>
            <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <ModeBadge mode={r.mode} />
              <StatusBadge status={r.status} />
            </div>
          </div>

          <a
            href="/runs"
            style={{
              fontSize: 14,
              opacity: 0.82,
              textDecoration: "underline",
              textUnderlineOffset: 4,
              textDecorationColor: "rgba(29,78,216,0.65)",
            }}
          >
            Back to runs
          </a>
        </div>

        <div style={{ marginTop: 16, ...surfaceCardStyle() }}>
          <div style={{ display: "grid", gap: 0 }}>
            <div style={{ ...kvRowStyle(), borderTop: "none" }}>
              <div style={kvKeyStyle()}>ID</div>
              <div style={{ ...kvValStyle(), ...monoStyle() }}>{r.id}</div>
            </div>

            <div style={kvRowStyle()}>
              <div style={kvKeyStyle()}>Created</div>
              <div style={kvValStyle()}>{fmt(r.created_at)}</div>
            </div>

            <div style={kvRowStyle()}>
              <div style={kvKeyStyle()}>Mode</div>
              <div style={kvValStyle()}>{r.mode ?? "—"}</div>
            </div>

            <div style={kvRowStyle()}>
              <div style={kvKeyStyle()}>Status</div>
              <div style={kvValStyle()}>{r.status ?? "—"}</div>
            </div>

            <div style={kvRowStyle()}>
              <div style={kvKeyStyle()}>Policy version</div>
              <div style={kvValStyle()}>{r.policy_version ?? "—"}</div>
            </div>

            <div style={kvRowStyle()}>
              <div style={kvKeyStyle()}>Evidence source</div>
              <div style={kvValStyle()}>{r.evidence_source ?? "—"}</div>
            </div>

            <div style={kvRowStyle()}>
              <div style={kvKeyStyle()}>Closed at</div>
              <div style={kvValStyle()}>{fmt(r.closed_at)}</div>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={sectionTitleStyle()}>Integrity summary</div>

            <div style={{ display: "grid", gap: 10 }}>
              <CheckRow label="Mode allowed" ok={isProd || isCi} detail={isProd || isCi ? "ci or prod" : "unexpected"} />
              <CheckRow label="Bundle hash present" ok={hasBundle} detail={hasBundle ? "present" : "missing"} />
              <CheckRow label="Evidence hash present" ok={hasEvidence} detail={hasEvidence ? "present" : "missing"} />
              <CheckRow label="Report hash present" ok={hasReport} detail={hasReport ? "present" : "missing"} />
              <CheckRow label="Closed timestamp" ok={hasClosed} detail={hasClosed ? "set" : "missing"} />
              <CheckRow label="Prod gate" ok={prodGateOk} detail={prodGateOk ? "ok" : "requires status=valid"} />
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={sectionTitleStyle()}>Downloads</div>

            {!signed.ok ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.04)",
                  fontSize: 13,
                  opacity: 0.9,
                }}
              >
                Downloads are currently unavailable.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <DownloadLink label="Pack zip" href={signed.urls?.packZip} />
                <DownloadLink label="Audit JSON" href={signed.urls?.auditJson} />
                <DownloadLink label="Evidence JSON" href={signed.urls?.evidenceJson} />
                <div style={{ fontSize: 12, opacity: 0.7 }}>Links expire in {signed.expiresIn ?? 600}s.</div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={sectionTitleStyle()}>Hashes</div>
            {hashBlock("Bundle SHA256", r.bundle_sha256 ? shortHash(r.bundle_sha256) : null)}
            {hashBlock("Evidence SHA256", r.evidence_sha256 ? shortHash(r.evidence_sha256) : null)}
            {hashBlock("Report SHA256", r.report_sha256 ? shortHash(r.report_sha256) : null)}
            <div style={{ marginTop: 12, opacity: 0.6, fontSize: 12 }}>
              Full hashes are available in the audit JSON.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
