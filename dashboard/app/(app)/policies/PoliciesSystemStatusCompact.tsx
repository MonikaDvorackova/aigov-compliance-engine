import {
  policiesStatusDot,
  policiesTextMuted,
  policiesTextPrimary,
  policiesTextSecondary,
} from "./policiesTheme";
import type { PoliciesStatusTone } from "./policiesStatusTypes";

type PoliciesSystemStatusCompactProps = {
  title: string;
  explanation: string;
  /** Optional second line (muted). */
  detail?: string;
  statusLabel: string;
  statusTone: PoliciesStatusTone;
};

function dotClass(tone: PoliciesStatusTone): string {
  if (tone === "ok") return policiesStatusDot.positive;
  if (tone === "review" || tone === "stalled") return policiesStatusDot.issue;
  if (tone === "error") return policiesStatusDot.error;
  return policiesStatusDot.neutral;
}

export function PoliciesSystemStatusCompact({
  title,
  explanation,
  detail,
  statusLabel,
  statusTone,
}: PoliciesSystemStatusCompactProps) {
  return (
    <div
      className="flex gap-3 rounded-md border [border-color:var(--govai-border-faint)] bg-[color:var(--govai-bg-card2)] py-2.5 pl-3 pr-2"
      role="status"
    >
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass(statusTone)}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${policiesTextPrimary}`}>{title}</p>
        <p className={`mt-0.5 text-sm leading-snug ${policiesTextMuted}`}>{explanation}</p>
        {detail ? (
          <p className={`mt-1 text-xs leading-snug ${policiesTextMuted}`}>{detail}</p>
        ) : null}
        <p className={`mt-1.5 text-xs ${policiesTextMuted}`}>
          Runs → Policy versions → Health signals · <span className={policiesTextSecondary}>Status:</span>{" "}
          <span className={`font-medium ${policiesTextPrimary}`}>{statusLabel}</span>
        </p>
      </div>
    </div>
  );
}
