import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchRunByIdFromGovai, isConsoleRunsReadEnabled } from "@/lib/console/govaiConsoleRunsRead";
import { fetchComplianceSummary } from "@/lib/server/fetchComplianceSummary";
import { complianceHeroDecision } from "@/lib/compliance/complianceHeroDecision";
import { normalizeComplianceSummaryInput } from "@/lib/compliance/summaryModel";
import {
  buildCompactStatusPanel,
  buildGroupedStatusRows,
  buildNextAction,
  buildRunChecklist,
  buildSignalConflictNote,
} from "@/lib/compliance/runDetailDecision";
import { deriveIntegritySummary } from "@/lib/console/runDetail";
import type { RunLedgerRecord, RunSignedUrlsState } from "@/app/components/ComplianceRunTechnicalDetails";
import { InlineMono } from "@/app/_ui/console/primitives";
import { DashboardPageShell } from "@/app/_ui/dashboard";
import { RunDetailBody } from "./RunDetailBody";

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

function shortId(v: string) {
  const s = (v ?? "").trim();
  if (!s) return "—";
  if (s.length <= 18) return s;
  return `${s.slice(0, 10)}…${s.slice(-6)}`;
}

async function fetchSignedUrls(runId: string): Promise<RunSignedUrlsState> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  const path = `/api/storage/signed-urls?runId=${encodeURIComponent(runId)}`;

  if (site) {
    const res = await fetch(`${site}${path}`, { cache: "no-store" });
    return (await res.json()) as RunSignedUrlsState;
  }

  const res = await fetch(path, { cache: "no-store" });
  return (await res.json()) as RunSignedUrlsState;
}

type RunDetailPageProps = { params: Promise<{ id: string }> };

export default async function RunDetailPage({ params }: RunDetailPageProps) {
  const { id: runId } = await params;
  const runIdTrimmed = (runId ?? "").trim();

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (!runIdTrimmed) {
    notFound();
  }

  let data: RunLedgerRecord | null = null;

  if (isConsoleRunsReadEnabled()) {
    const { run, error: pgErr } = await fetchRunByIdFromGovai(runIdTrimmed);
    if (pgErr) {
      notFound();
    }
    data = run;
    if (!data) {
      notFound();
    }
  } else {
    const { data: sbData, error } = await supabase
      .from("runs")
      .select("id,created_at,mode,status,policy_version,bundle_sha256,evidence_sha256,report_sha256,evidence_source,closed_at")
      .eq("id", runIdTrimmed)
      .maybeSingle();

    if (error) {
      notFound();
    }
    if (!sbData) {
      notFound();
    }
    data = sbData as RunLedgerRecord;
  }

  const r = data as RunLedgerRecord;

  const mode = norm(r.mode);
  const status = norm(r.status);

  const isValid = status === "valid";

  const hasClosed = Boolean(r.closed_at && String(r.closed_at).trim().length > 0);

  const prodGateOk = mode !== "prod" || isValid;

  const signed = await fetchSignedUrls(r.id);

  const { model: summaryModel, auditRaw } = normalizeComplianceSummaryInput(await fetchComplianceSummary(r.id));

  const crumbId = shortId(r.id);

  const decision = complianceHeroDecision(summaryModel);
  const heroLabel = decision.status === "valid" ? "VALID" : decision.status === "invalid" ? "INVALID" : "BLOCKED";
  const heroVariant = decision.status;
  /** Single-line answer under the state label (headline stays in compact panel / next-step copy). */
  const heroExplain = decision.explanation;
  const integrityLine = deriveIntegritySummary(r, status);

  const packHref = signed.ok ? signed.urls?.packZip : null;

  const decisionInput = {
    runId: r.id,
    modeNorm: mode,
    statusNorm: status,
    isValid,
    hasClosed,
    prodGateOk,
    hero: decision,
    model: summaryModel,
    integrityLine,
  };

  const conflictNote = buildSignalConflictNote(decisionInput);
  const compact = buildCompactStatusPanel(decision, conflictNote, integrityLine);
  const nextAction = buildNextAction(decisionInput);
  const groupedRows = buildGroupedStatusRows(decisionInput);
  const checklist = buildRunChecklist(decisionInput);

  return (
    <DashboardPageShell>
      <div className="govai-run-detail max-w-4xl">
      <div style={{ marginTop: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Link href="/runs" className="govai-link text-[13px]">
              Runs
            </Link>
            <span style={{ color: "var(--govai-text-label)" }}>／</span>
            <InlineMono style={{ opacity: 0.85, fontSize: 12 }}>{crumbId}</InlineMono>
          </div>
          <Link href="/runs" className="govai-link text-[13px]">
            Back to list
          </Link>
        </div>

        <section
          className={`govai-run-hero govai-run-hero--${heroVariant}`}
          aria-labelledby="run-promotion-question run-decision-label"
        >
          <p id="run-promotion-question" className="govai-run-hero__question">
            Can this model be promoted to production?
          </p>
          <div id="run-decision-label" className="govai-run-hero__label">
            {heroLabel}
          </div>
          <p className="govai-run-hero__explain">{heroExplain}</p>
        </section>

        <RunDetailBody
          run={r}
          signed={signed}
          model={summaryModel}
          auditRaw={auditRaw}
          packHref={packHref ?? null}
          fmt={fmt}
          compact={compact}
          nextAction={nextAction}
          groupedRows={groupedRows}
          conflictNote={conflictNote}
          narrativeExplanation={decision.explanation}
          checklist={checklist}
        />
      </div>
      </div>
    </DashboardPageShell>
  );
}
