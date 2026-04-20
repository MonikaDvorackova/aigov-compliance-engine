import type { ReactNode } from "react";

type DashboardHeroProps = {
  title: string;
  description: string;
  kicker?: ReactNode;
  showBottomDivider?: boolean;
};

export function DashboardHero({ title, description, kicker, showBottomDivider = true }: DashboardHeroProps) {
  return (
    <header
      className={
        showBottomDivider
          ? "border-b pb-8 md:pb-11 [border-color:var(--govai-border-subtle)]"
          : "pb-0"
      }
    >
      {kicker != null ? (
        <p className="text-[0.62rem] font-medium uppercase tracking-[0.22em] [color:var(--govai-text-muted)]">
          {kicker}
        </p>
      ) : null}
      <h1 className="mt-3 max-w-3xl text-[1.75rem] font-medium leading-[1.15] tracking-[-0.03em] [color:var(--govai-text-primary)] md:text-[2rem]">
        {title}
      </h1>
      <p className="mt-4 max-w-2xl text-[0.9375rem] font-normal leading-[1.55] [color:var(--govai-text-secondary)] md:text-base">
        {description}
      </p>
    </header>
  );
}
