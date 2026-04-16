import { premiumPrimaryButtonClass } from "@/app/_ui/cta/premiumPrimaryButton";

/**
 * GovAI Policies — graphite system; steel accent for links only; semantic tones muted.
 */

export const policiesCard =
  "rounded-lg border shadow-none [border-color:var(--govai-border-subtle)] bg-[color:var(--govai-bg-card)]";

export const policiesPageShell =
  "rounded-2xl border [border-color:var(--govai-border-subtle)] bg-[color:var(--govai-bg-card2)] p-3 sm:p-4";

export const policiesStatsStrip = `${policiesCard} px-2.5 py-1.5 sm:px-3`;

export const policiesStatsInline =
  "flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] sm:gap-x-4";

export const policiesTextPrimary = "[color:var(--govai-text-primary)]";

export const policiesTextSecondary = "[color:var(--govai-text-secondary)]";

export const policiesTextMuted = "[color:var(--govai-text-muted)]";

export const policiesTextStat = "font-medium tabular-nums [color:var(--govai-text-primary)]";

export const policiesBrandKicker =
  "text-[0.62rem] font-medium uppercase tracking-[0.2em] [color:var(--govai-text-muted)]";

export const policiesLink = "govai-link text-sm font-medium";

export const policiesLinkSubtle = "govai-link text-xs font-medium";

export const policiesPrimaryButton = `inline-flex w-fit items-center justify-center rounded-md px-4 py-2 text-sm font-semibold ${premiumPrimaryButtonClass}`;

export const policiesCardInteractiveHover =
  "transition-colors hover:border-[color:var(--govai-border-strong)]";

export const policiesStatSep = "shrink-0 [color:var(--govai-text-muted)]";

export const policiesBarPrimary = "bg-[rgba(110,124,143,0.14)]";

export const policiesSignalPositiveBar = "bg-[rgba(94,122,103,0.2)]";

export const policiesSignalPositiveDot = "bg-[rgba(94,122,103,0.65)]";

export const policiesBadgePositive =
  "inline-flex shrink-0 rounded-md border [border-color:rgba(94,122,103,0.28)] bg-[color:var(--govai-bg-card2)] px-1.5 py-0.5 text-[0.65rem] font-medium [color:var(--govai-state-success)]";

export const policiesSignalIssueBar = "bg-[rgba(138,106,67,0.16)]";

export const policiesSignalIssueDot = "bg-[rgba(138,106,67,0.55)]";

export const policiesBadgeIssue =
  "inline-flex shrink-0 rounded-md border [border-color:rgba(138,106,67,0.28)] bg-[color:var(--govai-bg-card2)] px-1.5 py-0.5 text-[0.65rem] font-medium [color:var(--govai-state-warning)] opacity-95";

export const policiesSignalErrorBar = "bg-[rgba(138,90,90,0.18)]";

export const policiesSignalErrorDot = "bg-[rgba(138,90,90,0.55)]";

export const policiesSignalNeutralBar = "bg-[rgba(255,255,255,0.06)]";

export const policiesSignalNeutralDot = "bg-[rgba(255,255,255,0.22)]";

export const policiesBadgeNeutral =
  "inline-flex shrink-0 rounded-md border [border-color:var(--govai-border-subtle)] bg-[color:var(--govai-bg-card2)] px-1.5 py-0.5 text-[0.65rem] font-medium [color:var(--govai-text-muted)]";

export const policiesRowCard = `${policiesCard} ${policiesCardInteractiveHover}`;

export const policiesPipelineChip =
  "rounded-md border [border-color:var(--govai-border-subtle)] bg-[color:var(--govai-bg-card2)] px-2 py-1 text-[0.75rem] font-medium [color:var(--govai-text-secondary)]";

export const policiesPipelineArrow = "select-none [color:var(--govai-text-muted)] opacity-45";

export const policiesColumnTitle =
  "text-xs font-medium uppercase tracking-wide [color:var(--govai-text-muted)]";

export const policiesSignalBar = {
  primary: policiesBarPrimary,
  positive: policiesSignalPositiveBar,
  issue: policiesSignalIssueBar,
  error: policiesSignalErrorBar,
  neutral: policiesSignalNeutralBar,
} as const;

export const policiesStatusDot = {
  positive: policiesSignalPositiveDot,
  issue: policiesSignalIssueDot,
  error: policiesSignalErrorDot,
  neutral: policiesSignalNeutralDot,
} as const;
