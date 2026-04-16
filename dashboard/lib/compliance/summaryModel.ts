/**
 * Normalized compliance summary from the audit service (and dashboard fetch envelope).
 *
 * Public API: `normalizeComplianceSummaryInput` only — takes `fetchComplianceSummary` result
 * and returns `{ model, auditRaw }`. UI reads `model`; `auditRaw` is optional opaque bytes for raw JSON display.
 */

import type { ComplianceSummaryResult } from "@/lib/server/fetchComplianceSummary";

// ——— Normalized success (strict where the contract always supplies an object; null only when API omits leaf values) ———

export type ComplianceRiskRow = {
  risk_id: string | null;
  risk_class: string | null;
  status: string | null;
  severity: number | null;
  likelihood: number | null;
  latest_review: { decision: string | null; reviewer: string | null } | null;
};

export type ComplianceRisksBlock = {
  total_risks: number;
  by_risk_class: Record<string, number>;
  risks: ComplianceRiskRow[];
};

export type ComplianceIdentifiers = {
  ai_system_id: string | null;
  dataset_id: string | null;
  model_version_id: string | null;
  primary_risk_id: string | null;
  risk_ids: string[];
};

export type CompliancePromotionBlock = {
  state: string | null;
  reason: string | null;
  model_promoted_present: boolean;
};

export type ComplianceModelBlock = {
  model_version_id: string | null;
  evaluation_passed: boolean | null;
  promotion: CompliancePromotionBlock;
};

export type ComplianceApprovalBlock = {
  scope: string | null;
  approver: string | null;
  approved_at: string | null;
  risk_review_decision: string | null;
  human_approval_decision: string | null;
  approved_human_event_id: string | null;
};

export type ComplianceEvidenceBlock = {
  events_total: number | null;
  latest_event_ts_utc: string | null;
  bundle_hash: string | null;
  bundle_generated_at: string | null;
};

/** Normalized `current_state` — nested objects always present (empty defaults if API omitted blocks). */
export type ComplianceCurrentStateNormalized = {
  schema_version: string;
  run_id: string | null;
  identifiers: ComplianceIdentifiers;
  model: ComplianceModelBlock;
  approval: ComplianceApprovalBlock;
  evidence: ComplianceEvidenceBlock;
  risks: ComplianceRisksBlock;
};

/** Successful audit summary after normalization. */
export type ComplianceSummaryOk = {
  schema_version: string;
  policy_version: string | null;
  run_id: string | null;
  current_state: ComplianceCurrentStateNormalized;
};

/** Audit service returned ok: false. */
export type ComplianceSummaryErr = {
  schema_version: string | null;
  policy_version: string | null;
  error: string;
};

/** Discriminated union: dashboard fetch, audit wire success, audit wire error, or unparseable payload. */
export type ComplianceSummaryModel =
  | { readonly kind: "no_payload"; readonly reason: "no_audit_url" | "fetch_failed"; readonly detail?: string }
  | { readonly kind: "ok"; readonly summary: ComplianceSummaryOk }
  | { readonly kind: "audit_error"; readonly err: ComplianceSummaryErr }
  | { readonly kind: "invalid"; readonly reason: string };

/** Result of normalizing the dashboard compliance fetch (model + optional raw body for debugging). */
export type ComplianceSummaryBundle = {
  readonly model: ComplianceSummaryModel;
  /** Set only when the transport returned a JSON body (same reference passed to the normalizer). */
  readonly auditRaw: unknown | undefined;
};

// ——— Wire helpers (defensive) ———

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function readNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function readBooleanOrNull(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

function readStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function readRiskRows(v: unknown): ComplianceRiskRow[] {
  if (!Array.isArray(v)) return [];
  return v.map((item): ComplianceRiskRow => {
    if (!isRecord(item)) {
      return {
        risk_id: null,
        risk_class: null,
        status: null,
        severity: null,
        likelihood: null,
        latest_review: null,
      };
    }
    const lr = item.latest_review;
    let latest_review: ComplianceRiskRow["latest_review"] = null;
    if (isRecord(lr)) {
      latest_review = {
        decision: readString(lr.decision),
        reviewer: readString(lr.reviewer),
      };
    }
    return {
      risk_id: readString(item.risk_id),
      risk_class: readString(item.risk_class),
      status: readString(item.status),
      severity: readNumberOrNull(item.severity),
      likelihood: readNumberOrNull(item.likelihood),
      latest_review,
    };
  });
}

function readByRiskClass(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) {
    const num = readNumberOrNull(n);
    if (num != null) out[k] = num;
  }
  return out;
}

function normalizeIdentifiers(raw: unknown): ComplianceIdentifiers {
  if (!isRecord(raw)) {
    return {
      ai_system_id: null,
      dataset_id: null,
      model_version_id: null,
      primary_risk_id: null,
      risk_ids: [],
    };
  }
  return {
    ai_system_id: readString(raw.ai_system_id),
    dataset_id: readString(raw.dataset_id),
    model_version_id: readString(raw.model_version_id),
    primary_risk_id: readString(raw.primary_risk_id),
    risk_ids: readStringArray(raw.risk_ids),
  };
}

function normalizePromotion(raw: unknown): CompliancePromotionBlock {
  if (!isRecord(raw)) {
    return { state: null, reason: null, model_promoted_present: false };
  }
  return {
    state: readString(raw.state),
    reason: readString(raw.reason),
    model_promoted_present: raw.model_promoted_present === true,
  };
}

function normalizeModelBlock(raw: unknown): ComplianceModelBlock {
  if (!isRecord(raw)) {
    return {
      model_version_id: null,
      evaluation_passed: null,
      promotion: normalizePromotion(undefined),
    };
  }
  return {
    model_version_id: readString(raw.model_version_id),
    evaluation_passed: readBooleanOrNull(raw.evaluation_passed),
    promotion: normalizePromotion(raw.promotion),
  };
}

function normalizeApproval(raw: unknown): ComplianceApprovalBlock {
  if (!isRecord(raw)) {
    return {
      scope: null,
      approver: null,
      approved_at: null,
      risk_review_decision: null,
      human_approval_decision: null,
      approved_human_event_id: null,
    };
  }
  return {
    scope: readString(raw.scope),
    approver: readString(raw.approver),
    approved_at: readString(raw.approved_at),
    risk_review_decision: readString(raw.risk_review_decision),
    human_approval_decision: readString(raw.human_approval_decision),
    approved_human_event_id: readString(raw.approved_human_event_id),
  };
}

function normalizeEvidence(raw: unknown): ComplianceEvidenceBlock {
  if (!isRecord(raw)) {
    return {
      events_total: null,
      latest_event_ts_utc: null,
      bundle_hash: null,
      bundle_generated_at: null,
    };
  }
  return {
    events_total: readNumberOrNull(raw.events_total),
    latest_event_ts_utc: readString(raw.latest_event_ts_utc),
    bundle_hash: readString(raw.bundle_hash),
    bundle_generated_at: readString(raw.bundle_generated_at),
  };
}

function normalizeRisksBlock(raw: unknown): ComplianceRisksBlock {
  if (!isRecord(raw)) {
    return { total_risks: 0, by_risk_class: {}, risks: [] };
  }
  const rows = readRiskRows(raw.risks);
  const total = readNumberOrNull(raw.total_risks) ?? rows.length;
  return {
    total_risks: total,
    by_risk_class: readByRiskClass(raw.by_risk_class),
    risks: rows,
  };
}

function normalizeCurrentState(raw: unknown): ComplianceCurrentStateNormalized | null {
  if (!isRecord(raw)) return null;
  return {
    schema_version: readString(raw.schema_version) ?? "aigov.compliance_current_state.v2",
    run_id: readString(raw.run_id),
    identifiers: normalizeIdentifiers(raw.identifiers),
    model: normalizeModelBlock(raw.model),
    approval: normalizeApproval(raw.approval),
    evidence: normalizeEvidence(raw.evidence),
    risks: normalizeRisksBlock(raw.risks),
  };
}

/** Normalize raw JSON from GET /compliance-summary (body only). */
function normalizeAuditComplianceBody(raw: unknown): ComplianceSummaryModel {
  if (!isRecord(raw)) {
    return { kind: "invalid", reason: "Response is not a JSON object." };
  }

  if (raw.ok === false) {
    const err: ComplianceSummaryErr = {
      schema_version: readString(raw.schema_version),
      policy_version: readString(raw.policy_version),
      error: readString(raw.error) ?? "unknown error",
    };
    return { kind: "audit_error", err };
  }

  if (raw.ok !== true) {
    return { kind: "invalid", reason: "Missing or invalid ok flag on compliance summary envelope." };
  }

  const current = normalizeCurrentState(raw.current_state);
  if (!current) {
    return { kind: "invalid", reason: "Successful envelope missing current_state object." };
  }

  const summary: ComplianceSummaryOk = {
    schema_version: readString(raw.schema_version) ?? "aigov.compliance_summary.v2",
    policy_version: readString(raw.policy_version),
    run_id: readString(raw.run_id),
    current_state: current,
  };

  return { kind: "ok", summary };
}

/**
 * Single public normalizer: dashboard `fetchComplianceSummary` result → model union + optional raw body.
 * Does not expose wire-only normalization; body parsing stays internal.
 */
export function normalizeComplianceSummaryInput(result: ComplianceSummaryResult): ComplianceSummaryBundle {
  if (!result.available) {
    return {
      model: { kind: "no_payload", reason: result.reason, detail: result.detail },
      auditRaw: undefined,
    };
  }
  return {
    model: normalizeAuditComplianceBody(result.body),
    auditRaw: result.body,
  };
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Pretty-print for technical raw block (not parsing). */
export function formatComplianceRawPayload(raw: unknown): string {
  try {
    const s = JSON.stringify(raw, null, 2);
    if (s.length > 12000) {
      return `${s.slice(0, 12000)}\n… truncated`;
    }
    return s;
  } catch {
    return String(raw);
  }
}
