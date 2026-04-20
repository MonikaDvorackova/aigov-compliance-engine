import type { ReactNode } from "react";

export type ConsoleModuleSurface = "primary" | "secondary" | "inner";

type ConsoleModuleCardProps = {
  eyebrow?: string;
  title: string;
  purpose?: string;
  children: ReactNode;
  surface?: ConsoleModuleSurface;
  /** Inset top accent — draws the eye without loud color */
  emphasis?: boolean;
  className?: string;
};

const surfaceClass: Record<ConsoleModuleSurface, string> = {
  primary: "",
  secondary: "govai-console-module--secondary",
  inner: "govai-console-module--inner",
};

/**
 * Modular console panel — eyebrow, title, optional purpose line, structured body.
 * Uses `globals.css` `.govai-console-module*` for ink-navy borders and layering.
 */
export function ConsoleModuleCard({
  eyebrow,
  title,
  purpose,
  children,
  surface = "primary",
  emphasis = false,
  className = "",
}: ConsoleModuleCardProps) {
  return (
    <section
      className={`govai-console-module px-4 py-5 md:px-5 md:py-[1.35rem] ${surfaceClass[surface]} ${emphasis ? "govai-console-module--emphasis" : ""} ${className}`.trim()}
    >
      {eyebrow ? (
        <p className="text-[0.62rem] font-medium uppercase tracking-[0.18em] [color:var(--govai-text-muted)]">{eyebrow}</p>
      ) : null}
      <h2
        className={`text-[0.95rem] font-semibold tracking-[-0.02em] [color:var(--govai-text-primary)] ${eyebrow ? "mt-2" : ""}`}
      >
        {title}
      </h2>
      {purpose ? (
        <p className="mt-1.5 text-[0.8125rem] font-normal leading-relaxed [color:var(--govai-text-secondary)]">{purpose}</p>
      ) : null}
      <div className={purpose || eyebrow ? "mt-4" : "mt-3"}>{children}</div>
    </section>
  );
}
