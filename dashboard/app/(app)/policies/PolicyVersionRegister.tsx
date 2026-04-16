"use client";

import type { ReactNode } from "react";
import type { PolicyAggregateRow } from "@/lib/console/aggregates";
import { relativeTimeAgo } from "@/lib/console/runFormat";
import type { PoliciesDataLane } from "./PoliciesDataLanes";
import { PoliciesDataLanes } from "./PoliciesDataLanes";
import type { PoliciesStatusTone } from "./policiesStatusTypes";
import { PoliciesSystemStatusCompact } from "./PoliciesSystemStatusCompact";
import {
  policiesBadgeIssue,
  policiesBadgeNeutral,
  policiesBadgePositive,
  policiesRowCard,
  policiesSignalBar,
  policiesStatSep,
  policiesTextMuted,
  policiesTextPrimary,
  policiesTextSecondary,
} from "./policiesTheme";

function statusPhrase(row: PolicyAggregateRow): string {
  if (row.status === "attention") {
    return "Production not valid";
  }
  if (row.status === "unknown") {
    return "No prod signal";
  }
  return "OK — no invalid prod runs";
}

function PolicyStatusBadge({ row }: { row: PolicyAggregateRow }) {
  if (row.status === "attention") {
    return <span className={policiesBadgeIssue}>Review</span>;
  }
  if (row.status === "unknown") {
    return <span className={policiesBadgeNeutral}>Inactive</span>;
  }
  return <span className={policiesBadgePositive}>Valid</span>;
}

function leftBarClass(row: PolicyAggregateRow): string {
  if (row.status === "attention") {
    return policiesSignalBar.issue;
  }
  if (row.status === "unknown") {
    return policiesSignalBar.neutral;
  }
  if (row.tier === "active") {
    return policiesSignalBar.primary;
  }
  return policiesSignalBar.neutral;
}

function PolicyRow({ row, compact }: { row: PolicyAggregateRow; compact?: boolean }) {
  const lastSeen = relativeTimeAgo(row.lastActivityIso);
  const pad = compact ? "gap-0.5 px-2 py-1.5" : "gap-1 px-3 py-2";
  const nameCls = compact ? "text-xs font-semibold" : "text-sm font-semibold";
  const statusCls = compact ? "text-[0.75rem]" : "text-sm";
  const metaCls = compact ? "text-[0.65rem]" : "text-xs";

  return (
    <div className={`group flex w-full min-w-0 overflow-hidden ${policiesRowCard}`}>
      <div
        className={`w-[3px] shrink-0 self-stretch rounded-[1px] ${leftBarClass(row)}`}
        aria-hidden
      />
      <div className={`flex min-w-0 flex-1 flex-col ${pad}`}>
        <div className={`break-words ${policiesTextPrimary} ${nameCls}`}>{row.policyVersion}</div>
        <div className={`flex flex-wrap items-center gap-1.5 ${statusCls}`}>
          <PolicyStatusBadge row={row} />
          <span className={policiesTextSecondary}>{statusPhrase(row)}</span>
        </div>
        <div className={`mt-0.5 ${policiesTextMuted} ${metaCls}`}>
          {lastSeen}
          <span className={`mx-1 ${policiesStatSep}`} aria-hidden>
            ·
          </span>
          {row.runCount} run{row.runCount === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

export function policyRegisterSummaryLine(rows: PolicyAggregateRow[]): string {
  const attentionRows = rows.filter((r) => r.status === "attention");
  if (attentionRows.length > 0) {
    return `${rows.length} version(s) · ${attentionRows.length} need review`;
  }
  return `${rows.length} version(s) · no failing prod checks in sample`;
}

type PolicyVersionRegisterProps = {
  rows: PolicyAggregateRow[];
  /** Omit system banner — use when status lives in a parent two-column layout. */
  lanesOnly?: boolean;
};

export function PolicyVersionRegister({ rows, lanesOnly = false }: PolicyVersionRegisterProps) {
  const activeRows = rows.filter((r) => r.tier === "active");
  const staleRows = rows.filter((r) => r.tier === "stale");
  const attentionRows = rows.filter((r) => r.status === "attention");

  const summaryLine = policyRegisterSummaryLine(rows);

  const activeMsg = activeRows.length
    ? `${activeRows.length} in active window`
    : "No active versions";
  const attnMsg = attentionRows.length
    ? `${attentionRows.length} flagged`
    : "No issues detected";
  const histMsg = staleRows.length
    ? `${staleRows.length} in history`
    : "No history rows";

  const activeChildren: ReactNode =
    activeRows.length > 0 ? (
      <>
        {activeRows.map((row) => (
          <PolicyRow key={row.policyVersion} row={row} compact />
        ))}
      </>
    ) : undefined;

  const attnChildren: ReactNode =
    attentionRows.length > 0 ? (
      <>
        {attentionRows.map((row) => (
          <PolicyRow key={`attn-${row.policyVersion}`} row={row} compact />
        ))}
      </>
    ) : undefined;

  const histChildren: ReactNode =
    staleRows.length > 0 ? (
      <>
        {staleRows.map((row) => (
          <PolicyRow key={`stale-${row.policyVersion}`} row={row} compact />
        ))}
      </>
    ) : undefined;

  const lanes: readonly [PoliciesDataLane, PoliciesDataLane, PoliciesDataLane] = [
    {
      id: "policies-lane-active",
      title: "Active",
      summary: activeMsg,
      children: activeChildren,
    },
    {
      id: "policies-lane-attention",
      title: "Needs attention",
      summary: attnMsg,
      children: attnChildren,
    },
    {
      id: "policies-lane-history",
      title: "Version history",
      summary: histMsg,
      children: histChildren,
    },
  ];

  const statusLabel = attentionRows.length > 0 ? "Review" : "OK";
  const statusTone: PoliciesStatusTone = attentionRows.length > 0 ? "review" : "ok";

  const lanesBlock = (
    <PoliciesDataLanes
      lanes={lanes}
      emptyFallback="No policy rows in active, attention, or history lanes yet — run a job to populate the register."
    />
  );

  if (lanesOnly) {
    return <div className="flex w-full min-w-0 flex-col gap-6">{lanesBlock}</div>;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-8">
      <PoliciesSystemStatusCompact
        title="Policy register"
        explanation="Versions and health from your latest 500 runs. Triage “Review” rows in Runs when they appear."
        detail={summaryLine}
        statusLabel={statusLabel}
        statusTone={statusTone}
      />

      {lanesBlock}
    </div>
  );
}
