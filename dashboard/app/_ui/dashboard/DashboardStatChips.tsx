import type { ReactNode } from "react";

import type { GovaiStatValueTone } from "@/app/_ui/theme/govaiPalette";

export type StatChip = {
  label: string;
  value: ReactNode;
  hint?: string;
  valueTone?: GovaiStatValueTone;
};

function valueToneClass(tone: GovaiStatValueTone | undefined): string {
  if (tone === "success") return "govai-stat-value--success";
  if (tone === "warning") return "govai-stat-value--warning";
  if (tone === "danger") return "govai-stat-value--danger";
  return "govai-stat-value--neutral";
}

/** Readout panel — typography-led; semantic numerals stay subdued */
export function DashboardStatChips({ stats, embedded = false }: { stats: readonly StatChip[]; embedded?: boolean }) {
  return (
    <div className={embedded ? "govai-insight-panel govai-insight-panel--embedded" : "govai-insight-panel"}>
      <ul className="flex flex-col divide-y divide-[color:rgba(255,255,255,0.1)] px-0 py-0 sm:flex-row sm:flex-wrap sm:divide-y-0 sm:gap-x-10 sm:gap-y-5">
        {stats.map((s) => (
          <li key={s.label} className="min-w-[6.5rem] flex-1 py-4 first:pt-0 last:pb-0 sm:py-1">
            <div className="text-[0.62rem] font-medium uppercase tracking-[0.18em] [color:var(--govai-text-muted)]">
              {s.label}
            </div>
            <div
              className={`mt-2 text-2xl font-medium tabular-nums tracking-[-0.02em] sm:text-[1.75rem] ${valueToneClass(s.valueTone)}`}
            >
              {s.value}
            </div>
            {s.hint ? (
              <div className="mt-1.5 text-[0.75rem] font-normal leading-snug [color:var(--govai-text-muted)]">
                {s.hint}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
