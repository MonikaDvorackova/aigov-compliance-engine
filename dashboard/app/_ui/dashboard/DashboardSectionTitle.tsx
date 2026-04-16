import type { ReactNode } from "react";

type DashboardSectionTitleProps = {
  children: ReactNode;
  id?: string;
};

export function DashboardSectionTitle({ children, id }: DashboardSectionTitleProps) {
  return (
    <h2
      id={id}
      className="text-xs font-semibold uppercase tracking-widest [color:var(--govai-text-label)]"
    >
      {children}
    </h2>
  );
}
