import Link from "next/link";
import {
  policiesEmptyHeadline,
  policiesPipelineStatus,
  type PoliciesRegisterLoadState,
} from "./policiesInterpretation";
import { policiesLink, policiesTextMuted } from "./policiesTheme";
import type { PoliciesStatusTone } from "./policiesStatusTypes";
import { PoliciesSystemStatusCompact } from "./PoliciesSystemStatusCompact";

export type PoliciesEmptyBodyVariant = PoliciesRegisterLoadState;

export function PoliciesEmptyBody({ variant }: { variant: PoliciesEmptyBodyVariant }) {
  const headline = policiesEmptyHeadline[variant];
  const status = policiesPipelineStatus[variant];
  const statusTone: PoliciesStatusTone = variant === "unavailable" ? "stalled" : "neutral";

  const detail =
    variant === "no_runs"
      ? "No policy versions or validation signals in this window yet."
      : "Fix connectivity or permissions, then reload.";

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PoliciesSystemStatusCompact
        title={headline.title}
        explanation={headline.body}
        detail={detail}
        statusLabel={status}
        statusTone={statusTone}
      />

      <p className={`text-xs ${policiesTextMuted}`}>
        Rows mirror runs only.{" "}
        <Link href="/evidence" className={policiesLink}>
          Evidence
        </Link>
      </p>
    </div>
  );
}
