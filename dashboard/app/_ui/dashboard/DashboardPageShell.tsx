import type { ReactNode } from "react";

export function DashboardPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 md:px-6 md:pt-8">
      {children}
    </div>
  );
}
