import { describe, expect, it } from "vitest";
import { complianceHeroDecision } from "./complianceHeroDecision";
import {
  approvalDisplay,
  evaluationDisplay,
  promotionDisplay,
} from "./complianceDisplay";
import {
  normalizeComplianceSummaryInput,
  type ComplianceApprovalBlock,
  type ComplianceCurrentStateNormalized,
  type ComplianceModelBlock,
  type CompliancePromotionBlock,
  type ComplianceSummaryModel,
} from "./summaryModel";
import type { ComplianceSummaryResult } from "@/lib/server/fetchComplianceSummary";

const MAX_EXPLANATION_LEN = 220;

function defaultCurrentState(): ComplianceCurrentStateNormalized {
  return {
    schema_version: "aigov.compliance_current_state.v2",
    run_id: null,
    identifiers: {
      ai_system_id: null,
      dataset_id: null,
      model_version_id: null,
      primary_risk_id: null,
      risk_ids: [],
    },
    model: {
      model_version_id: null,
      evaluation_passed: true,
      promotion: { state: "cleared", reason: null, model_promoted_present: false },
    },
    approval: {
      scope: null,
      approver: null,
      approved_at: null,
      risk_review_decision: null,
      human_approval_decision: "approved",
      approved_human_event_id: null,
    },
    evidence: {
      events_total: null,
      latest_event_ts_utc: null,
      bundle_hash: null,
      bundle_generated_at: null,
    },
    risks: { total_risks: 0, by_risk_class: {}, risks: [] },
  };
}

/**
 * Patches for {@link okModel} — explicit partials per block (avoids `T & Partial<T>` intersection bugs).
 */
type OkModelPatch = {
  schema_version?: string;
  run_id?: string | null;
  identifiers?: Partial<ComplianceCurrentStateNormalized["identifiers"]>;
  model?: {
    model_version_id?: string | null;
    evaluation_passed?: boolean | null;
    promotion?: Partial<CompliancePromotionBlock>;
  };
  approval?: Partial<ComplianceApprovalBlock>;
  evidence?: Partial<ComplianceCurrentStateNormalized["evidence"]>;
  risks?: Partial<ComplianceCurrentStateNormalized["risks"]>;
};

function okModel(patch: OkModelPatch = {}): ComplianceSummaryModel {
  const base = defaultCurrentState();
  const model: ComplianceModelBlock = {
    ...base.model,
    ...patch.model,
    promotion: {
      ...base.model.promotion,
      ...patch.model?.promotion,
    },
  };
  const approval: ComplianceApprovalBlock = { ...base.approval, ...patch.approval };
  const current_state: ComplianceCurrentStateNormalized = {
    ...base,
    schema_version: patch.schema_version ?? base.schema_version,
    run_id: patch.run_id ?? base.run_id,
    identifiers: { ...base.identifiers, ...patch.identifiers },
    model,
    approval,
    evidence: { ...base.evidence, ...patch.evidence },
    risks: {
      total_risks: patch.risks?.total_risks ?? base.risks.total_risks,
      by_risk_class: { ...base.risks.by_risk_class, ...patch.risks?.by_risk_class },
      risks: patch.risks?.risks ?? base.risks.risks,
    },
  };
  return {
    kind: "ok",
    summary: {
      schema_version: "aigov.compliance_summary.v2",
      policy_version: null,
      run_id: null,
      current_state,
    },
  };
}

function displaysFor(model: ComplianceSummaryModel) {
  if (model.kind !== "ok") {
    return null;
  }
  const cs = model.summary.current_state;
  return {
    evaluationDisplay: evaluationDisplay(cs.model.evaluation_passed),
    approvalDisplay: approvalDisplay(cs.approval.human_approval_decision),
    promotionDisplay: promotionDisplay(cs.model.promotion.state),
  };
}

function assertHeroShape(hero: ReturnType<typeof complianceHeroDecision>) {
  expect(hero.headline.length).toBeGreaterThan(0);
  expect(hero.explanation.length).toBeGreaterThan(0);
  expect(hero.explanation.length).toBeLessThanOrEqual(MAX_EXPLANATION_LEN);
}

function assertBlockedLike(model: ComplianceSummaryModel) {
  expect(model.kind).not.toBe("ok");
  const hero = complianceHeroDecision(model);
  expect(hero.status).toBe("blocked");
  assertHeroShape(hero);
}

describe("complianceDisplay helpers", () => {
  describe("evaluationDisplay", () => {
    it("maps true/false/null to passed/failed/pending", () => {
      expect(evaluationDisplay(true)).toBe("passed");
      expect(evaluationDisplay(false)).toBe("failed");
      expect(evaluationDisplay(null)).toBe("pending");
    });
  });

  describe("approvalDisplay", () => {
    it("treats empty as needed", () => {
      expect(approvalDisplay(null)).toBe("needed");
      expect(approvalDisplay("")).toBe("needed");
      expect(approvalDisplay("   ")).toBe("needed");
    });

    it.each(["approve", "approved", "granted", "Approve", "GRANTED", "Human: approved"])(
      "maps granted variants: %s",
      (s) => {
        expect(approvalDisplay(s)).toBe("granted");
      }
    );

    it.each([
      "reject",
      "rejected",
      "withhold",
      "withheld",
      "block",
      "blocked",
      "deny",
      "denied",
      "Policy: rejected",
    ])("maps blocked variants: %s", (s) => {
      expect(approvalDisplay(s)).toBe("blocked");
    });

    it.each(["pending", "review", "open", "unclear", "pending legal", "OPEN QUESTION"])(
      "maps review variants: %s",
      (s) => {
        expect(approvalDisplay(s)).toBe("review");
      }
    );

    it("grants when approve token appears among other words", () => {
      expect(approvalDisplay("approve with conditions")).toBe("granted");
    });

    it("blocked wins over granted tokens", () => {
      expect(approvalDisplay("approve then rejected")).toBe("blocked");
    });

    it("unknown nonempty text is review", () => {
      expect(approvalDisplay("maybe later")).toBe("review");
    });
  });

  describe("promotionDisplay", () => {
    it("treats empty as dash", () => {
      expect(promotionDisplay(null)).toBe("dash");
      expect(promotionDisplay("")).toBe("dash");
      expect(promotionDisplay("   ")).toBe("dash");
    });

    it.each(["allow", "allowed", "cleared", "CLEARED", "state: allowed"])(
      "maps cleared variants: %s",
      (s) => {
        expect(promotionDisplay(s)).toBe("cleared");
      }
    );

    it.each([
      "hold",
      "held",
      "block",
      "blocked",
      "deny",
      "denied",
      "on hold",
      "promotion denied",
    ])("maps held variants: %s", (s) => {
      expect(promotionDisplay(s)).toBe("held");
    });

    it.each(["review", "pending", "open", "PENDING SIGNOFF"])(
      "maps review variants: %s",
      (s) => {
        expect(promotionDisplay(s)).toBe("review");
      }
    );

    it("held wins over cleared tokens", () => {
      expect(promotionDisplay("allowed but denied")).toBe("held");
    });

    it("unknown nonempty text is review", () => {
      expect(promotionDisplay("maybe later")).toBe("review");
      expect(promotionDisplay("ready to promote")).toBe("review");
    });
  });
});

describe("normalizeComplianceSummaryInput", () => {
  it("maps transport unavailable (no audit URL) to no_payload blocked-like model", () => {
    const input: ComplianceSummaryResult = { available: false, reason: "no_audit_url" };
    const { model, auditRaw } = normalizeComplianceSummaryInput(input);
    expect(auditRaw).toBeUndefined();
    assertBlockedLike(model);
    expect(model).toEqual({ kind: "no_payload", reason: "no_audit_url", detail: undefined });
  });

  it("maps transport unavailable (fetch failed) to no_payload blocked-like model", () => {
    const input: ComplianceSummaryResult = {
      available: false,
      reason: "fetch_failed",
      detail: "network",
    };
    const { model } = normalizeComplianceSummaryInput(input);
    assertBlockedLike(model);
    expect(model).toEqual({ kind: "no_payload", reason: "fetch_failed", detail: "network" });
  });

  it("maps invalid payload to invalid blocked-like model", () => {
    const input: ComplianceSummaryResult = { available: true, body: [] };
    const { model, auditRaw } = normalizeComplianceSummaryInput(input);
    expect(auditRaw).toEqual([]);
    expect(model.kind).toBe("invalid");
    assertBlockedLike(model);
  });

  it("maps audit ok:false envelope to audit_error blocked-like model", () => {
    const body = { ok: false, schema_version: "1", policy_version: null, error: "upstream" };
    const { model } = normalizeComplianceSummaryInput({ available: true, body });
    expect(model.kind).toBe("audit_error");
    if (model.kind !== "audit_error") throw new Error("expected audit_error");
    expect(model.err.error).toBe("upstream");
    assertBlockedLike(model);
  });

  it("normalizes success payload fields", () => {
    const body = {
      ok: true,
      schema_version: "aigov.compliance_summary.v2",
      policy_version: "p1",
      run_id: "run-1",
      current_state: {
        schema_version: "aigov.compliance_current_state.v2",
        run_id: "run-1",
        identifiers: { ai_system_id: "ai-1", risk_ids: ["r1"] },
        model: {
          model_version_id: "mv-1",
          evaluation_passed: true,
          promotion: { state: "cleared", reason: null, model_promoted_present: true },
        },
        approval: { human_approval_decision: "approved" },
        evidence: { events_total: 3 },
        risks: { total_risks: 1, risks: [] },
      },
    };
    const { model, auditRaw } = normalizeComplianceSummaryInput({ available: true, body });
    expect(auditRaw).toBe(body);
    expect(model.kind).toBe("ok");
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.summary.policy_version).toBe("p1");
    expect(model.summary.run_id).toBe("run-1");
    expect(model.summary.current_state.identifiers.ai_system_id).toBe("ai-1");
    expect(model.summary.current_state.identifiers.risk_ids).toEqual(["r1"]);
    expect(model.summary.current_state.model.model_version_id).toBe("mv-1");
    expect(model.summary.current_state.model.evaluation_passed).toBe(true);
    expect(model.summary.current_state.model.promotion.model_promoted_present).toBe(true);
    expect(model.summary.current_state.approval.human_approval_decision).toBe("approved");
    expect(model.summary.current_state.evidence.events_total).toBe(3);
    expect(model.summary.current_state.risks.total_risks).toBe(1);
  });
});

describe("complianceHeroDecision spec example copy", () => {
  it("locks canonical single-line explanations for VALID, INVALID, and approval-needed BLOCKED", () => {
    expect(complianceHeroDecision(okModel({})).explanation).toBe("All requirements met. Promotion is allowed.");
    expect(complianceHeroDecision(okModel({ model: { evaluation_passed: false } })).explanation).toBe(
      "Evaluation failed. Do not promote.",
    );
    expect(complianceHeroDecision(okModel({ approval: { human_approval_decision: null } })).explanation).toBe(
      "Approval required before promotion.",
    );
  });
});

describe("complianceHeroDecision case matrix", () => {
  const cases: Array<{
    name: string;
    model: ComplianceSummaryModel;
    want: {
      status: "valid" | "invalid" | "blocked";
      headline: string;
      evaluation: ReturnType<typeof evaluationDisplay> | null;
      approval: ReturnType<typeof approvalDisplay> | null;
      promotion: ReturnType<typeof promotionDisplay> | null;
    };
  }> = [
    {
      name: "valid: passed + granted + cleared",
      model: okModel({}),
      want: {
        status: "valid",
        headline: "Review cleared",
        evaluation: "passed",
        approval: "granted",
        promotion: "cleared",
      },
    },
    {
      name: "evaluation failed",
      model: okModel({ model: { evaluation_passed: false } }),
      want: {
        status: "invalid",
        headline: "Evaluation failed",
        evaluation: "failed",
        approval: "granted",
        promotion: "cleared",
      },
    },
    {
      name: "evaluation pending",
      model: okModel({ model: { evaluation_passed: null } }),
      want: {
        status: "blocked",
        headline: "Evaluation pending",
        evaluation: "pending",
        approval: "granted",
        promotion: "cleared",
      },
    },
    {
      name: "missing approval",
      model: okModel({ approval: { human_approval_decision: null } }),
      want: {
        status: "blocked",
        headline: "Awaiting approval",
        evaluation: "passed",
        approval: "needed",
        promotion: "cleared",
      },
    },
    {
      name: "blocked approval",
      model: okModel({ approval: { human_approval_decision: "rejected" } }),
      want: {
        status: "blocked",
        headline: "Approval blocked",
        evaluation: "passed",
        approval: "blocked",
        promotion: "cleared",
      },
    },
    {
      name: "promotion held",
      model: okModel({ model: { promotion: { state: "on hold" } } }),
      want: {
        status: "blocked",
        headline: "Promotion held",
        evaluation: "passed",
        approval: "granted",
        promotion: "held",
      },
    },
    {
      name: "approval open (review)",
      model: okModel({ approval: { human_approval_decision: "pending legal" } }),
      want: {
        status: "blocked",
        headline: "Approval open",
        evaluation: "passed",
        approval: "review",
        promotion: "cleared",
      },
    },
    {
      name: "promotion unset (dash)",
      model: okModel({ model: { promotion: { state: null } } }),
      want: {
        status: "blocked",
        headline: "Promotion unset",
        evaluation: "passed",
        approval: "granted",
        promotion: "dash",
      },
    },
    {
      name: "audit unavailable (no_payload)",
      model: { kind: "no_payload", reason: "fetch_failed", detail: "x" },
      want: {
        status: "blocked",
        headline: "Compliance unavailable",
        evaluation: null,
        approval: null,
        promotion: null,
      },
    },
    {
      name: "malformed payload (invalid)",
      model: { kind: "invalid", reason: "not json" },
      want: {
        status: "blocked",
        headline: "Summary unreadable",
        evaluation: null,
        approval: null,
        promotion: null,
      },
    },
    {
      name: "audit error envelope",
      model: {
        kind: "audit_error",
        err: { schema_version: null, policy_version: null, error: "boom" },
      },
      want: {
        status: "blocked",
        headline: "Compliance error",
        evaluation: null,
        approval: null,
        promotion: null,
      },
    },
  ];

  it.each(cases)("$name", ({ model, want }) => {
    const hero = complianceHeroDecision(model);
    expect(hero.status).toBe(want.status);
    expect(hero.headline).toBe(want.headline);
    assertHeroShape(hero);

    const d = displaysFor(model);
    if (want.evaluation === null) {
      expect(d).toBeNull();
    } else {
      expect(d!.evaluationDisplay).toBe(want.evaluation);
      expect(d!.approvalDisplay).toBe(want.approval);
      expect(d!.promotionDisplay).toBe(want.promotion);
    }

    if (hero.status === "valid") {
      expect(d!.evaluationDisplay).toBe("passed");
      expect(d!.approvalDisplay).toBe("granted");
      expect(d!.promotionDisplay).toBe("cleared");
    }
    if (hero.status === "invalid") {
      expect(d!.evaluationDisplay).toBe("failed");
    }
    if (hero.status === "blocked" && model.kind === "ok") {
      const gatePending =
        d!.evaluationDisplay !== "passed" ||
        d!.approvalDisplay !== "granted" ||
        d!.promotionDisplay !== "cleared";
      expect(gatePending).toBe(true);
    }
  });
});

describe("invariants: hero vs display consistency", () => {
  const okSamples: ComplianceSummaryModel[] = [
    okModel({}),
    okModel({ model: { evaluation_passed: false } }),
    okModel({ model: { evaluation_passed: null } }),
    okModel({ approval: { human_approval_decision: "" } }),
    okModel({ approval: { human_approval_decision: "deny" } }),
    okModel({ model: { promotion: { state: "" } } }),
    okModel({ model: { promotion: { state: "hold" } } }),
    okModel({ approval: { human_approval_decision: "maybe" } }),
    okModel({ model: { promotion: { state: "unclear" } } }),
  ];

  const edgeModels: ComplianceSummaryModel[] = [
    { kind: "no_payload", reason: "no_audit_url" },
    { kind: "invalid", reason: "x" },
    {
      kind: "audit_error",
      err: { schema_version: "1", policy_version: null, error: "e" },
    },
  ];

  it("VALID never pairs with non-granted approval or non-cleared promotion", () => {
    for (const model of okSamples) {
      const hero = complianceHeroDecision(model);
      const d = displaysFor(model);
      if (!d) continue;
      if (hero.status === "valid") {
        expect(d.approvalDisplay).toBe("granted");
        expect(d.promotionDisplay).toBe("cleared");
      }
    }
  });

  it("INVALID always has evaluationDisplay failed", () => {
    for (const model of okSamples) {
      const hero = complianceHeroDecision(model);
      const d = displaysFor(model);
      if (!d) continue;
      if (hero.status === "invalid") {
        expect(d.evaluationDisplay).toBe("failed");
      }
    }
  });

  it("BLOCKED ok models correspond to at least one non-passing gate", () => {
    for (const model of okSamples) {
      const hero = complianceHeroDecision(model);
      const d = displaysFor(model);
      if (!d) continue;
      if (hero.status === "blocked") {
        const nonPassing =
          d.evaluationDisplay === "failed" ||
          d.evaluationDisplay === "pending" ||
          d.approvalDisplay !== "granted" ||
          d.promotionDisplay !== "cleared";
        expect(nonPassing).toBe(true);
      }
    }
  });

  it("non-ok models always yield blocked hero", () => {
    for (const model of edgeModels) {
      expect(complianceHeroDecision(model).status).toBe("blocked");
    }
  });
});
