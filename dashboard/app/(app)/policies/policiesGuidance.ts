/** Guided onboarding copy for the Policies dashboard (GovAI). */

export type PoliciesOnboardingVariant = "empty" | "stalled";

export const policiesOnboardingTitle = "How it works";

export const policiesOnboardingSteps: Record<PoliciesOnboardingVariant, readonly [string, string, string]> = {
  empty: [
    "Run your first compliance job",
    "Policy versions will be created automatically",
    "Health signals will appear here",
  ],
  stalled: [
    "Restore the runs connection, then refresh",
    "Policy versions appear once runs load successfully",
    "Health signals follow automatically after data lands",
  ],
};
