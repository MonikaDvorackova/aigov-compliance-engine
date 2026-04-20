import Link from "next/link";
import { redirect } from "next/navigation";
import {
  DashboardActionStrip,
  DashboardContentSection,
  DashboardHero,
  DashboardPageIntroduction,
  DashboardPageShell,
  DashboardSectionHeader,
  DashboardStatChips,
  DashboardTertiaryLink,
  DashboardTwoColumn,
  EvidencePostureBars,
  dashboardErrorBanner,
  dashboardErrorBannerTitle,
  dashboardPageStack,
} from "@/app/_ui/dashboard";
import { buildEvidenceSnapshot } from "@/lib/console/aggregates";
import { fetchRecentRuns } from "@/lib/console/fetchRuns";
import type { RunRow } from "@/lib/console/runTypes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import EvidenceCoverageList from "./EvidenceCoverageList";

function pct(n: number, d: number) {
  if (d <= 0) return "0";
  return Math.round((n / d) * 100).toString();
}

export default async function EvidencePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { runs, error } = await fetchRecentRuns(supabase, 100);
  const snap = buildEvidenceSnapshot(runs);
  const listRuns = runs.slice(0, 28) as RunRow[];

  const triadComplete = snap.sampleSize > 0 && snap.fullTriad >= snap.sampleSize;
  const fullTriadTone =
    snap.sampleSize === 0 ? ("neutral" as const) : triadComplete ? ("success" as const) : ("warning" as const);

  const invalidTone =
    snap.sampleSize === 0 ? ("neutral" as const) : snap.invalidStatus === 0 ? ("success" as const) : ("danger" as const);

  const prodGapsTone =
    snap.sampleSize === 0 ? ("neutral" as const) : snap.prodNotValid === 0 ? ("success" as const) : ("warning" as const);

  return (
    <DashboardPageShell>
      <div className={dashboardPageStack}>
        <DashboardPageIntroduction>
          <DashboardHero
            showBottomDivider={false}
            kicker="GovAI"
            title="Evidence"
            description="Artifact coverage across recent runs — find gaps before you open a run."
          />
          <DashboardActionStrip
            primary={{ href: "/runs", label: "View runs" }}
            secondary={{ href: "/policies", label: "Policies" }}
          />
        </DashboardPageIntroduction>

        {error ? (
          <div className={dashboardErrorBanner} role="alert">
            <span className={dashboardErrorBannerTitle}>Could not load evidence.</span> {error.message}
          </div>
        ) : null}

        {!error && runs.length === 0 ? (
          <DashboardContentSection>
            <DashboardSectionHeader title="Nothing in this window yet" />
            <p className="mt-2 text-sm [color:var(--govai-text-secondary)]">
              Ingest runs with artifact metadata first.
            </p>
            <div className="mt-5">
              <DashboardTertiaryLink href="/runs">Open Runs</DashboardTertiaryLink>
            </div>
          </DashboardContentSection>
        ) : null}

        {!error && runs.length > 0 ? (
          <>
            <DashboardContentSection>
              <DashboardTwoColumn
                left={
                  <div className="min-w-0">
                    <DashboardSectionHeader
                      eyebrow="Overview"
                      title="Artifact posture"
                      description="Share of runs with each artifact recorded in this window."
                    />
                    <div className="mt-5">
                      <EvidencePostureBars
                        withBundle={snap.withBundle}
                        withEvidenceJson={snap.withEvidenceJson}
                        withReport={snap.withReport}
                        sampleSize={snap.sampleSize}
                      />
                    </div>
                    <p className="mt-4 text-xs [color:var(--govai-text-muted)]">
                      Prod not valid:{" "}
                      <span className="font-medium [color:var(--govai-text-secondary)]">{snap.prodNotValid}</span> in
                      sample — use{" "}
                      <Link href="/runs" className="govai-link">
                        Runs
                      </Link>{" "}
                      to drill in.
                    </p>
                  </div>
                }
                right={
                  <DashboardStatChips
                    stats={[
                      { label: "Window", value: snap.sampleSize, hint: "Runs sampled", valueTone: "neutral" },
                      {
                        label: "Full triad",
                        value: snap.fullTriad,
                        hint: `${pct(snap.fullTriad, snap.sampleSize)}% B+E+R`,
                        valueTone: fullTriadTone,
                      },
                      {
                        label: "Bundles",
                        value: snap.uniqueBundles,
                        hint: "Distinct hashes",
                        valueTone: "neutral",
                      },
                      { label: "Invalid", value: snap.invalidStatus, valueTone: invalidTone },
                      {
                        label: "Prod gaps",
                        value: snap.prodNotValid,
                        hint: "Prod ∧ not valid",
                        valueTone: prodGapsTone,
                      },
                    ]}
                  />
                }
              />
            </DashboardContentSection>

            <DashboardContentSection>
              <DashboardSectionHeader
                eyebrow="Data"
                title="Coverage register"
                description="B/E/R = bundle, evidence, report — open a row for full hashes."
              />
              <div className="mt-4">
                <EvidenceCoverageList runs={listRuns} />
              </div>
            </DashboardContentSection>
          </>
        ) : null}
      </div>
    </DashboardPageShell>
  );
}
