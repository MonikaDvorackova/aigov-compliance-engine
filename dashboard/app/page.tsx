import Link from "next/link";

export const dynamic = "force-dynamic";

export default function DashboardHomePage() {
  const blue = "#1D4ED8";
  const iconGlow =
    "drop-shadow(0 0 8px rgba(59,130,246,0.90)) drop-shadow(0 0 18px rgba(59,130,246,0.65)) drop-shadow(0 0 40px rgba(29,78,216,0.45))";

  const shellBg =
    "radial-gradient(1200px 520px at 50% 8%, rgba(255,255,255,0.08), rgba(0,0,0,0) 60%), radial-gradient(900px 520px at 20% 28%, rgba(29,78,216,0.10), rgba(0,0,0,0) 55%), radial-gradient(900px 520px at 82% 42%, rgba(255,255,255,0.06), rgba(0,0,0,0) 55%)";

  const cardBorder = "1px solid rgba(255,255,255,0.14)";
  const cardBg = "rgba(255,255,255,0.03)";

  function IconShield({ size = 18, color = blue }: { size?: number; color?: string }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill={color}
          d="M12 2.5 20 6v7.2c0 5.02-3.45 8.83-8 10.3-4.55-1.47-8-5.28-8-10.3V6l8-3.5Zm0 2.2L6 7.3v5.9c0 3.86 2.49 7.02 6 8.32 3.51-1.3 6-4.46 6-8.32V7.3l-6-2.6Zm-1.1 12.2 6.2-6.2 1.4 1.4-7.6 7.6-3.9-3.9 1.4-1.4 2.5 2.5Z"
        />
      </svg>
    );
  }

  function IconList({ size = 18, color = blue }: { size?: number; color?: string }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill={color}
          d="M4 6.5h2v2H4v-2Zm4 0h12v2H8v-2ZM4 11h2v2H4v-2Zm4 0h12v2H8v-2ZM4 15.5h2v2H4v-2Zm4 0h12v2H8v-2Z"
        />
      </svg>
    );
  }

  function IconBolt({ size = 18, color = blue }: { size?: number; color?: string }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill={color}
          d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"
        />
      </svg>
    );
  }

  function IconUpload({ size = 18, color = blue }: { size?: number; color?: string }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill={color}
          d="M12 3 7 8h3v6h4V8h3l-5-5Zm-7 15h14v2H5v-2Z"
        />
      </svg>
    );
  }

  function CTAButton({
    href,
    title,
    subtitle,
    icon,
    primary = false,
  }: {
    href: string;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    primary?: boolean;
  }) {
    return (
      <Link
        href={href}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 12px",
          borderRadius: 14,
          border: primary ? "1px solid rgba(59,130,246,0.38)" : "1px solid rgba(255,255,255,0.16)",
          background: primary ? "rgba(59,130,246,0.10)" : "rgba(255,255,255,0.04)",
          textDecoration: "none",
          color: "white",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
          transition: "transform 120ms ease, background 120ms ease, border-color 120ms ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-flex", filter: iconGlow }}>{icon}</span>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>{subtitle}</div>
          </div>
        </div>
        <span style={{ opacity: 0.7, fontSize: 14 }}>→</span>
      </Link>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: shellBg,
        padding: 18,
        display: "grid",
        placeItems: "center",
      }}
    >
      <style>{`
        a[data-cta="1"]:hover { transform: translateY(-1px); background: rgba(255,255,255,0.055); border-color: rgba(255,255,255,0.22); }
        a[data-cta="1"]:active { transform: translateY(0px); background: rgba(255,255,255,0.045); }
        a:hover { color: rgba(255,255,255,0.96); }
      `}</style>

      <div style={{ width: "100%", maxWidth: 980, textAlign: "center" }}>
        <div style={{ opacity: 0.75, fontSize: 12, letterSpacing: "0.08em" }}>AIGOV</div>

        <h1
          style={{
            margin: 0,
            marginTop: 10,
            fontSize: 42,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
          }}
        >
          Compliance Evidence Dashboard
        </h1>

        <p style={{ marginTop: 12, marginBottom: 18, opacity: 0.78, fontSize: 14 }}>
          Generate runs, verify integrity, and ship auditable evidence bundles.
        </p>

        <div
          style={{
            margin: "0 auto",
            borderRadius: 18,
            border: cardBorder,
            background: cardBg,
            boxShadow: "0 18px 60px rgba(0,0,0,0.40)",
            padding: 16,
            textAlign: "left",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <Link
                href="/runs"
                style={{
                  display: "block",
                  padding: "14px 14px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.05)",
                  textDecoration: "none",
                  color: "white",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ display: "inline-flex", filter: iconGlow }}>
                    <IconList />
                  </span>
                  <div style={{ display: "grid", gap: 2 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>
                      Open runs
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.72 }}>
                      Browse recent runs, inspect hashes, and open run detail.
                    </div>
                  </div>
                </div>
              </Link>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Link
                  href="/login"
                  style={{
                    display: "block",
                    padding: "12px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.04)",
                    textDecoration: "none",
                    color: "white",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "inline-flex", filter: iconGlow }}>
                      <IconShield />
                    </span>
                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 750 }}>Sign in</div>
                      <div style={{ fontSize: 12, opacity: 0.72 }}>Authenticate to view private runs.</div>
                    </div>
                  </div>
                </Link>

                <Link
                  href="/"
                  style={{
                    display: "block",
                    padding: "12px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.04)",
                    textDecoration: "none",
                    color: "white",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "inline-flex", filter: iconGlow }}>
                      <IconBolt />
                    </span>
                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 750 }}>Overview</div>
                      <div style={{ fontSize: 12, opacity: 0.72 }}>What this dashboard is for.</div>
                    </div>
                  </div>
                </Link>
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "2px 0" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Link
                href="/runs"
                data-cta="1"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.04)",
                  textDecoration: "none",
                  color: "white",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "inline-flex", filter: iconGlow }}>
                    <IconList />
                  </span>
                  <div style={{ display: "grid", gap: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 750 }}>Runs</div>
                    <div style={{ fontSize: 12, opacity: 0.72 }}>List and detail</div>
                  </div>
                </div>
                <span style={{ opacity: 0.7, fontSize: 14 }}>→</span>
              </Link>

              <Link
                href="/runs"
                data-cta="1"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.04)",
                  textDecoration: "none",
                  color: "white",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "inline-flex", filter: iconGlow }}>
                    <IconUpload />
                  </span>
                  <div style={{ display: "grid", gap: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 750 }}>Artifacts</div>
                    <div style={{ fontSize: 12, opacity: 0.72 }}>Packs and hashes</div>
                  </div>
                </div>
                <span style={{ opacity: 0.7, fontSize: 14 }}>→</span>
              </Link>
            </div>

            <div style={{ marginTop: 4, opacity: 0.55, fontSize: 12, textAlign: "center" }}>
              Minimal surface, strong guarantees. Everything is hashed. Everything is traceable.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
