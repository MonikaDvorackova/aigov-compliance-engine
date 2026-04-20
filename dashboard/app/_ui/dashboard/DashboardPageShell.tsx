import type { ReactNode } from "react";

/** Max-width content column for console pages (Runs, Policies, Evidence). */
export function DashboardPageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6 md:py-7">{children}</div>;
}
