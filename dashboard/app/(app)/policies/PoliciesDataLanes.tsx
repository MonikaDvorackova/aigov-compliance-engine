import type { ReactNode } from "react";
import { policiesCard, policiesColumnTitle, policiesTextMuted, policiesTextSecondary } from "./policiesTheme";

export type PoliciesDataLane = {
  id: string;
  title: string;
  summary: string;
  children?: ReactNode;
};

type PoliciesDataLanesProps = {
  lanes: readonly [PoliciesDataLane, PoliciesDataLane, PoliciesDataLane];
  emptyFallback: string;
};

/**
 * Renders lane cards only when a lane has row data; otherwise hides the lane.
 * Avoids equal-weight empty cards.
 */
export function PoliciesDataLanes({ lanes, emptyFallback }: PoliciesDataLanesProps) {
  const filled = lanes.filter((l) => Boolean(l.children));

  if (filled.length === 0) {
    return (
      <p className={`text-sm leading-relaxed ${policiesTextMuted}`} role="note">
        {emptyFallback}
      </p>
    );
  }

  return (
    <div className={`grid gap-4 ${filled.length === 1 ? "grid-cols-1" : filled.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
      {filled.map((lane) => (
        <div
          key={lane.id}
          className={`flex min-h-0 flex-col px-3 py-2.5 ${policiesCard}`}
        >
          <h3 className={policiesColumnTitle}>{lane.title}</h3>
          <p className={`mt-1 text-xs leading-snug ${policiesTextSecondary}`}>{lane.summary}</p>
          <div className="mt-2 flex min-h-0 flex-col gap-1.5 overflow-y-auto">{lane.children}</div>
        </div>
      ))}
    </div>
  );
}
