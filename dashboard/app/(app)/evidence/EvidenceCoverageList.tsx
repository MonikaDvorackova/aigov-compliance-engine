import Link from "next/link";
import { Badge } from "@/app/_ui/console/primitives";
import { ModeBadge, StatusBadge } from "@/app/_ui/console/runBadges";
import { DashboardCompactCard } from "@/app/_ui/dashboard";
import { runArtifactCoverage } from "@/lib/console/artifactCoverage";
import { fmt } from "@/lib/console/runFormat";
import type { RunRow } from "@/lib/console/runTypes";

function shortRunId(id: string) {
  if (id.length <= 14) return id;
  return `${id.slice(0, 10)}…${id.slice(-4)}`;
}

function coverageRollupKind(tier: "complete" | "partial" | "none"): "ok" | "issue" | "error" {
  if (tier === "complete") return "ok";
  if (tier === "none") return "error";
  return "issue";
}

function coverageRollupLabel(tier: "complete" | "partial" | "none") {
  if (tier === "complete") return "Complete";
  if (tier === "none") return "Missing";
  return "Partial";
}

function BundlePill({ ok }: { ok: boolean }) {
  if (!ok) {
    return <span className="govai-chip govai-chip--error">—</span>;
  }
  return <span className="govai-chip govai-chip--ok">✓</span>;
}

function EvidenceOrReportPill({ ok }: { ok: boolean }) {
  if (!ok) {
    return <span className="govai-chip govai-chip--error">—</span>;
  }
  return <span className="govai-chip govai-chip--ok">✓</span>;
}

export default function EvidenceCoverageList({ runs }: { runs: RunRow[] }) {
  return (
    <DashboardCompactCard className="overflow-hidden">
      <div>
        {runs.map((r, idx) => {
          const cov = runArtifactCoverage(r);
          const rollupKind = coverageRollupKind(cov.tier);

          return (
            <div
              key={r.id}
              className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${
                idx > 0 ? "border-t [border-color:var(--govai-border-subtle)]" : ""
              } ${idx % 2 === 1 ? "bg-[rgba(255,255,255,0.02)]" : ""}`}
            >
              <div className="min-w-[200px] flex-1">
                <Link href={`/runs/${r.id}`} className="govai-link font-mono text-xs" title={r.id}>
                  {shortRunId(r.id)}
                </Link>
                <div className="mt-1 text-xs [color:var(--govai-text-muted)]">{fmt(r.created_at)}</div>
              </div>

              <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
                <ModeBadge mode={r.mode} />
                <StatusBadge status={r.status} />
              </div>

              <div className="flex min-w-[160px] flex-[0_1_auto] flex-col items-end gap-1.5">
                <Badge kind={rollupKind}>{coverageRollupLabel(cov.tier)}</Badge>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <span className="text-[9px] font-medium uppercase tracking-wider [color:var(--govai-text-muted)]">
                    B
                  </span>
                  <BundlePill ok={cov.bundle} />
                  <span className="ml-1 text-[9px] font-medium uppercase tracking-wider [color:var(--govai-text-muted)]">
                    E
                  </span>
                  <EvidenceOrReportPill ok={cov.evidence} />
                  <span className="ml-1 text-[9px] font-medium uppercase tracking-wider [color:var(--govai-text-muted)]">
                    R
                  </span>
                  <EvidenceOrReportPill ok={cov.report} />
                </div>
                {r.evidence_source?.trim() ? (
                  <div
                    className="max-w-[200px] truncate text-right text-[10px] [color:var(--govai-text-muted)]"
                    title={r.evidence_source ?? undefined}
                  >
                    {r.evidence_source}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </DashboardCompactCard>
  );
}
