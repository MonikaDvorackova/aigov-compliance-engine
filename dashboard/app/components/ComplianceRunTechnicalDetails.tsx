import type { CSSProperties } from "react";
import type { ComplianceSummaryModel } from "@/lib/compliance/summaryModel";
import { formatComplianceRawPayload, isNonEmptyString } from "@/lib/compliance/summaryModel";
import { DownloadLink, KeyValueRow } from "@/app/_ui/console/primitives";
import { monoStyle } from "@/app/_ui/console/surfaces";

export type RunLedgerRecord = {
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

export type RunSignedUrlsState = {
  ok: boolean;
  expiresIn?: number;
  urls?: {
    packZip?: string | null;
    auditJson?: string | null;
    evidenceJson?: string | null;
  };
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

function shortHash(v: string | null) {
  if (!v) return "";
  if (v.length <= 14) return v;
  return `${v.slice(0, 10)}…${v.slice(-4)}`;
}

const monoSm: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11,
  lineHeight: 1.55,
  color: "var(--govai-text-tertiary)",
};

type Props = {
  run: RunLedgerRecord;
  signed: RunSignedUrlsState;
  model: ComplianceSummaryModel;
  /** Opaque audit response body for raw JSON only; never parsed in this component. */
  auditRaw?: unknown;
};

/** Ledger, signed URLs, and audit/debug views — consumes the same normalized model as the decision panel. */
export function ComplianceRunTechnicalDetails({ run, signed, model, auditRaw }: Props) {
  return (
    <div className="govai-run-tech-block">
      <div className="govai-run-tech-heading">Ledger</div>
      <KeyValueRow label="Run ID" value={<span style={monoSm}>{run.id}</span>} borderTop={false} mono />
      <KeyValueRow label="Created" value={fmt(run.created_at) || "—"} />
      <KeyValueRow label="Closed" value={fmt(run.closed_at) || "—"} />
      <KeyValueRow label="Mode" value={run.mode ?? "—"} />
      <KeyValueRow label="Status" value={run.status ?? "—"} />
      <KeyValueRow label="Policy version" value={run.policy_version ?? "—"} />
      <KeyValueRow label="Evidence source" value={run.evidence_source ?? "—"} />

      <div className="govai-run-tech-heading">Ledger hashes</div>
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        <div style={monoSm}>
          <span style={{ color: "var(--govai-text-label)", marginRight: 8 }}>bundle</span>
          {shortHash(run.bundle_sha256) || "—"}
        </div>
        <div style={monoSm}>
          <span style={{ color: "var(--govai-text-label)", marginRight: 8 }}>evidence</span>
          {shortHash(run.evidence_sha256) || "—"}
        </div>
        <div style={monoSm}>
          <span style={{ color: "var(--govai-text-label)", marginRight: 8 }}>report</span>
          {shortHash(run.report_sha256) || "—"}
        </div>
      </div>

      <div className="govai-run-tech-heading">Signed downloads</div>
      {!signed.ok ? (
        <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--govai-text-tertiary)", lineHeight: 1.45 }}>
          Unavailable: {signed.message ?? "storage error"}
        </p>
      ) : (
        <>
          <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--govai-text-tertiary)" }}>
            Expires in {signed.expiresIn ?? 600}s
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <DownloadLink label="Pack zip" href={signed.urls?.packZip} />
            <DownloadLink label="Audit JSON" href={signed.urls?.auditJson} />
            <DownloadLink label="Evidence JSON" href={signed.urls?.evidenceJson} />
          </div>
        </>
      )}

      <div className="govai-run-tech-heading">Audit summary</div>
      <AuditSummaryTechnical run={run} model={model} auditRaw={auditRaw} />
    </div>
  );
}

function AuditSummaryTechnical({
  run,
  model,
  auditRaw,
}: {
  run: RunLedgerRecord;
  model: ComplianceSummaryModel;
  auditRaw?: unknown;
}) {
  if (model.kind === "no_payload") {
    return (
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--govai-text-tertiary)" }}>
        {model.reason === "no_audit_url"
          ? "No audit payload (AIGOV_AUDIT_URL not set)."
          : `Audit fetch failed${model.detail ? `: ${model.detail}` : ""}.`}
      </p>
    );
  }

  if (model.kind === "invalid") {
    return (
      <>
        <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--govai-text-secondary)" }}>{model.reason}</p>
        <div className="govai-run-tech-heading" style={{ marginTop: 10 }}>
          Raw payload
        </div>
        {auditRaw !== undefined ? (
          <pre className="govai-run-tech-pre">{formatComplianceRawPayload(auditRaw)}</pre>
        ) : (
          <p style={{ margin: 0, fontSize: 11, color: "var(--govai-text-tertiary)" }}>No body retained.</p>
        )}
      </>
    );
  }

  if (model.kind === "audit_error") {
    const { err } = model;
    return (
      <>
        <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--govai-text-secondary)" }}>Audit error: {err.error}</p>
        <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--govai-text-tertiary)" }}>
          Envelope: schema {err.schema_version ?? "—"} · policy {err.policy_version ?? "—"}
        </p>
        <div className="govai-run-tech-heading">Raw payload</div>
        {auditRaw !== undefined ? (
          <pre className="govai-run-tech-pre">{formatComplianceRawPayload(auditRaw)}</pre>
        ) : null}
      </>
    );
  }

  const { summary } = model;
  const cs = summary.current_state;
  const ids = cs.identifiers;
  const promo = cs.model.promotion;
  const approval = cs.approval;
  const ev = cs.evidence;
  const coreHash = (ev.bundle_hash ?? "").trim();
  const stored = (run.bundle_sha256 ?? "").trim();
  const hashCompare =
    coreHash && stored
      ? coreHash === stored
        ? { ok: true as const, text: "Audit bundle_hash matches ledger bundle_sha256." }
        : { ok: false as const, text: "Audit bundle_hash differs from ledger bundle_sha256." }
      : null;

  return (
    <>
      <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--govai-text-tertiary)", lineHeight: 1.45 }}>
        Envelope: {summary.schema_version} · current_state {cs.schema_version} · policy {summary.policy_version ?? "—"}
      </p>

      <div className="govai-run-tech-heading">Identifiers</div>
      <div style={{ ...monoStyle(), marginBottom: 12, fontSize: 12, lineHeight: 1.5 }}>
        <div>ai_system_id: {ids.ai_system_id ?? "—"}</div>
        <div style={{ marginTop: 4 }}>dataset_id: {ids.dataset_id ?? "—"}</div>
        <div style={{ marginTop: 4 }}>model_version_id: {ids.model_version_id ?? "—"}</div>
        <div style={{ marginTop: 4 }}>primary_risk_id: {ids.primary_risk_id ?? "—"}</div>
        <div style={{ marginTop: 4 }}>
          risk_ids ({ids.risk_ids.length}): {ids.risk_ids.length ? ids.risk_ids.join(", ") : "—"}
        </div>
      </div>

      <div className="govai-run-tech-heading">Hashes</div>
      <div style={{ ...monoStyle(), marginBottom: 12, fontSize: 12, lineHeight: 1.5 }}>
        <div>summary.bundle_hash: {ev.bundle_hash ?? "—"}</div>
        <div style={{ marginTop: 4 }}>ledger.bundle_sha256 (short): {shortHash(run.bundle_sha256) || "—"}</div>
        {hashCompare ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              fontWeight: 500,
              color: hashCompare.ok ? "rgba(110, 200, 160, 0.9)" : "rgba(220, 175, 95, 0.9)",
            }}
          >
            {hashCompare.text}
          </div>
        ) : null}
      </div>

      <div className="govai-run-tech-heading">Approval, promotion & evidence</div>
      <KeyValueRow
        label="Approval"
        value={
          <>
            <div>scope: {approval.scope ?? "—"}</div>
            <div style={{ marginTop: 6 }}>approver: {approval.approver ?? "—"}</div>
            <div style={{ marginTop: 6 }}>approved_at: {approval.approved_at ?? "—"}</div>
            <div style={{ marginTop: 6 }}>risk_review_decision: {approval.risk_review_decision ?? "—"}</div>
            <div style={{ marginTop: 6 }}>human_approval_decision: {approval.human_approval_decision ?? "—"}</div>
            {isNonEmptyString(approval.approved_human_event_id) ? (
              <div style={{ marginTop: 10, ...monoStyle() }}>approved_human_event_id: {approval.approved_human_event_id}</div>
            ) : null}
          </>
        }
      />
      <KeyValueRow
        label="Promotion"
        value={
          <>
            <div>state: {promo.state ?? "—"}</div>
            <div style={{ marginTop: 6 }}>reason: {promo.reason ?? "—"}</div>
            <div style={{ marginTop: 6 }}>model_promoted_present: {promo.model_promoted_present ? "true" : "false"}</div>
            <div style={{ marginTop: 6 }}>evaluation_passed: {String(cs.model.evaluation_passed)}</div>
            {cs.model.model_version_id ? (
              <div style={{ marginTop: 10, ...monoStyle() }}>model_version_id: {cs.model.model_version_id}</div>
            ) : null}
          </>
        }
      />
      <KeyValueRow
        label="Evidence"
        value={
          <>
            <div>events_total: {ev.events_total ?? "—"}</div>
            <div style={{ marginTop: 6 }}>latest_event_ts_utc: {ev.latest_event_ts_utc ?? "—"}</div>
            <div style={{ marginTop: 6 }}>bundle_generated_at: {ev.bundle_generated_at ?? "—"}</div>
          </>
        }
      />

      <div className="govai-run-tech-heading">Raw payload</div>
      {auditRaw !== undefined ? (
        <pre className="govai-run-tech-pre">{formatComplianceRawPayload(auditRaw)}</pre>
      ) : (
        <p style={{ margin: 0, fontSize: 11, color: "var(--govai-text-tertiary)" }}>No body retained.</p>
      )}
    </>
  );
}
