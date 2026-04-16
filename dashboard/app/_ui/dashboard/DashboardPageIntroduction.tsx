import type { ReactNode } from "react";

import { dashboardPageIntro } from "./dashboardTokens";

type DashboardPageIntroductionProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Wraps hero + primary actions with consistent gap and a single bottom rule into main content.
 */
export function DashboardPageIntroduction({
  children,
  className = "",
}: DashboardPageIntroductionProps) {
  return (
    <div className={`${dashboardPageIntro} ${className}`.trim()}>{children}</div>
  );
}
