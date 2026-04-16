import type { ReactNode } from "react";
import Link from "next/link";

const primaryBtn = "govai-btn--primary inline-flex";

const secondaryBtn = "govai-btn--secondary inline-flex";

type Action = { label: string; href: string; external?: boolean };

type DashboardActionStripProps = {
  /** Primary — graphite control button (not a marketing CTA). */
  primary: Action;
  /** Outline secondary — subtle border, neutral hover. */
  secondary?: Action;
  /** Tertiary text links (semantic brand color). */
  children?: ReactNode;
  className?: string;
};

export function DashboardActionStrip({ primary, secondary, children, className = "" }: DashboardActionStripProps) {
  const primaryEl =
    primary.external === true ? (
      <a href={primary.href} className={primaryBtn} target="_blank" rel="noreferrer">
        {primary.label}
      </a>
    ) : (
      <Link href={primary.href} className={primaryBtn} prefetch>
        {primary.label}
      </Link>
    );

  return (
    <div
      className={`flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 ${className}`.trim()}
    >
      {primaryEl}
      {secondary ? (
        <Link href={secondary.href} className={secondaryBtn} prefetch>
          {secondary.label}
        </Link>
      ) : null}
      {children}
    </div>
  );
}

export function DashboardTertiaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="govai-link text-sm" prefetch>
      {children}
    </Link>
  );
}
