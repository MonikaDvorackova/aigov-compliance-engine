/**
 * GovAI dashboard layout — graphite system (`globals.css` :root).
 */

/** Vertical stack — modular rhythm (tighter than marketing spacing) */
export const dashboardPageStack = "flex flex-col gap-10 md:gap-12";

/** Hero + primary actions */
export const dashboardPageIntro =
  "flex flex-col gap-7 border-b pb-9 md:pb-11 [border-color:var(--govai-divider)]";

/** Section label — small, tracked, quiet */
export const dashboardEyebrow =
  "text-[0.62rem] font-medium uppercase tracking-[0.2em] [color:var(--govai-text-muted)]";

/** Section title — editorial weight */
export const dashboardSectionHeadline =
  "text-xl font-medium tracking-[-0.02em] [color:var(--govai-text-primary)] md:text-2xl";

/** Supporting copy */
export const dashboardSectionIntro =
  "text-sm font-normal leading-relaxed [color:var(--govai-text-secondary)] max-w-2xl";

/** Error banner — muted iron, neutral surface */
export const dashboardErrorBanner =
  "rounded-[10px] border bg-[color:var(--govai-bg-card)] px-4 py-4 text-sm [color:var(--govai-text-secondary)] [border-color:rgba(138,90,90,0.28)]";

export const dashboardErrorBannerTitle = "font-medium [color:var(--govai-state-danger)]";

export const dashboardAnchoredPanel =
  "rounded-[10px] border bg-[color:var(--govai-bg-card)] p-4 md:p-5 [border-color:var(--govai-border-surface-strong)]";

export const dashboardGuidancePanel =
  "rounded-[10px] border bg-[color:var(--govai-bg-card2)] px-4 py-5 md:px-5 md:py-6 [border-color:var(--govai-border-surface-strong)]";

export const dashboardFooterNote =
  "border-t pt-6 text-[0.7rem] font-normal leading-relaxed [color:var(--govai-text-muted)] [border-color:var(--govai-divider)]";
