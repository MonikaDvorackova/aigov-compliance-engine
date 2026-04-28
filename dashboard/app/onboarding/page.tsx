import React from "react";
import Link from "next/link";
import Header from "../components/Header";
import { LandingCopyBlock } from "../components/LandingCopyBlock";
import InfraShell from "../_ui/InfraShell";
import { LANDING_SHELL_BACKGROUND } from "../_ui/landingShellBackground";
import { Panel } from "../_ui/console/primitives";
import { primaryCardDescription } from "../_ui/console/surfaces";

const PYPI_VERSION = "0.1.0";
const DOCS_HOSTED_BACKEND_DEPLOYMENT =
  "https://github.com/MonikaDvorackova/aigov-compliance-engine/blob/main/docs/hosted-backend-deployment.md";

export default function OnboardingPage() {
  return (
    <InfraShell maxWidth={720} align="start" padding={20} background={LANDING_SHELL_BACKGROUND}>
      <Header />

      <div style={{ maxWidth: 620, marginLeft: "auto", marginRight: "auto", paddingTop: 2 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ letterSpacing: "0.2em", fontSize: 10, opacity: 0.62, marginBottom: 8 }}>GOVAI</div>
          <h1
            style={{
              margin: 0,
              letterSpacing: "-0.03em",
              fontWeight: 650,
              lineHeight: 1.12,
              fontSize: "clamp(20px, 3.3vw, 28px)",
              color: "var(--govai-text)",
            }}
          >
            Onboarding quickstart
          </h1>
          <p
            style={{
              margin: "10px auto 0",
              maxWidth: "60ch",
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--govai-text-secondary)",
            }}
          >
            Kovali/GovAI is a compliance gate for AI releases: it turns evidence into a deterministic verdict and fails CI
            unless the run is <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>VALID</span>.
            It also exports verifiable JSON so audits are replayable.
          </p>

          <p style={{ margin: "12px 0 0", fontSize: 11.5, lineHeight: 1.45, color: "var(--govai-text-tertiary)" }}>
            <Link href="/" style={{ color: "var(--govai-text-secondary)" }}>
              ← Back to home
            </Link>
          </p>
        </div>

        <Panel
          style={{
            padding: "12px 12px 12px",
            marginTop: 22,
            background: "var(--govai-bg-panel)",
            border: "1px solid var(--govai-border-faint)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 650, color: "var(--govai-text)", marginBottom: 6 }}>
            Hosted onboarding (recommended)
          </div>
          <p style={{ ...primaryCardDescription(), margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.55 }}>
            Use your hosted GovAI audit endpoint and API key, run a deterministic demo, observe{" "}
            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>BLOCKED</span>, submit evidence,
            observe <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>VALID</span>, and export
            verifiable JSON.
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: "var(--govai-text-secondary)",
              fontSize: 12.5,
              lineHeight: 1.55,
            }}
          >
            <li>Base URL</li>
            <li>API key</li>
            <li>Run deterministic demo</li>
            <li>Observe BLOCKED</li>
            <li>Submit evidence</li>
            <li>Observe VALID</li>
            <li>Export JSON</li>
          </ul>
        </Panel>

        <Panel
          style={{
            padding: "12px 12px 12px",
            marginTop: 12,
            background: "var(--govai-bg-panel)",
            border: "1px solid var(--govai-border-faint)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 650, color: "var(--govai-text)", marginBottom: 6 }}>Prerequisites</div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: "var(--govai-text-secondary)",
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            <li>Python + pip (or uv)</li>
            <li>A reachable GovAI audit endpoint (base URL)</li>
            <li>An API key for the audit API</li>
          </ul>
        </Panel>

        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          <div style={{ fontSize: 9.5, fontWeight: 650, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--govai-text-label)" }}>
            1) Install CLI
          </div>
          <LandingCopyBlock label="Install (PyPI)" code={`pip install aigov-py==${PYPI_VERSION}`} />

          <div style={{ fontSize: 9.5, fontWeight: 650, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--govai-text-label)" }}>
            2) Set base URL and API key
          </div>
          <LandingCopyBlock
            label="Environment"
            code={[
              'export GOVAI_AUDIT_BASE_URL="https://YOUR_GOVAI_AUDIT_SERVICE"',
              'export GOVAI_API_KEY="YOUR_API_KEY"',
              "",
              "# One run id for evidence, check, and export",
              'export GOVAI_RUN_ID="$(uuidgen | tr \'[:upper:]\' \'[:lower:]\' 2>/dev/null || python -c \'import uuid;print(uuid.uuid4())\')"',
            ].join("\n")}
          />

          <div style={{ fontSize: 9.5, fontWeight: 650, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--govai-text-label)" }}>
            3) Run demo
          </div>
          <p style={{ ...primaryCardDescription(), margin: "0 0 2px", fontSize: 12, lineHeight: 1.5 }}>
            This demo is hosted-friendly: it produces a BLOCKED verdict first, prints missing evidence, then submits the
            required evidence and returns VALID — ending with an audit JSON export.
          </p>
          <LandingCopyBlock label="Command" code={"govai run demo-deterministic"} />

          <div style={{ fontSize: 9.5, fontWeight: 650, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--govai-text-label)" }}>
            4) See BLOCKED
          </div>
          <LandingCopyBlock
            label="Expected output (snippet)"
            tone="error"
            code={[
              "run_id: <your-run-id>",
              "(3/7) check decision (expect BLOCKED)",
              "verdict: BLOCKED",
              "(4/7) missing evidence:",
              "- evaluation_reported",
              "- risk_reviewed",
              "- human_approved",
            ].join("\n")}
          />

          <div style={{ fontSize: 9.5, fontWeight: 650, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--govai-text-label)" }}>
            5) Add evidence
          </div>
          <p style={{ ...primaryCardDescription(), margin: "0 0 2px", fontSize: 12, lineHeight: 1.5 }}>
            In production, your pipeline appends evidence events (evaluation, risk review, approvals) to the same run id.
            The demo does this for you; the command below shows the manual shape for one event.
          </p>
          <LandingCopyBlock
            label="Manual evidence example"
            code={[
              'govai submit-evidence --run-id "$GOVAI_RUN_ID" \\',
              "  --event-type evaluation_reported \\",
              '  --payload-json \'{"metric":"accuracy","value":0.95,"threshold":0.8,"passed":true}\'',
            ].join("\n")}
          />

          <div style={{ fontSize: 9.5, fontWeight: 650, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--govai-text-label)" }}>
            6) See VALID
          </div>
          <LandingCopyBlock label="Check verdict" code={'govai check --run-id "$GOVAI_RUN_ID"'} />
          <LandingCopyBlock label="Expected output" tone="ok" code={"VALID"} />

          <div style={{ fontSize: 9.5, fontWeight: 650, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--govai-text-label)" }}>
            7) Export audit JSON
          </div>
          <LandingCopyBlock
            label="Export"
            code={['govai export-run --run-id "$GOVAI_RUN_ID" > govai-audit.json', "", "ls -lh govai-audit.json"].join("\n")}
          />
        </div>

        <Panel
          style={{
            padding: "12px 12px 12px",
            marginTop: 18,
            background: "var(--govai-bg-panel)",
            border: "1px solid var(--govai-border-faint)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 650, color: "var(--govai-text)", marginBottom: 6 }}>
            Developer-only: self-host / operator setup (secondary)
          </div>
          <p style={{ ...primaryCardDescription(), margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
            If you need to run the GovAI audit service yourself (Rust + Postgres), follow{" "}
            <a href={DOCS_HOSTED_BACKEND_DEPLOYMENT} target="_blank" rel="noreferrer" style={{ color: "var(--govai-text-secondary)" }}>
              Hosted backend deployment (docs)
            </a>
            .
          </p>
        </Panel>

        <Panel
          style={{
            padding: "12px 12px 12px",
            marginTop: 18,
            background: "var(--govai-bg-panel)",
            border: "1px solid var(--govai-border-faint)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 650, color: "var(--govai-text)", marginBottom: 6 }}>Common errors</div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: "var(--govai-text-secondary)",
              fontSize: 12.5,
              lineHeight: 1.55,
            }}
          >
            <li>
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>Missing GOVAI_AUDIT_BASE_URL</span>{" "}
              or <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>GOVAI_API_KEY</span>: export both
              env vars (or pass <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>--audit-base-url</span>{" "}
              and <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>--api-key</span>).
            </li>
            <li>
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>401 / 403</span>: API key invalid or
              missing permissions.
            </li>
            <li>
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>404</span>: base URL points at the
              wrong host/path (use the audit service base URL, not a docs URL).
            </li>
            <li>
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>run id required</span>: set{" "}
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>GOVAI_RUN_ID</span> or pass{" "}
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>--run-id</span>.
            </li>
          </ul>
        </Panel>
      </div>
    </InfraShell>
  );
}

