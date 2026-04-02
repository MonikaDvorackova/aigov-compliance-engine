import React from "react";

type ComplianceSummaryOk = {
  ok: true;
  schema_version?: string;
  policy_version?: string;
  run_id?: string;
  current_state?: ComplianceCurrentState;
};

type ComplianceSummaryErr = {
  ok: false;
  schema_version?: string;
  policy_version?: string;
  run_id?: string;
  error?: string;
};

type ComplianceCurrentState = {
  schema_version?: string;
  run_id?: string;
  identifiers?: {
    ai_system_id?: string | null;
    dataset_id?: string | null;
    model_version_id?: string | null;
    primary_risk_id?: string | null;
    risk_ids?: string[];
  };
  model?: {
    model_version_id?: string | null;
    evaluation_passed?: boolean | null;
    promotion?: {
      state?: string;
      reason?: string | null;
      model_promoted_present?: boolean;
    };
  };
  risks?: {
    total_risks?: number;
    by_risk_class?: Record<string, number>;
    risks?: Array<{
      risk_id?: string;
      risk_class?: string | null;
      status?: string | null;
      severity?: number | null;
      likelihood?: number | null;
      latest_review?: { decision?: string | null; reviewer?: string | null } | null;
    }>;
  } | null;
  approval?: {
    scope?: string | null;
    approver?: string | null;
    approved_at?: string | null;
    risk_review_decision?: string | null;
    human_approval_decision?: string | null;
    approved_human_event_id?: string | null;
  };
  evidence?: {
    events_total?: number;
    latest_event_ts_utc?: string | null;
    bundle_hash?: string | null;
    bundle_generated_at?: string | null;
  };
};

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

function artifactLinkStyle(): React.CSSProperties {
  return {
    display: "inline-block",
    marginRight: 12,
    marginBottom: 6,
    fontSize: 13,
    textDecoration: "underline",
    textUnderlineOffset: 4,
    textDecorationColor: "rgba(29,78,216,0.65)",
    color: "rgba(255,255,255,0.9)",
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseSummary(body: unknown): ComplianceSummaryOk | ComplianceSummaryErr | null {
  if (!isRecord(body)) return null;
  if (body.ok === true) return body as ComplianceSummaryOk;
  if (body.ok === false) return body as ComplianceSummaryErr;
  return null;
}

function RiskClassChips({
  byClass,
}: {
  byClass: Record<string, number> | undefined;
}) {
  const entries = byClass ? Object.entries(byClass) : [];
  if (entries.length === 0) {
    return <span style={{ opacity: 0.75 }}>—</span>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {entries.map(([k, n]) => (
        <span
          key={k}
          style={{
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.05)",
          }}
        >
          {k}: {n}
        </span>
      ))}
    </div>
  );
}

export function ComplianceReviewPanel({
  runId,
  rawBody,
  storedBundleSha256,
}: {
  runId: string;
  rawBody: unknown;
  storedBundleSha256: string | null;
}) {
  const parsed = parseSummary(rawBody);

  if (!parsed) {
    return (
      <div style={surfaceCardStyle()}>
        <div style={sectionTitleStyle()}>Compliance review (core summary)</div>
        <div style={{ fontSize: 14, opacity: 0.85 }}>
          Unexpected response shape from the audit service.
        </div>
      </div>
    );
  }

  if (!parsed.ok) {
    return (
      <div style={surfaceCardStyle()}>
        <div style={sectionTitleStyle()}>Compliance review (core summary)</div>
        <div style={{ fontSize: 14, opacity: 0.9 }}>
          <span style={{ opacity: 0.72 }}>Summary unavailable: </span>
          {parsed.error ?? "unknown error"}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
          Schema: {parsed.schema_version ?? "—"} · Policy: {parsed.policy_version ?? "—"}
        </div>
      </div>
    );
  }

  const cs = parsed.current_state as ComplianceCurrentState | undefined;
  if (!cs) {
    return (
      <div style={surfaceCardStyle()}>
        <div style={sectionTitleStyle()}>Compliance review (core summary)</div>
        <div style={{ fontSize: 14, opacity: 0.85 }}>Response missing current_state.</div>
      </div>
    );
  }

  const ids = cs.identifiers;
  const promo = cs.model?.promotion;
  const approval = cs.approval;
  const risks = cs.risks;
  const ev = cs.evidence;
  const coreHash = (ev?.bundle_hash ?? "").trim();
  const stored = (storedBundleSha256 ?? "").trim();
  const hashCompare =
    coreHash && stored
      ? coreHash === stored
        ? { ok: true as const, text: "Matches bundle hash stored with this run (ingest)." }
        : { ok: false as const, text: "Differs from bundle hash stored with this run — compare ledger vs ingest." }
      : null;

  return (
    <div style={surfaceCardStyle()}>
      <div style={sectionTitleStyle()}>Compliance review (core summary)</div>
      <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 14 }}>
        {parsed.schema_version ?? "aigov.compliance_summary.v2"} · inner{" "}
        {cs.schema_version ?? "aigov.compliance_current_state.v2"} · policy{" "}
        {parsed.policy_version ?? "—"}
      </div>

      <div style={{ ...kvRowStyle(), borderTop: "none" }}>
        <div style={kvKeyStyle()}>Identifiers</div>
        <div style={kvValStyle()}>
          <div style={monoStyle()}>ai_system_id: {ids?.ai_system_id ?? "—"}</div>
          <div style={{ ...monoStyle(), marginTop: 6 }}>dataset_id: {ids?.dataset_id ?? "—"}</div>
          <div style={{ ...monoStyle(), marginTop: 6 }}>model_version_id: {ids?.model_version_id ?? "—"}</div>
          <div style={{ ...monoStyle(), marginTop: 6 }}>primary_risk_id: {ids?.primary_risk_id ?? "—"}</div>
          <div style={{ ...monoStyle(), marginTop: 6 }}>
            risk_ids ({ids?.risk_ids?.length ?? 0}):{" "}
            {(ids?.risk_ids ?? []).length ? ids?.risk_ids?.join(", ") : "—"}
          </div>
        </div>
      </div>

      <div style={kvRowStyle()}>
        <div style={kvKeyStyle()}>Risk summary</div>
        <div style={kvValStyle()}>
          <div>Total: {risks?.total_risks ?? 0}</div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 6 }}>By class</div>
            <RiskClassChips byClass={risks?.by_risk_class} />
          </div>
        </div>
      </div>

      <div style={kvRowStyle()}>
        <div style={kvKeyStyle()}>Approval</div>
        <div style={kvValStyle()}>
          <div>scope: {approval?.scope ?? "—"}</div>
          <div style={{ marginTop: 6 }}>approver: {approval?.approver ?? "—"}</div>
          <div style={{ marginTop: 6 }}>approved_at: {approval?.approved_at ?? "—"}</div>
          <div style={{ marginTop: 6 }}>
            risk_review_decision: {approval?.risk_review_decision ?? "—"}
          </div>
          <div style={{ marginTop: 6 }}>
            human_approval_decision: {approval?.human_approval_decision ?? "—"}
          </div>
        </div>
      </div>

      <div style={kvRowStyle()}>
        <div style={kvKeyStyle()}>Promotion</div>
        <div style={kvValStyle()}>
          <div>state: {promo?.state ?? "—"}</div>
          <div style={{ marginTop: 6 }}>
            model_promoted_present: {promo?.model_promoted_present === true ? "true" : "false"}
          </div>
          <div style={{ marginTop: 6 }}>evaluation_passed: {String(cs.model?.evaluation_passed ?? "—")}</div>
        </div>
      </div>

      <div style={kvRowStyle()}>
        <div style={kvKeyStyle()}>Evidence / bundle</div>
        <div style={kvValStyle()}>
          <div>events_total: {ev?.events_total ?? "—"}</div>
          <div style={{ marginTop: 6 }}>latest_event_ts_utc: {ev?.latest_event_ts_utc ?? "—"}</div>
          <div style={{ marginTop: 10, ...monoStyle() }}>bundle_hash: {ev?.bundle_hash ?? "—"}</div>
          <div style={{ marginTop: 6 }}>bundle_generated_at: {ev?.bundle_generated_at ?? "—"}</div>
          {hashCompare && (
            <div
              style={{
                marginTop: 10,
                fontSize: 13,
                opacity: hashCompare.ok ? 0.85 : 0.95,
                color: hashCompare.ok ? "rgba(200,255,210,0.95)" : "rgba(255,210,160,0.95)",
              }}
            >
              {hashCompare.text}
            </div>
          )}
        </div>
      </div>

      <div style={kvRowStyle()}>
        <div style={kvKeyStyle()}>Artifacts</div>
        <div style={kvValStyle()}>
          <a href={`/api/raw/evidence/${encodeURIComponent(runId)}`} style={artifactLinkStyle()} target="_blank" rel="noreferrer">
            Evidence JSON
          </a>
          <a href={`/api/raw/audit/${encodeURIComponent(runId)}`} style={artifactLinkStyle()} target="_blank" rel="noreferrer">
            Audit manifest
          </a>
          <a href={`/api/bundle/${encodeURIComponent(runId)}`} style={artifactLinkStyle()} target="_blank" rel="noreferrer">
            Pack (zip)
          </a>
        </div>
      </div>
    </div>
  );
}

export function ComplianceReviewUnavailable({
  reason,
  detail,
}: {
  reason: "no_audit_url" | "fetch_failed";
  detail?: string;
}) {
  const msg =
    reason === "no_audit_url"
      ? "Set AIGOV_AUDIT_URL on the dashboard server (e.g. http://127.0.0.1:8088) to load the frozen compliance summary from the Rust audit service."
      : `Could not reach the audit service${detail ? `: ${detail}` : ""}.`;

  return (
    <div style={surfaceCardStyle()}>
      <div style={sectionTitleStyle()}>Compliance review (core summary)</div>
      <div style={{ fontSize: 14, opacity: 0.88 }}>{msg}</div>
    </div>
  );
}
