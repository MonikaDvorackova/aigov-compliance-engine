import type { ReactNode } from "react";

import {
  dashboardEyebrow,
  dashboardSectionHeadline,
  dashboardSectionIntro,
} from "./dashboardTokens";

type DashboardSectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  id?: string;
  className?: string;
};

export function DashboardSectionHeader({
  eyebrow,
  title,
  description,
  id,
  className = "",
}: DashboardSectionHeaderProps) {
  return (
    <header className={`mb-7 md:mb-9 ${className}`.trim()}>
      {eyebrow ? <p className={dashboardEyebrow}>{eyebrow}</p> : null}
      <h2
        id={id}
        className={`${dashboardSectionHeadline} ${eyebrow ? "mt-2.5" : ""}`.trim()}
      >
        {title}
      </h2>
      {description ? (
        <div className={`mt-2.5 ${dashboardSectionIntro}`.trim()}>{description}</div>
      ) : null}
    </header>
  );
}
