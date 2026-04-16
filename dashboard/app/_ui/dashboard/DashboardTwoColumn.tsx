import type { ReactNode } from "react";

type DashboardTwoColumnProps = {
  left: ReactNode;
  right: ReactNode;
  className?: string;
};

/** Desktop: problem / context left · status / metadata right. Stacks on small screens. */
export function DashboardTwoColumn({ left, right, className = "" }: DashboardTwoColumnProps) {
  return (
    <div className={`grid gap-8 lg:grid-cols-2 lg:gap-10 lg:items-start ${className}`}>
      <div className="min-w-0">{left}</div>
      <div className="min-w-0">{right}</div>
    </div>
  );
}
