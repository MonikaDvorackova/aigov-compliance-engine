import React from "react";

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
