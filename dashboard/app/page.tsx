import Link from "next/link";

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

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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
    <main className="page">
      <div className="shell">
        <div className="hero">
          <div className="kicker">AIGOV</div>

          <h1 className="h1">
            Compliance Evidence
            <br />
            Dashboard
          </h1>

          <p className="sub">
            Generate runs, verify integrity, and ship auditable evidence bundles.
          </p>

          <div className="ctaRow">
            <Link className="btn" href="/runs">
              Open runs
            </Link>
            <Link className={cx("btn", "btnSoft")} href="/login">
              Sign in
            </Link>
          </div>
        </div>

        <section className="panel">
          <div className="grid">
            {features.map((f) => (
              <div key={f.title} className="card">
                <div className="iconPill" aria-hidden="true">
                  <span className="icon">{f.icon}</span>
                </div>
                <div className="cardTitle">{f.title}</div>
                <div className="cardDesc">{f.description}</div>
              </div>
            ))}
          </div>

          <div className="footerLine">
            Minimal surface, strong guarantees. Everything is hashed.
            <br />
            Everything is traceable.
          </div>
        </section>
      </div>

      <style>{`
        .page {
          min-height: 100vh;
          padding: 22px 16px 28px;
          display: grid;
          place-items: start center;
          color: rgba(255,255,255,0.92);
          background:
            radial-gradient(1200px 640px at 50% -10%, rgba(255,255,255,0.10), rgba(0,0,0,0)),
            radial-gradient(900px 520px at 50% 12%, rgba(29,78,216,0.12), rgba(0,0,0,0)),
            linear-gradient(180deg, rgba(9,16,32,1) 0%, rgba(5,9,18,1) 100%);
        }

        .shell {
          width: 100%;
          max-width: 980px;
        }

        .hero {
          text-align: center;
          padding-top: 8px;
        }

        .kicker {
          letter-spacing: 0.28em;
          font-size: 12px;
          opacity: 0.72;
          margin-bottom: 10px;
        }

        .h1 {
          margin: 0;
          letter-spacing: -0.03em;
          font-weight: 500;
          line-height: 1.06;
          font-size: clamp(34px, 7.6vw, 60px);
          text-wrap: balance;
        }

        .sub {
          margin: 14px auto 16px;
          max-width: 42ch;
          opacity: 0.78;
          font-size: clamp(14px, 3.6vw, 18px);
          line-height: 1.45;
          text-wrap: balance;
        }

        .ctaRow {
          display: flex;
          gap: 12px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          margin-top: 10px;
          margin-bottom: 18px;
        }

        .btn {
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
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.10),
            0 18px 40px rgba(0,0,0,0.30);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .btnSoft {
          background: rgba(255,255,255,0.04);
        }

        .panel {
          margin-top: 10px;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.04);
          box-shadow: 0 22px 70px rgba(0,0,0,0.45);
          padding: 16px;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .card {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.03);
          padding: 14px 12px 14px;
          text-align: center;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
          min-height: 162px;
          display: grid;
          align-content: start;
          justify-items: center;
        }

        .iconPill {
          width: 54px;
          height: 54px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(29,78,216,0.10);
          box-shadow:
            0 0 28px rgba(29,78,216,0.26),
            inset 0 1px 0 rgba(255,255,255,0.10);
          display: grid;
          place-items: center;
          margin-bottom: 10px;
        }

        .icon {
          color: ${accent};
          filter: drop-shadow(0 0 10px rgba(29,78,216,0.55));
        }

        .cardTitle {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.01em;
          margin-bottom: 6px;
        }

        .cardDesc {
          font-size: 14px;
          opacity: 0.76;
          line-height: 1.42;
          max-width: 18ch;
          text-wrap: balance;
        }

        .footerLine {
          text-align: center;
          margin-top: 14px;
          font-size: 13px;
          opacity: 0.70;
          line-height: 1.45;
        }

        @media (max-width: 420px) {
          .page {
            padding: 18px 14px 24px;
          }

          .panel {
            padding: 14px;
          }

          .grid {
            gap: 12px;
          }

          .card {
            padding: 12px 10px 12px;
            min-height: 152px;
          }

          .iconPill {
            width: 50px;
            height: 50px;
            border-radius: 15px;
          }

          .cardTitle {
            font-size: 17px;
          }

          .cardDesc {
            font-size: 13px;
          }

          .btn {
            height: 44px;
            font-size: 16px;
            padding: 0 16px;
          }
        }

        @media (min-width: 760px) {
          .panel {
            padding: 18px;
          }

          .grid {
            gap: 16px;
          }

          .card {
            min-height: 176px;
            padding: 16px 14px 16px;
          }

          .cardTitle {
            font-size: 20px;
          }

          .cardDesc {
            font-size: 14px;
            max-width: 20ch;
          }
        }
      `}</style>
    </main>
  );
}
