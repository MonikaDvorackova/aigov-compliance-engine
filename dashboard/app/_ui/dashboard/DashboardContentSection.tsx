import type { ReactNode } from "react";

type DashboardContentSectionProps = {
  children: ReactNode;
  /** @deprecated Sections use card surfaces; page stack handles rhythm. */
  withDivider?: boolean;
  /** Applied to the outer `<section>`. */
  className?: string;
};

/**
 * Wraps content in a raised section card (semantic border + elevated surface).
 */
export function DashboardContentSection({ children, className = "" }: DashboardContentSectionProps) {
  return (
    <section className={className.trim()}>
      <div className="govai-section-card">{children}</div>
    </section>
  );
}
