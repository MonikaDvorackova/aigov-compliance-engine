import React from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ComplianceReviewPanel,
  ComplianceReviewUnavailable,
} from "@/app/components/ComplianceReviewPanel";
import { fetchComplianceSummary } from "@/lib/server/fetchComplianceSummary";

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

function shortId(v: string) {
  const s = (v ?? "").trim();
  if (!s) return "—";
  if (s.length <= 18) return s;
  return `${s.slice(0, 10)}…${s.slice(-6)}`;
}

function surfaceCardStyle(): React.CSSProperties {
  return {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.02)",
    padding: 14,
  };
}

function sectionTitleStyle(): React.CSSProperties {
  return {
    fontWeight: 750,
    marginBottom: 10,
    letterSpacing: "-0.01em",
  };
}

function sectionKickerStyle(): React.CSSProperties {
  return {
    fontSize: 12,
    opacity: 0.62,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginBottom: 8,
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

function LabelValue({
  label,
  value,
  mono = false,
  borderTop = true,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  borderTop?: boolean;
}) {
  return (
    <div style={{ ...kvRowStyle(), borderTop: borderTop ? kvRowStyle().borderTop : "none" }}>
      <div style={kvKeyStyle()}>{label}</div>
      <div style={{ ...kvValStyle(), ...(mono ? monoStyle() : {}) }}>{value}</div>
    </div>
  );
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
  const kind: "neutral" | "ok" | "warn" = s === "valid" ? "ok" : s === "invalid" ? "warn" : "neutral";
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
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.16)",
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
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "transparent",
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
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
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
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "transparent",
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
    .select("id,created_at,mode,status,policy_version,bundle_sha256,evidence_sha256,report_sha256,evidence_source,closed_at")
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

  const compliance = await fetchComplianceSummary(r.id);

  const isRunning = !hasClosed;
  const titleId = shortId(r.id);

  return (
    <div>
      <div style={{ marginTop: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <a
              href="/runs"
              style={{
                fontSize: 13,
                opacity: 0.8,
                textDecoration: "underline",
                textUnderlineOffset: 4,
                textDecorationColor: "rgba(29,78,216,0.65)",
                color: "rgba(255,255,255,0.9)",
              }}
            >
              Runs
            </a>
            <span style={{ opacity: 0.5 }}>／</span>
            <span style={{ ...monoStyle(), opacity: 0.92 }}>{titleId}</span>
          </div>

          <a
            href="/runs"
            style={{
              fontSize: 13,
              opacity: 0.78,
              textDecoration: "underline",
              textUnderlineOffset: 4,
              textDecorationColor: "rgba(29,78,216,0.65)",
              color: "rgba(255,255,255,0.9)",
            }}
          >
            Back to list
          </a>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={sectionKickerStyle()}>Run</div>
              <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{titleId}</h1>
              <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <ModeBadge mode={r.mode} />
                <StatusBadge status={r.status} />
                {isRunning ? <span style={badgeStyle("neutral")}>open</span> : <span style={badgeStyle("neutral")}>closed</span>}
                <span style={badgeStyle(prodGateOk ? "ok" : "warn")}>{prodGateOk ? "prod gate: ok" : "prod gate: attention"}</span>
              </div>
            </div>

            <div style={{ display: "grid", justifyItems: "end", gap: 4 }}>
              <div style={{ fontSize: 12, opacity: 0.72 }}>Created: {fmt(r.created_at) || "—"}</div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>Closed: {fmt(r.closed_at) || "—"}</div>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.9fr) minmax(0, 1fr)",
            gap: 14,
            alignItems: "start",
          }}
        >
          <div style={{ minWidth: 0, display: "grid", gap: 14 }}>
            <div>
              <div style={sectionKickerStyle()}>Compliance state</div>
              {compliance.available ? (
                <ComplianceReviewPanel runId={r.id} rawBody={compliance.body} storedBundleSha256={r.bundle_sha256} />
              ) : (
                <ComplianceReviewUnavailable reason={compliance.reason} detail={compliance.detail} />
              )}
            </div>

            <div style={surfaceCardStyle()}>
              <div style={sectionTitleStyle()}>Artifacts & downloads</div>
              <div style={{ fontSize: 13, opacity: 0.7, marginTop: -6, marginBottom: 10, lineHeight: 1.45 }}>
                Raw endpoints require authentication. Signed URLs expire.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <a
                  href={`/api/raw/audit/${encodeURIComponent(r.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "block",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "transparent",
                    color: "rgba(255,255,255,0.9)",
                    textDecoration: "underline",
                    textUnderlineOffset: 4,
                    textDecorationColor: "rgba(29,78,216,0.65)",
                    fontSize: 13,
                  }}
                >
                  Open audit manifest (raw)
                </a>
                <a
                  href={`/api/raw/evidence/${encodeURIComponent(r.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "block",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "transparent",
                    color: "rgba(255,255,255,0.9)",
                    textDecoration: "underline",
                    textUnderlineOffset: 4,
                    textDecorationColor: "rgba(29,78,216,0.65)",
                    fontSize: 13,
                  }}
                >
                  Open evidence JSON (raw)
                </a>
                <a
                  href={`/api/bundle/${encodeURIComponent(r.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "block",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "transparent",
                    color: "rgba(255,255,255,0.9)",
                    textDecoration: "underline",
                    textUnderlineOffset: 4,
                    textDecorationColor: "rgba(29,78,216,0.65)",
                    fontSize: 13,
                  }}
                >
                  Download pack (raw)
                </a>
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "transparent",
                    fontSize: 13,
                    opacity: 0.78,
                  }}
                >
                  Run ID<br />
                  <span style={monoStyle()}>{titleId}</span>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, opacity: 0.62, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Signed URLs (10 min)
                </div>

                {!signed.ok ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "transparent",
                      fontSize: 13,
                      opacity: 0.9,
                    }}
                  >
                    Downloads are currently unavailable.
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>{signed.message ?? "Storage signed URLs failed."}</div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <DownloadLink label="Pack zip" href={signed.urls?.packZip} />
                    <DownloadLink label="Audit JSON" href={signed.urls?.auditJson} />
                    <DownloadLink label="Evidence JSON" href={signed.urls?.evidenceJson} />
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Links expire in {signed.expiresIn ?? 600}s.</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ minWidth: 0, display: "grid", gap: 14 }}>
            <div style={surfaceCardStyle()}>
              <div style={sectionTitleStyle()}>Run metadata</div>

              <div style={{ display: "grid", gap: 0 }}>
                <LabelValue label="ID" value={r.id} mono borderTop={false} />
                <LabelValue label="Created" value={fmt(r.created_at) || "—"} />
                <LabelValue label="Closed at" value={fmt(r.closed_at) || "—"} />
                <LabelValue label="Mode" value={r.mode ?? "—"} />
                <LabelValue label="Status" value={r.status ?? "—"} />
                <LabelValue label="Policy version" value={r.policy_version ?? "—"} />
                <LabelValue label="Evidence source" value={r.evidence_source ?? "—"} />
              </div>
            </div>

            <div style={surfaceCardStyle()}>
              <div style={sectionTitleStyle()}>Integrity checks</div>

              <div style={{ display: "grid", gap: 10 }}>
                <CheckRow label="Mode allowed" ok={isProd || isCi} detail={isProd || isCi ? "ci or prod" : "unexpected"} />
                <CheckRow label="Bundle hash present" ok={hasBundle} detail={hasBundle ? "present" : "missing"} />
                <CheckRow label="Evidence hash present" ok={hasEvidence} detail={hasEvidence ? "present" : "missing"} />
                <CheckRow label="Report hash present" ok={hasReport} detail={hasReport ? "present" : "missing"} />
                <CheckRow label="Closed timestamp" ok={hasClosed} detail={hasClosed ? "set" : "missing"} />
                <CheckRow label="Prod gate" ok={prodGateOk} detail={prodGateOk ? "ok" : "requires status=valid"} />
              </div>
            </div>

            <div style={surfaceCardStyle()}>
              <div style={sectionTitleStyle()}>Hashes (short)</div>
              {hashBlock("Bundle SHA256", r.bundle_sha256 ? shortHash(r.bundle_sha256) : null)}
              {hashBlock("Evidence SHA256", r.evidence_sha256 ? shortHash(r.evidence_sha256) : null)}
              {hashBlock("Report SHA256", r.report_sha256 ? shortHash(r.report_sha256) : null)}
              <div style={{ marginTop: 12, opacity: 0.62, fontSize: 12, lineHeight: 1.45 }}>
                Full hashes are available in the audit JSON.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}