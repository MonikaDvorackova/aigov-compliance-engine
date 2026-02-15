import Link from "next/link";

function IconList({ size = 20, color = "#1D4ED8" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={color}
        d="M4 6.5h14a1 1 0 0 0 0-2H4a1 1 0 0 0 0 2Zm0 6h14a1 1 0 0 0 0-2H4a1 1 0 0 0 0 2Zm0 6h14a1 1 0 0 0 0-2H4a1 1 0 0 0 0 2Z"
      />
    </svg>
  );
}

function IconShield({ size = 20, color = "#1D4ED8" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={color}
        d="M12 2.25c.18 0 .36.04.53.12l7 3.2c.52.24.85.76.85 1.33v5.72c0 4.54-2.86 8.66-7.13 10.27a1.6 1.6 0 0 1-1.1 0C7.88 21.28 5 17.16 5 12.62V6.9c0-.57.33-1.09.85-1.33l7-3.2c.17-.08.35-.12.53-.12Zm0 2.06L7 6.55v6.07c0 3.7 2.32 7.04 5.84 8.38a.4.4 0 0 0 .32 0C16.68 19.66 19 16.32 19 12.62V6.55l-7-2.24Z"
      />
    </svg>
  );
}

function IconBolt({ size = 20, color = "#1D4ED8" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={color}
        d="M13 2a1 1 0 0 1 .95 1.32L12.53 8H18a1 1 0 0 1 .78 1.63l-8 10A1 1 0 0 1 9 19l1.42-6H6a1 1 0 0 1-.78-1.63l7-9A1 1 0 0 1 13 2Z"
      />
    </svg>
  );
}

function IconDownload({ size = 20, color = "#1D4ED8" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={color}
        d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V4a1 1 0 0 1 1-1Zm-7 16a1 1 0 0 1 1-1h12a1 1 0 0 1 0 2H6a1 1 0 0 1-1-1Z"
      />
    </svg>
  );
}

function GlowIcon({
  children,
  glow = "rgba(29,78,216,0.55)",
}: {
  children: React.ReactNode;
  glow?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 44,
        height: 44,
        borderRadius: 14,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 12px 38px rgba(0,0,0,0.35), 0 0 22px ${glow}`,
      }}
    >
      {children}
    </span>
  );
}

function FeatureCard({
  title,
  description,
  icon,
  href,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const Inner = (
    <div
      style={{
        height: "100%",
        padding: 16,
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(255,255,255,0.05)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        display: "grid",
        gridTemplateColumns: "52px 1fr",
        gap: 12,
        alignItems: "start",
      }}
    >
      <div style={{ marginTop: 2 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: "-0.01em" }}>{title}</div>
        <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.45, opacity: 0.78 }}>
          {description}
        </div>
      </div>
    </div>
  );

  if (!href) return Inner;

  return (
    <Link
      href={href}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {Inner}
    </Link>
  );
}

export default function HomePage() {
  const blue = "#1D4ED8";

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(900px 520px at 50% 0%, rgba(29,78,216,0.16), rgba(0,0,0,0)), radial-gradient(900px 520px at 50% 28%, rgba(255,255,255,0.10), rgba(0,0,0,0))",
        padding: "clamp(18px, 4vw, 40px)",
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          display: "grid",
          gap: "clamp(14px, 2.5vw, 26px)",
          justifyItems: "center",
          textAlign: "center",
        }}
      >
        <div style={{ marginTop: "clamp(18px, 4vw, 44px)" }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.18em",
              opacity: 0.7,
              textTransform: "uppercase",
            }}
          >
            AIGOV
          </div>

          <h1
            style={{
              margin: "12px 0 0 0",
              fontSize: "clamp(34px, 7.5vw, 72px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.03,
            }}
          >
            Compliance Evidence
            <br />
            Dashboard
          </h1>

          <p
            style={{
              margin: "clamp(12px, 2.4vw, 18px) auto 0 auto",
              maxWidth: 760,
              fontSize: "clamp(14px, 2.6vw, 18px)",
              lineHeight: 1.5,
              opacity: 0.78,
            }}
          >
            Generate runs, verify integrity, and ship auditable evidence bundles.
          </p>

          <div
            style={{
              marginTop: "clamp(16px, 3vw, 22px)",
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/runs"
              style={{
                textDecoration: "none",
                color: "white",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 48,
                padding: "0 18px",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.20)",
                background: "rgba(255,255,255,0.06)",
                boxShadow: `0 0 24px rgba(29,78,216,0.22), inset 0 1px 0 rgba(255,255,255,0.08)`,
                fontSize: 16,
                fontWeight: 650,
              }}
            >
              Open runs
            </Link>

            <Link
              href="/login"
              style={{
                textDecoration: "none",
                color: "rgba(255,255,255,0.90)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 48,
                padding: "0 18px",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(0,0,0,0.20)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Sign in
            </Link>
          </div>
        </div>

        <div
          style={{
            width: "min(980px, 100%)",
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.06)",
            boxShadow: "0 26px 90px rgba(0,0,0,0.45)",
            padding: "clamp(14px, 3vw, 22px)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: -2,
              background:
                "radial-gradient(520px 220px at 15% 15%, rgba(29,78,216,0.22), rgba(0,0,0,0)), radial-gradient(520px 220px at 85% 35%, rgba(255,255,255,0.12), rgba(0,0,0,0))",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "clamp(10px, 2.2vw, 14px)",
              }}
            >
              <FeatureCard
                title="Open runs"
                description="Browse recent runs, inspect hashes, and open run detail."
                href="/runs"
                icon={
                  <GlowIcon glow="rgba(29,78,216,0.65)">
                    <IconList color={blue} />
                  </GlowIcon>
                }
              />

              <FeatureCard
                title="Sign in"
                description="Authenticate to access private runs and protected artifacts."
                href="/login"
                icon={
                  <GlowIcon glow="rgba(29,78,216,0.65)">
                    <IconShield color={blue} />
                  </GlowIcon>
                }
              />

              <FeatureCard
                title="Integrity"
                description="Mode, status, hashes, and close timestamp in one place."
                icon={
                  <GlowIcon glow="rgba(29,78,216,0.55)">
                    <IconBolt color={blue} />
                  </GlowIcon>
                }
              />

              <FeatureCard
                title="Artifacts"
                description="Evidence pack, audit JSON, and evidence JSON ready to ship."
                icon={
                  <GlowIcon glow="rgba(29,78,216,0.55)">
                    <IconDownload color={blue} />
                  </GlowIcon>
                }
              />
            </div>

            <div
              style={{
                marginTop: "clamp(14px, 2.8vw, 18px)",
                opacity: 0.72,
                fontSize: "clamp(12px, 2.2vw, 14px)",
                textAlign: "center",
              }}
            >
              Minimal surface, strong guarantees. Everything is hashed. Everything is traceable.
            </div>
          </div>

          <style>{`
            @media (max-width: 720px) {
              div[data-grid="features"] {
                grid-template-columns: 1fr;
              }
            }
          `}</style>
        </div>

        <div style={{ height: 12 }} />
      </div>

      <style>{`
        :root { color-scheme: dark; }
        body { margin: 0; background: #000; color: #fff; }
        * { box-sizing: border-box; }
        @media (max-width: 720px) {
          main { padding-left: 16px; padding-right: 16px; }
        }
      `}</style>
    </main>
  );
}
