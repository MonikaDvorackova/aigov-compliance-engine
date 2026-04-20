import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { aggregatePoliciesFromRuns } from "@/lib/console/aggregates";
import { fetchRecentRunsForPoliciesPage } from "@/lib/console/fetchRuns";
import { relativeTimeAgo } from "@/lib/console/runFormat";
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
  dashboardAnchoredPanel,
  dashboardFooterNote,
  dashboardGuidancePanel,
  dashboardPageStack,
} from "@/app/_ui/dashboard";
import { PoliciesEmptyBody } from "./PoliciesEmptyBody";
import { PoliciesOnboardingPanel } from "./PoliciesOnboardingPanel";
import { policyRegisterSummaryLine, PolicyVersionRegister } from "./PolicyVersionRegister";
import { nextStepLine } from "./diagnostics";

export default async function PoliciesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { runs: runsList, error } = await fetchRecentRunsForPoliciesPage(supabase, 500);

  if (error) {
    console.error("[policies] compliance_runs query failed:", error.message);
  }
  const rows = aggregatePoliciesFromRuns(runsList);
  const runsSampleCount = runsList.length;

  const activePolicyCount = rows.filter((r) => r.tier === "active").length;
  const stalePolicyCount = rows.filter((r) => r.tier === "stale").length;
  const attentionCount = rows.filter((r) => r.status === "attention").length;

  const lastIso = runsList[0]?.created_at ?? "";
  const lastActivityLabel =
    runsSampleCount === 0 || !lastIso ? "—" : relativeTimeAgo(lastIso) || "—";

  const footer = nextStepLine({
    rows,
    runsSampleCount,
    activeCount: activePolicyCount,
    staleCount: stalePolicyCount,
    attentionCount,
    unknownCount: rows.filter((r) => r.status === "unknown").length,
  });

  const showRegister = !error && runsSampleCount > 0;

  return (
    <DashboardPageShell>
      <div className={dashboardPageStack}>
        <DashboardPageIntroduction>
          <DashboardHero
            showBottomDivider={false}
            kicker="GovAI"
            title="Policies"
            description="Production health by policy version — inferred from your compliance runs."
          />
          <DashboardActionStrip
            primary={{ href: "/runs", label: "Run compliance job" }}
            secondary={{ href: "/runs", label: "View runs" }}
          >
            <DashboardTertiaryLink href="/evidence">Evidence</DashboardTertiaryLink>
          </DashboardActionStrip>
        </DashboardPageIntroduction>

        {!showRegister ? (
          <DashboardContentSection>
            <DashboardTwoColumn
              left={
                <div className={dashboardGuidancePanel}>
                  <PoliciesOnboardingPanel variant={error ? "stalled" : "empty"} />
                </div>
              }
              right={
                <div className={`${dashboardAnchoredPanel} lg:pt-1`}>
                  {error ? <PoliciesEmptyBody variant="unavailable" /> : <PoliciesEmptyBody variant="no_runs" />}
                </div>
              }
            />
          </DashboardContentSection>
        ) : (
          <>
            <DashboardContentSection>
              <DashboardTwoColumn
                left={
                  <div className="min-w-0">
                    <DashboardSectionHeader
                      eyebrow="State"
                      title="Policy landscape"
                      description={policyRegisterSummaryLine(rows)}
                    />
                    <p className="mt-2 text-xs [color:var(--govai-text-muted)]">Sample: last 500 runs.</p>
                  </div>
                }
                right={
                  <DashboardStatChips
                    stats={[
                      { label: "Active", value: activePolicyCount, valueTone: "neutral" },
                      {
                        label: "Attention",
                        value: attentionCount,
                        valueTone: attentionCount === 0 ? "success" : "warning",
                      },
                      { label: "Versions", value: rows.length, valueTone: "neutral" },
                      {
                        label: "Last activity",
                        value: lastActivityLabel,
                        hint: "From newest run in sample",
                        valueTone: "neutral",
                      },
                    ]}
                  />
                }
              />
            </DashboardContentSection>

            <DashboardContentSection>
              <DashboardSectionHeader eyebrow="Data" title="Version register" />
              <div className="mt-1">
                <PolicyVersionRegister rows={rows} lanesOnly />
              </div>
            </DashboardContentSection>
          </>
        )}

        {footer && showRegister ? (
          <p className={dashboardFooterNote} role="note">
            {footer}
          </p>
        ) : null}
      </div>
    </DashboardPageShell>
  );
}
