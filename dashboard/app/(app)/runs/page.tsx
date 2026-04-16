import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ConsoleModuleCard,
  DashboardActionStrip,
  DashboardCompactCard,
  DashboardHero,
  DashboardPageIntroduction,
  DashboardPageShell,
  DashboardStatChips,
  DashboardTertiaryLink,
  dashboardErrorBanner,
  dashboardErrorBannerTitle,
  dashboardPageStack,
} from "@/app/_ui/dashboard";
import { ModeBadge, StatusBadge } from "@/app/_ui/console/runBadges";
import { fetchRecentRuns } from "@/lib/console/fetchRuns";
import { fmt, norm, relativeTimeAgo } from "@/lib/console/runFormat";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function displayPolicyName(versionKey: string) {
  if (versionKey === "(unspecified)") return "Unspecified";
  if (versionKey.length <= 48) return versionKey;
  return `${versionKey.slice(0, 44)}…`;
}

const emptySurface =
  "rounded-[10px] border px-4 py-7 text-center text-sm [border-color:var(--govai-border-ink-faint)] [color:var(--govai-text-muted)] [background:var(--govai-bg-inner)]";

export default async function RunsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { runs, error } = await fetchRecentRuns(supabase, 50);
  const total = runs.length;
  const open = runs.filter((r) => !r.closed_at || !String(r.closed_at).trim()).length;
  const invalid = runs.filter((r) => norm(r.status) === "invalid").length;

  const attentionRuns = runs.filter((r) => norm(r.mode) === "prod" && norm(r.status) !== "valid");
  const attentionCount = attentionRuns.length;

  const policyKeys = new Set(
    runs.map((r) => (r.policy_version?.trim() ? r.policy_version.trim() : "(unspecified)")),
  );
  const distinctPolicyVersions = policyKeys.size;

  const latest = runs[0];
  const latestValid = runs.find((r) => norm(r.status) === "valid");

  const latestId = latest?.id;
  const primaryCta =
    latestId != null
      ? { href: `/runs/${latestId}`, label: "Open latest run" as const }
      : { href: "/policies", label: "Open Policies" as const };

  const reviewHref =
    attentionRuns[0]?.id != null
      ? `/runs/${attentionRuns[0].id}`
      : latestId != null
        ? `/runs/${latestId}`
        : "/evidence";

  let nextStepTitle = "Review the latest run";
  let nextStepBody =
    "Confirm exports, evidence posture, and policy signals match what you expect in production.";
  if (error) {
    nextStepTitle = "Restore data access";
    nextStepBody = "Runs could not be loaded. Check connectivity, credentials, and try again.";
  } else if (total === 0) {
    nextStepTitle = "Record a first run";
    nextStepBody = "When your pipeline posts a run, it will appear here with policy and evidence signals.";
  } else if (attentionCount > 0) {
    nextStepTitle = "Review production attention items";
    nextStepBody = `${attentionCount} prod run${attentionCount === 1 ? "" : "s"} ${attentionCount === 1 ? "does" : "do"} not show a valid status — open the row for detail.`;
  } else if (invalid > 0) {
    nextStepTitle = "Investigate invalid outcomes";
    nextStepBody = `${invalid} run${invalid === 1 ? "" : "s"} marked invalid — trace evaluation and approvals from the run detail.`;
  }

  const dataSourceOk = !error;

  return (
    <DashboardPageShell>
      <div className={dashboardPageStack}>
        <DashboardPageIntroduction>
          <DashboardHero
            showBottomDivider={false}
            kicker="Compliance control plane"
            title="Runs"
            description="Operational ledger for compliance runs — policy binding, evidence posture, and audit outputs. Use this view to monitor health, drill into a run, and cross-check Policies and Evidence."
          />
          <div className="mt-2">
            <DashboardActionStrip primary={primaryCta} secondary={{ href: "/evidence", label: "Evidence register" }}>
              <DashboardTertiaryLink href="/policies">Policy versions</DashboardTertiaryLink>
              <span className="hidden text-sm [color:var(--govai-text-muted)] sm:inline" aria-hidden>
                ·
              </span>
              <DashboardTertiaryLink href="/ai-discovery">AI discovery</DashboardTertiaryLink>
            </DashboardActionStrip>
          </div>
        </DashboardPageIntroduction>

        <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
          <div className="lg:col-span-4">
            <ConsoleModuleCard
              eyebrow="How this works"
              title="Evidence-first workflow"
              purpose="Each run ties together evaluation, approvals, and exports you can defend in audit."
            >
              <ol className="govai-console-module__list [list-style-type:decimal]">
                <li>Runs land from your pipeline or adapter into this ledger (newest first).</li>
                <li>Policy versions and health signals are derived from live traffic — see Policies.</li>
                <li>Evidence bundles and reports are checked per run — see Evidence for posture.</li>
              </ol>
            </ConsoleModuleCard>
          </div>
          <div className="lg:col-span-4">
            <ConsoleModuleCard
              eyebrow="Current status"
              title="Window snapshot"
              purpose="Based on the latest 50 runs loaded into this workspace."
              surface="secondary"
            >
              <dl className="govai-console-kv">
                <div className="govai-console-kv__row">
                  <dt>Data source</dt>
                  <dd>
                    {dataSourceOk ? (
                      <>
                        <span className="govai-console-status-dot govai-console-status-dot--ok" aria-hidden />
                        Connected
                      </>
                    ) : (
                      <>
                        <span className="govai-console-status-dot govai-console-status-dot--err" aria-hidden />
                        Error
                      </>
                    )}
                  </dd>
                </div>
                <div className="govai-console-kv__row">
                  <dt>Latest activity</dt>
                  <dd>{latest?.created_at ? `${fmt(latest.created_at)} · ${relativeTimeAgo(latest.created_at)}` : "—"}</dd>
                </div>
                <div className="govai-console-kv__row">
                  <dt>Policy versions seen</dt>
                  <dd>{total === 0 ? "—" : distinctPolicyVersions}</dd>
                </div>
                <div className="govai-console-kv__row">
                  <dt>Prod attention</dt>
                  <dd>
                    {total === 0 ? (
                      "—"
                    ) : attentionCount > 0 ? (
                      <>
                        <span className="govai-console-status-dot govai-console-status-dot--warn" aria-hidden />
                        {attentionCount} open
                      </>
                    ) : (
                      <>
                        <span className="govai-console-status-dot govai-console-status-dot--ok" aria-hidden />
                        None flagged
                      </>
                    )}
                  </dd>
                </div>
              </dl>
            </ConsoleModuleCard>
          </div>
          <div className="lg:col-span-4">
            <ConsoleModuleCard
              eyebrow="Recommended next step"
              title={nextStepTitle}
              purpose={nextStepBody}
              surface="inner"
              emphasis
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link href={reviewHref} className="govai-btn--primary inline-flex" prefetch>
                  {error ? "Retry connection" : attentionCount > 0 ? "Open attention run" : "Open review target"}
                </Link>
                <Link href="/evidence" className="govai-btn--secondary inline-flex text-sm" prefetch>
                  Evidence posture
                </Link>
              </div>
              <p className="mt-4 text-[0.75rem] leading-relaxed [color:var(--govai-text-muted)]">
                What to review next: invalid rows, prod non-valid modes, or missing evidence — then confirm exports in the run
                detail.
              </p>
            </ConsoleModuleCard>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
          <div className="lg:col-span-7">
            <ConsoleModuleCard
              eyebrow="Operational signals"
              title="Queue metrics"
              purpose="Counts from the loaded window; invalid highlights downstream validation risk."
            >
              <DashboardStatChips
                embedded
                stats={[
                  { label: "Total in window", value: total, hint: "Max 50 loaded", valueTone: "neutral" },
                  { label: "Open", value: open, valueTone: "neutral" },
                  {
                    label: "Invalid",
                    value: invalid,
                    valueTone: invalid === 0 ? "success" : "warning",
                  },
                  {
                    label: "Latest valid",
                    value: latestValid?.created_at ? relativeTimeAgo(latestValid.created_at) : total === 0 ? "—" : "None in window",
                    hint: latestValid ? fmt(latestValid.created_at) : undefined,
                    valueTone: latestValid ? "success" : total === 0 ? "neutral" : "warning",
                  },
                ]}
              />
            </ConsoleModuleCard>
          </div>
          <div className="lg:col-span-5">
            <ConsoleModuleCard
              eyebrow="Pipeline & registers"
              title="Where to go next"
              purpose="Cross-check policy versions and evidence without leaving the compliance story."
              surface="secondary"
            >
              <ul className="govai-console-module__list [list-style-type:disc]">
                <li>
                  <Link href="/policies" className="govai-link text-[0.8125rem]">
                    Policies — version register and health from runs
                  </Link>
                </li>
                <li>
                  <Link href="/evidence" className="govai-link text-[0.8125rem]">
                    Evidence — bundle/report posture by run
                  </Link>
                </li>
                <li>
                  <Link href="/ai-discovery" className="govai-link text-[0.8125rem]">
                    AI discovery — repository signals (optional)
                  </Link>
                </li>
              </ul>
            </ConsoleModuleCard>
          </div>
        </div>

        <section>
          <ConsoleModuleCard
            eyebrow="Ledger"
            title="Recent runs"
            purpose={
              error
                ? "Could not load rows — fix the error above and refresh."
                : "Newest first. Policy label and time help you pick a row; prod rows that are not valid are highlighted."
            }
          >
            {error ? (
              <div className={dashboardErrorBanner} role="alert">
                <span className={dashboardErrorBannerTitle}>Load error.</span> {error.message}
              </div>
            ) : runs.length === 0 ? (
              <div className={emptySurface}>No runs in this window.</div>
            ) : (
              <DashboardCompactCard className="mt-1 border-[color:var(--govai-border-ink-faint)] bg-[color:var(--govai-bg-inner)]">
                <div className="px-0 py-1">
                  {runs.map((r, idx) => {
                    const mode = norm(r.mode);
                    const status = norm(r.status);
                    const needsAttention = mode === "prod" && status !== "valid";
                    const policyKey = (r.policy_version?.trim() || "(unspecified)") as string;
                    const policyDisplay = displayPolicyName(policyKey);

                    return (
                      <Link
                        key={r.id}
                        href={`/runs/${r.id}`}
                        className="govai-run-row block"
                        prefetch
                        style={{
                          borderRadius: 0,
                          marginBottom: 0,
                          borderTop: idx > 0 ? "1px solid var(--govai-divider)" : undefined,
                          background: needsAttention ? "var(--govai-row-attention)" : undefined,
                        }}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div
                              className="text-sm font-semibold tracking-tight [color:var(--govai-text-primary)]"
                              title={policyKey}
                            >
                              {policyDisplay}
                            </div>
                            <div className="mt-1 text-xs [color:var(--govai-text-muted)]">
                              {fmt(r.created_at) || "—"}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <ModeBadge mode={r.mode} />
                            <StatusBadge status={r.status} />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </DashboardCompactCard>
            )}
          </ConsoleModuleCard>
        </section>
      </div>
    </DashboardPageShell>
  );
}
