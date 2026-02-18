import React from "react";
import Link from "next/link";
import InfraShell, { InfraPanel } from "./_ui/InfraShell";

type Feature = {
  title: string;
  description: string;
  icon: React.ReactNode;
};

function IconList({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 7h15M6 12h15M6 17h15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M3.2 7h.1M3.2 12h.1M3.2 17h.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconShield({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.4l7 3.2v6.3c0 5-3.2 9.4-7 10.7-3.8-1.3-7-5.7-7-10.7V5.6l7-3.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBolt({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M13 2L3 14h8l-1 8 11-14h-8l0-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDownload({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M8 11l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 20h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Page() {
  const accent = "#1D4ED8";

  const features: Feature[] = [
    {
      title: "Open runs",
      description: "Browse recent runs, inspect hashes, and open run detail.",
      icon: <IconList />,
    },
    {
      title: "Sign in",
      description: "Authenticate to access private runs and protected artifacts.",
      icon: <IconShield />,
    },
    {
      title: "Integrity",
      description: "Mode, status, hashes, and close timestamp in one place.",
      icon: <IconBolt />,
    },
    {
      title: "Artifacts",
      description: "Evidence pack, audit JSON, and evidence JSON ready to ship.",
      icon: <IconDownload />,
    },
  ];

  return (
    <InfraShell maxWidth={980} align="start">
      <div style={{ textAlign: "center", paddingTop: 8 }}>
        <div style={{ letterSpacing: "0.28em", fontSize: 12, opacity: 0.72, marginBottom: 10 }}>GOVAI</div>

        <h1
          style={{
            margin: 0,
            letterSpacing: "-0.03em",
            fontWeight: 500,
            lineHeight: 1.06,
            fontSize: "clamp(34px, 7.6vw, 60px)",
            textWrap: "balance",
          }}
        >
          Compliance Evidence
          <br />
          Dashboard
        </h1>

        <p
          style={{
            margin: "14px auto 16px",
            maxWidth: "42ch",
            opacity: 0.78,
            fontSize: "clamp(14px, 3.6vw, 18px)",
            lineHeight: 1.45,
            textWrap: "balance",
          }}
        >
          Generate runs, verify integrity, and ship auditable evidence bundles.
        </p>

        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 10,
            marginBottom: 18,
          }}
        >
          <Link className="govai_btn" href="/runs">
            Open runs
          </Link>
          <Link className="govai_btn govai_btnSoft" href="/login">
            Sign in
          </Link>
        </div>
      </div>

      <InfraPanel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.03)",
                padding: "14px 12px 14px",
                textAlign: "center",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                minHeight: 162,
                display: "grid",
                alignContent: "start",
                justifyItems: "center",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(29,78,216,0.10)",
                  boxShadow:
                    "0 0 28px rgba(29,78,216,0.26), inset 0 1px 0 rgba(255,255,255,0.10)",
                  display: "grid",
                  placeItems: "center",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    color: accent,
                    filter: "drop-shadow(0 0 10px rgba(29,78,216,0.55))",
                    display: "inline-flex",
                  }}
                >
                  {f.icon}
                </span>
              </div>

              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 6 }}>
                {f.title}
              </div>
              <div
                style={{
                  fontSize: 14,
                  opacity: 0.76,
                  lineHeight: 1.42,
                  maxWidth: "18ch",
                  textWrap: "balance",
                }}
              >
                {f.description}
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, opacity: 0.7, lineHeight: 1.45 }}>
          Minimal surface, strong guarantees. Everything is hashed.
          <br />
          Everything is traceable.
        </div>
      </InfraPanel>

      <style>{`
        .govai_btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 46px;
          padding: 0 18px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          text-decoration: none;
          font-size: 17px;
          font-weight: 600;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 40px rgba(0,0,0,0.30);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .govai_btnSoft { background: rgba(255,255,255,0.04); }
        .govai_btn:hover { transform: translateY(-1px); }
        .govai_btn:active { transform: translateY(0px); }
        @media (max-width: 520px) {
          .govai_btn { height: 44px; font-size: 16px; padding: 0 16px; }
        }
      `}</style>
    </InfraShell>
  );
}
