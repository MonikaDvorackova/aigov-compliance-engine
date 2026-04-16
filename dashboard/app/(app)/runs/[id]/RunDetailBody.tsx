import Link from "next/link";
import type { ReactNode } from "react";
import { ComplianceReviewPanel } from "@/app/components/ComplianceReviewPanel";
import {
  ComplianceRunTechnicalDetails,
  type RunLedgerRecord,
  type RunSignedUrlsState,
} from "@/app/components/ComplianceRunTechnicalDetails";
import type { ComplianceSummaryModel } from "@/lib/compliance/summaryModel";
import type {
  CompactStatusPanel,
  GroupedStatusRow,
  RunNextActionBlock,
} from "@/lib/compliance/runDetailDecision";

type RunDetailBodyProps = {
  run: RunLedgerRecord;
  signed: RunSignedUrlsState;
  model: ComplianceSummaryModel;
  auditRaw: unknown | undefined;
  packHref: string | null;
  fmt: (ts: string | null) => string;
  compact: CompactStatusPanel;
  nextAction: RunNextActionBlock;
  groupedRows: GroupedStatusRow[];
  conflictNote: string | null;
  /** Deeper explanation under grouped status (avoid repeating the headline shown in compact panel). */
  narrativeExplanation: string;
  checklist: string[];
};

function GroupedStatusTable({ rows }: { rows: GroupedStatusRow[] }) {
  return (
    <dl className="govai-run-grouped-status">
      {rows.map((row) => (
        <div key={row.label} className="govai-run-grouped-status__row">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CtaLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const isApi = href.startsWith("/api/");
  const isHash = href.startsWith("#");
  if (isApi || isHash || href.startsWith("http")) {
    return (
      <a
        href={href}
        className={className}
        {...(isApi || href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function RunDetailBody({
  run,
  signed,
  model,
  auditRaw,
  packHref,
  fmt,
  compact,
  nextAction,
  groupedRows,
  conflictNote,
  narrativeExplanation,
  checklist,
}: RunDetailBodyProps) {
  const r = run;

  return (
    <>
      {/* Zone: decision snapshot + next action */}
      <div className="govai-run-detail__zone govai-run-detail__zone--decision">
        <div className={`govai-run-compact-status govai-run-compact-status--${compact.variant}`}>
          <div className="govai-run-compact-status__dot" aria-hidden />
          <div className="govai-run-compact-status__body">
            <div className="govai-run-compact-status__state">{compact.stateLabel}</div>
            <div className="govai-run-compact-status__reason">{compact.reason}</div>
            <p className="govai-run-compact-status__interpret">{compact.interpretation}</p>
          </div>
        </div>

        <section
          className={
            nextAction.prominent ? "govai-run-next-action govai-run-next-action--prominent" : "govai-run-next-action"
          }
          aria-labelledby="run-next-action-title"
        >
          <h2 id="run-next-action-title" className="govai-run-next-action__title">
            {nextAction.title}
          </h2>
          <p className="govai-run-next-action__why">{nextAction.why}</p>
          <p className="govai-run-next-action__step">{nextAction.nextStep}</p>
          <div className="govai-run-next-action__ctas">
            <CtaLink href={nextAction.primary.href} className="govai-run-next-action__primary">
              {nextAction.primary.label}
            </CtaLink>
            {nextAction.secondary ? (
              <CtaLink href={nextAction.secondary.href} className="govai-run-next-action__secondary">
                {nextAction.secondary.label}
              </CtaLink>
            ) : null}
          </div>
        </section>
      </div>

      {/* Zone: readiness / compliance explanation */}
      <section
        className="govai-run-detail__zone govai-run-detail__zone--readiness govai-run-readiness-slot"
        id="run-compliance-summary"
        aria-labelledby="run-readiness-title"
      >
        <div id="run-readiness-title" className="govai-run-section__title">
          Readiness signals
        </div>
        <p className="govai-run-readiness__hint" id="run-readiness-hint">
          Evaluation, then approval, then promotion. Primary risk is context only.
        </p>
        <ComplianceReviewPanel model={model} aria-describedby="run-readiness-hint" />
      </section>

      {/* Zone: structured data + technical */}
      <div className="govai-run-detail__zone govai-run-detail__zone--technical">
        <div className="govai-run-decision-grid">
          <div className="govai-run-decision-grid__primary">
            <section className="govai-run-section" aria-label="Status summary">
              <div className="govai-run-section__title">Status summary</div>
              <GroupedStatusTable rows={groupedRows} />
              <p className="govai-run-status-summary__explain">{narrativeExplanation}</p>
              {conflictNote ? (
                <p className="govai-run-status-summary__conflict" role="note">
                  {conflictNote}
                </p>
              ) : null}
              <div className="govai-run-status-summary__meta">
                Created {fmt(r.created_at) || "—"}
                <span className="govai-run-signals__metaSep">·</span>
                Closed {fmt(r.closed_at) || "—"}
              </div>
            </section>

            <section className="govai-run-section" aria-labelledby="run-checklist-title">
              <div id="run-checklist-title" className="govai-run-section__title">
                Checklist
              </div>
              <ol className="govai-run-checklist">
                {checklist.map((item, i) => (
                  <li key={`${i}-${item.slice(0, 24)}`}>{item}</li>
                ))}
              </ol>
            </section>
          </div>

          <aside className="govai-run-decision-grid__secondary" aria-label="Artifacts and technical details">
            <section className="govai-run-section govai-run-artifacts">
              <div className="govai-run-section__title">Artifacts</div>
              <div className="govai-run-artifacts__row">
                <a
                  className="govai-run-artifact-link"
                  href={`/api/raw/audit/${encodeURIComponent(r.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Audit manifest
                </a>
                <a
                  className="govai-run-artifact-link"
                  href={`/api/raw/evidence/${encodeURIComponent(r.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Evidence JSON
                </a>
                <a
                  className="govai-run-artifact-link"
                  href={packHref ?? `/api/bundle/${encodeURIComponent(r.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download pack
                </a>
              </div>
              {!signed.ok ? (
                <p className="govai-run-artifacts__note">Signed URLs unavailable: {signed.message ?? "storage error"}</p>
              ) : null}
            </section>

            <details className="govai-run-details" id="run-technical-details">
              <summary className="govai-run-details__summary">Technical details</summary>
              <div className="govai-run-details__body">
                <ComplianceRunTechnicalDetails run={r} signed={signed} model={model} auditRaw={auditRaw} />
              </div>
            </details>
          </aside>
        </div>
      </div>
    </>
  );
}
