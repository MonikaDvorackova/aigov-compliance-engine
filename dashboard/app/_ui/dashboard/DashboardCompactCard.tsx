import type { ReactNode } from "react";

/** Secondary surfaces: queue, register, lists — inside section cards. */
export function DashboardCompactCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-[10px] border bg-[color:var(--govai-bg-card)] [border-color:var(--govai-border-ink)] ${className}`}
    >
      {children}
    </div>
  );
}
