import { DashboardSectionHeader } from "@/app/_ui/dashboard";
import { policiesTextMuted } from "./policiesTheme";
import {
  policiesOnboardingSteps,
  policiesOnboardingTitle,
  type PoliciesOnboardingVariant,
} from "./policiesGuidance";

type PoliciesOnboardingPanelProps = {
  variant: PoliciesOnboardingVariant;
};

/**
 * Lightweight vertical steps — no card, no accent chrome.
 */
export function PoliciesOnboardingPanel({ variant }: PoliciesOnboardingPanelProps) {
  const steps = policiesOnboardingSteps[variant];

  return (
    <section className="pt-0" aria-labelledby="policies-onboarding-title">
      <DashboardSectionHeader
        id="policies-onboarding-title"
        eyebrow="Guidance"
        title={policiesOnboardingTitle}
      />
      <ol className={`mt-4 list-decimal space-y-2 pl-5 text-sm leading-snug ${policiesTextMuted}`}>
        {steps.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ol>
      <p className={`mt-3 text-xs ${policiesTextMuted}`}>Versions follow automatically from runs.</p>
    </section>
  );
}
