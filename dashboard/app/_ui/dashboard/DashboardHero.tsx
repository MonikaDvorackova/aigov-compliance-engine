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
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] [color:var(--govai-text-label)]">{kicker}</p>
      ) : null}
      <h1 className="mt-3 max-w-3xl text-[1.875rem] font-semibold leading-[1.12] tracking-[-0.03em] [color:var(--govai-text-primary)] md:text-[2.125rem]">
        {title}
      </h1>
      <p className="mt-5 max-w-2xl text-[0.9375rem] font-normal leading-[1.6] [color:var(--govai-text-secondary)] md:text-[1rem]">
        {description}
      </p>
    </header>
  );
}
