import React from "react";
import AigovMark, { type AigovMarkProps } from ".././components/brand/AigovMark";

type Props = {
  children: React.ReactNode;
  maxWidth?: number;
  align?: "start" | "center";
  padding?: number;
};

export default function InfraShell({
  children,
  maxWidth = 980,
  align = "start",
  padding = 22,
}: Props) {
  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: `${padding}px 16px 28px`,
    display: "grid",
    placeItems: align === "center" ? "center" : "start center",
    color: "rgba(255,255,255,0.92)",
    background:
      "radial-gradient(1200px 640px at 50% -10%, rgba(255,255,255,0.10), rgba(0,0,0,0))," +
      "radial-gradient(900px 520px at 50% 12%, rgba(29,78,216,0.12), rgba(0,0,0,0))," +
      "linear-gradient(180deg, rgba(9,16,32,1) 0%, rgba(5,9,18,1) 100%)",
  };

  const shellStyle: React.CSSProperties = {
    width: "100%",
    maxWidth,
  };

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>{children}</div>
    </main>
  );
}

export function InfraPanel({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        marginTop: 10,
        borderRadius: 22,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.04)",
        boxShadow: "0 22px 70px rgba(0,0,0,0.45)",
        padding: 16,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      {children}
    </section>
  );
}

export function InfraCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.03)",
        padding: "14px 12px 14px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {children}
    </div>
  );
}

export function InfraButton({
  children,
  href,
  variant = "default",
  fullWidth = false,
  disabled = false,
}: {
  children: React.ReactNode;
  href?: string;
  variant?: "default" | "soft";
  fullWidth?: boolean;
  disabled?: boolean;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    padding: "0 18px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.18)",
    background: variant === "soft" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    textDecoration: "none",
    fontSize: 17,
    fontWeight: 600,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 40px rgba(0,0,0,0.30)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    width: fullWidth ? "100%" : undefined,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    userSelect: "none",
  };

  if (href) {
    return (
      <a href={href} style={base} aria-disabled={disabled}>
        {children}
      </a>
    );
  }

  return (
    <span style={base} aria-disabled={disabled}>
      {children}
    </span>
  );
}

export function InfraHeaderRow({
  left,
  right,
  height = 64,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  height?: number;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height,
        padding: "0 2px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{left}</div>
      {right ? <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{right}</div> : null}
    </header>
  );
}

export function InfraAigovMark({
  href = "/",
  size = "lg",
  isRunning = false,
  alignY = 0,
}: {
  href?: string;
  size?: "md" | "lg" | "xl";
  isRunning?: boolean;
  alignY?: number;
}) {
  const dims =
    size === "xl"
      ? { w: 200, h: 60 }
      : size === "lg"
        ? { w: 180, h: 54 }
        : { w: 160, h: 48 };

  const wrap: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    textDecoration: "none",
    transform: `translateY(${alignY}px)`,
    padding: "6px 10px",
    borderRadius: 14,
    userSelect: "none",
    cursor: "pointer",
  };

  const hoverTransition: React.CSSProperties = {
    transition: "transform 160ms ease, filter 160ms ease",
  };

  const subtleBg: React.CSSProperties = {
    background: "radial-gradient(120px 44px at 50% 60%, rgba(59,130,246,0.18), rgba(0,0,0,0))",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const markProps: AigovMarkProps = {
    isRunning,
    width: dims.w,
    height: dims.h,
    style: {
      display: "block",
      overflow: "visible",
      filter:
        "drop-shadow(0 0 14px rgba(96,165,250,0.34)) drop-shadow(0 0 28px rgba(59,130,246,0.22))",
    },
  };

  return (
    <a
      href={href}
      aria-label="GovAI"
      style={{ ...wrap, ...hoverTransition, ...subtleBg }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.10)";
        (e.currentTarget as HTMLAnchorElement).style.transform = `translateY(${alignY}px) scale(1.01)`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.filter = "none";
        (e.currentTarget as HTMLAnchorElement).style.transform = `translateY(${alignY}px) scale(1)`;
      }}
    >
      <AigovMark {...markProps} />
    </a>
  );
}

export function InfraBrandMark({
  href = "/",
  size = "lg",
  alignY = 0,
}: {
  href?: string;
  size?: "md" | "lg" | "xl";
  alignY?: number;
}) {
  const textSize = size === "xl" ? 30 : size === "lg" ? 26 : 22;

  const wrap: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    transform: `translateY(${alignY}px)`,
    textDecoration: "none",
    color: "inherit",
    userSelect: "none",
  };

  const word: React.CSSProperties = {
    fontSize: textSize,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "baseline",
    gap: 2,
  };

  const gov: React.CSSProperties = {
    color: "rgba(255,255,255,0.92)",
  };

  const ai: React.CSSProperties = {
    color: "rgba(147,197,253,0.98)",
    textShadow: "0 0 10px rgba(96,165,250,0.55), 0 0 22px rgba(59,130,246,0.35)",
  };

  const dot: React.CSSProperties = {
    width: size === "xl" ? 8 : size === "lg" ? 7 : 6,
    height: size === "xl" ? 8 : size === "lg" ? 7 : 6,
    borderRadius: 999,
    background: "rgba(147,197,253,0.95)",
    boxShadow: "0 0 10px rgba(96,165,250,0.55), 0 0 24px rgba(59,130,246,0.35)",
    marginLeft: 6,
    transform: "translateY(-1px)",
  };

  const bracket: React.CSSProperties = {
    fontSize: Math.round(textSize * 0.92),
    fontWeight: 600,
    color: "rgba(255,255,255,0.40)",
    lineHeight: 1,
  };

  const hitArea: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 14,
  };

  const hover: React.CSSProperties = {
    transition: "transform 160ms ease, filter 160ms ease",
  };

  return (
    <a
      href={href}
      style={{ ...wrap, ...hitArea, ...hover }}
      aria-label="GovAI"
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.08)";
        (e.currentTarget as HTMLAnchorElement).style.transform = `translateY(${alignY}px) scale(1.01)`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.filter = "none";
        (e.currentTarget as HTMLAnchorElement).style.transform = `translateY(${alignY}px) scale(1)`;
      }}
    >
      <span style={bracket} aria-hidden="true">
        [
      </span>
      <span style={word}>
        <span style={gov}>Gov</span>
        <span style={ai}>AI</span>
        <span style={dot} aria-hidden="true" />
      </span>
      <span style={bracket} aria-hidden="true">
        ]
      </span>
    </a>
  );
}