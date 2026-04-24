import React from "react";
import Link from "next/link";
import AigovMark from "./components/brand/AigovMark";
import {
  CapabilityProofStrip,
  EvidenceBundlesSecondary,
  EvidenceLedgerHero,
  PolicyEnforcementSecondary,
} from "./_ui/console/CapabilityPrimaryPanel";
import { Panel } from "./_ui/console/primitives";
import { primaryCardDescription } from "./_ui/console/surfaces";
import InfraShell from "./_ui/InfraShell";
import { LandingCopyBlock } from "./components/LandingCopyBlock";

/** Muted shell — no chromatic gradients; optional neutral lift only */
const LANDING_SHELL_BACKGROUND = [
  "radial-gradient(900px 480px at 50% -8%, rgba(255,255,255,0.035) 0%, transparent 58%)",
  "var(--govai-bg-app)",
].join(", ");

const PROOF_ITEMS = [
  { label: "Compliance Summary", detail: "Deterministic verdict from evidence" },
  { label: "Replayable state", detail: "Deterministic replay from ledger" },
  { label: "Audit export", detail: "Verifiable JSON output" },
] as const;

export default function Page() {
  return (
    <InfraShell maxWidth={720} align="start" padding={20} background={LANDING_SHELL_BACKGROUND}>
      <div className="govai_landing_hero" style={{ textAlign: "center", paddingTop: 2 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <span style={{ display: "inline-flex", lineHeight: 0 }}>
            <AigovMark size={30} glow={false} neon={false} neonStrength="off" tone="steel" isRunning={false} />
          </span>
        </div>
        <div style={{ letterSpacing: "0.2em", fontSize: 10, opacity: 0.62, marginBottom: 8 }}>GOVAI</div>

        <h1
          style={{
            margin: 0,
            letterSpacing: "-0.03em",
            fontWeight: 600,
            lineHeight: 1.12,
            fontSize: "clamp(22px, 3.6vw, 30px)",
            color: "var(--govai-text)",
          }}
        >
          Ship AI only when it passes a compliance gate
        </h1>

        <p
          style={{
            margin: "8px auto 0",
            maxWidth: "48ch",
            fontSize: 13,
            lineHeight: 1.45,
            color: "var(--govai-text-secondary)",
          }}
        >
          GovAI blocks your CI unless the run has valid evidence and approval
        </p>

        <div
          style={{
            marginTop: 36,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 960,
              borderRadius: 10,
              border: "1px solid var(--govai-border-faint)",
              background: "var(--govai-bg-elevated)",
              overflow: "hidden",
            }}
          >
            <video
              src="/videos/govai-demo.mp4"
              controls
              muted
              playsInline
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </div>
          <div style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.4, color: "var(--govai-text-tertiary)" }}>
            CI gate · evidence log · audit export
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 16,
          }}
        >
          <Link className="govai_btn govai_btnPrimary" href="/runs">
            Get started
          </Link>
          <Link className="govai_btn govai_btnGhost" href="/login">
            Request demo
          </Link>
        </div>
      </div>

      <div
        className="govai_landing_positioning"
        style={{
          marginTop: 28,
          padding: "18px 16px 16px",
          textAlign: "left",
          maxWidth: 520,
          marginLeft: "auto",
          marginRight: "auto",
          borderRadius: 10,
          border: "1px solid var(--govai-border-faint)",
          background: "var(--govai-bg-panel)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
        }}
      >
        <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.55, color: "var(--govai-text)" }}>
          Hard CI gate: pipeline fails unless verdict = VALID
        </p>
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.5, color: "var(--govai-text-secondary)" }}>
          Evidence-first: append-only structured logs
        </p>
        <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.55, color: "var(--govai-text-secondary)" }}>
          Audit export: verifiable JSON output
        </p>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--govai-text-tertiary)" }}>
          Verdicts: VALID / INVALID / BLOCKED
        </p>
      </div>

      <div style={{ marginTop: 26, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--govai-text-label)",
            marginBottom: 10,
            textAlign: "center",
          }}
        >
          GovAI CLI / PyPI
        </div>
        <div
          style={{
            padding: "14px 14px 12px",
            borderRadius: 10,
            border: "1px solid var(--govai-border-faint)",
            background: "var(--govai-bg-elevated)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: "-0.02em", color: "var(--govai-text)" }}>
            Run AI compliance checks in CI
          </div>
          <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.45, color: "var(--govai-text-secondary)" }}>
            Deterministic verdicts. No heuristics. No ambiguity.
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <LandingCopyBlock label="Install" code={"pip install aigov-py==0.1.0"} />
            <LandingCopyBlock
              label="Quick usage"
              code={[
                "export GOVAI_AUDIT_BASE_URL=...",
                "export RUN_ID=...",
                "",
                "govai check",
              ].join("\n")}
            />
            <div className="govai_landing_cli_grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <LandingCopyBlock label="Output (VALID)" code={"VALID"} tone="ok" />
              <LandingCopyBlock
                label="Output (failure)"
                code={"GovAI compliance gate failed: verdict=INVALID"}
                tone="error"
              />
            </div>
            <LandingCopyBlock
              label="CI usage (GitHub Action)"
              code={[
                "- uses: MonikaDvorackova/aigov-compliance-engine/.github/actions/govai-check@v1",
                "  with:",
                "    run_id: ${{ github.run_id }}",
                "    base_url: ${{ vars.GOVAI_AUDIT_BASE_URL }}",
              ].join("\n")}
            />
          </div>

          <ul
            style={{
              margin: "12px 0 0",
              paddingLeft: 16,
              color: "var(--govai-text-secondary)",
              fontSize: 12.5,
              lineHeight: 1.45,
            }}
          >
            <li>Deterministic compliance verdict (VALID / INVALID / BLOCKED)</li>
            <li>Fails CI on non-compliant runs</li>
            <li>Fully auditable decision path</li>
          </ul>
        </div>
      </div>

      <div style={{ marginTop: 26, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--govai-text-label)",
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          How GovAI decides
        </div>
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: 14,
          }}
        >
          {[
            {
              title: "When to use",
              detail: "Deploying ML models; enforcing approval workflows; preparing for audits.",
            },
            {
              title: "Decision states",
              detail: "VALID: allowed. INVALID: rejected. BLOCKED: missing evidence.",
            },
            {
              title: "Gate behavior",
              detail: "CI fails unless verdict = VALID.",
            },
            {
              title: "Audit export",
              detail: "Exportable JSON for external verification.",
            },
          ].map((item) => (
            <li
              key={item.title}
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid var(--govai-border-faint)",
                background: "var(--govai-bg-elevated)",
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--govai-text)", marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--govai-text-secondary)" }}>{item.detail}</div>
            </li>
          ))}
        </ul>
      </div>

      <Panel
        style={{
          padding: "10px 12px 11px",
          marginTop: 26,
          background: "var(--govai-bg-panel)",
          border: "1px solid var(--govai-border-faint)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--govai-text)" }}>
            How it works
          </span>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--govai-text-label)",
            }}
          >
            Walkthrough video
          </span>
        </div>
        <p style={{ ...primaryCardDescription(), margin: "0 0 8px", fontSize: 11.5, lineHeight: 1.4 }}>
          Evidence → decision → export.
        </p>
        <div role="presentation" aria-hidden="true" className="govai_walkthrough_shell" />
      </Panel>

      <div style={{ marginTop: 28 }}>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--govai-text-label)",
            marginBottom: 10,
          }}
        >
          Core system
        </div>
        <EvidenceLedgerHero />
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="govai_secondary_pair">
          <PolicyEnforcementSecondary />
          <EvidenceBundlesSecondary />
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--govai-text-label)",
            marginBottom: 10,
            textAlign: "center",
          }}
        >
          Proof & export
        </div>
        <CapabilityProofStrip items={PROOF_ITEMS} />
      </div>

      <p
        style={{
          textAlign: "center",
          marginTop: 22,
          marginBottom: 0,
          fontSize: 11,
          lineHeight: 1.45,
          color: "var(--govai-text-tertiary)",
        }}
      >
        Append-only evidence · deterministic verdict · exportable audit JSON
      </p>

      <style>{`
        .govai_code_card {
          border-radius: 10px;
          background: var(--govai-bg-panel);
          box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset;
          overflow: hidden;
        }
        .govai_code_card__top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 10px 8px;
          border-bottom: 1px solid var(--govai-border-faint);
          background: color-mix(in srgb, var(--govai-bg-elevated) 60%, transparent);
        }
        .govai_code_card__label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--govai-text-label);
        }
        .govai_code_copy {
          height: 26px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid var(--govai-border);
          background: transparent;
          color: var(--govai-text-secondary);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
        }
        .govai_code_copy:hover {
          background: var(--govai-bg-elevated);
          border-color: var(--govai-border);
          color: var(--govai-text);
        }
        .govai_code_copy:focus-visible {
          outline: 2px solid var(--govai-border-focus);
          outline-offset: 2px;
        }
        .govai_code_pre {
          margin: 0;
          padding: 10px 10px 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          line-height: 1.55;
          color: var(--govai-text-secondary);
          white-space: pre;
          overflow-x: auto;
        }
        .govai_btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 34px;
          padding: 0 14px;
          border-radius: 8px;
          text-decoration: none;
          font-size: 13px;
          font-weight: 600;
          transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
        }
        .govai_btn:focus-visible {
          outline: 2px solid var(--govai-border-focus);
          outline-offset: 2px;
        }
        .govai_btnPrimary {
          border: 1px solid color-mix(in srgb, var(--govai-accent) 55%, transparent);
          background: color-mix(in srgb, var(--govai-accent) 18%, var(--govai-bg-elevated));
          color: var(--govai-text);
        }
        .govai_btnPrimary:hover {
          background: color-mix(in srgb, var(--govai-accent) 28%, var(--govai-bg-elevated));
          border-color: color-mix(in srgb, var(--govai-accent) 70%, transparent);
        }
        .govai_btnGhost {
          border: 1px solid var(--govai-border);
          background: transparent;
          color: var(--govai-text-secondary);
        }
        .govai_btnGhost:hover {
          background: var(--govai-bg-panel);
          border-color: var(--govai-border);
          color: var(--govai-text);
        }

        .govai_walkthrough_shell {
          position: relative;
          height: 44px;
          border-radius: 7px;
          border: 1px solid var(--govai-border-faint);
          background: var(--govai-bg-elevated);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03) inset;
          overflow: hidden;
        }
        .govai_walkthrough_shell::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            105deg,
            transparent 0%,
            transparent 42%,
            rgba(255, 255, 255, 0.07) 50%,
            transparent 58%,
            transparent 100%
          );
          background-size: 220% 100%;
          animation: govai_preview_sheen 7s ease-in-out infinite;
          pointer-events: none;
        }

        .govai_hero_cap {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(128px, 36%);
          align-items: stretch;
        }
        .govai_hero_cap__left {
          padding: 18px 18px 20px 16px;
          border-right: 1px solid var(--govai-border-faint);
        }
        .govai_hero_cap__right {
          padding: 12px;
          background: var(--govai-bg-panel);
          min-width: 0;
        }

        .govai_ledger_viewport {
          position: relative;
          height: 124px;
          border-radius: 8px;
          border: 1px solid var(--govai-border-faint);
          background: var(--govai-bg-elevated);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03) inset;
          overflow: hidden;
        }
        .govai_ledger_track {
          height: 100%;
          overflow: hidden;
        }
        .govai_ledger_track_inner {
          will-change: transform;
          animation: govai_ledger_drift 20s linear infinite;
        }
        .govai_ledger_row {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 8px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          color: var(--govai-text-secondary);
        }
        .govai_ledger_pipe {
          width: 12px;
          text-align: center;
          color: var(--govai-text-muted);
          opacity: 0.85;
          flex-shrink: 0;
        }
        .govai_ledger_hash {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .govai_ledger_tag {
          font-size: 9px;
          opacity: 0.45;
          flex-shrink: 0;
        }
        .govai_ledger_scan {
          position: absolute;
          top: 14%;
          left: 10%;
          right: 10%;
          height: 1px;
          z-index: 1;
          pointer-events: none;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
          animation: govai_ledger_scan 5s ease-in-out infinite;
        }
        .govai_ledger_verify {
          position: absolute;
          z-index: 2;
          bottom: 7px;
          left: 9px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 9px;
          letter-spacing: 0.02em;
          color: var(--govai-text-tertiary);
        }
        .govai_ledger_verify_dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--govai-accent-muted);
          opacity: 0.75;
          animation: govai_verify_pulse 3s ease-in-out infinite;
        }

        .govai_secondary_pair {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          align-items: stretch;
        }

        .govai_policy_gate {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          font-size: 10px;
          color: var(--govai-text-tertiary);
        }
        .govai_policy_tx {
          opacity: 0.65;
        }
        .govai_policy_arrow {
          opacity: 0.45;
          font-size: 9px;
        }
        .govai_policy_gate_box {
          padding: 3px 8px;
          border-radius: 5px;
          border: 1px solid color-mix(in srgb, var(--govai-accent) 32%, transparent);
          color: var(--govai-text-secondary);
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .govai_policy_out {
          opacity: 0.75;
          font-size: 9px;
        }

        .govai_bundle_line {
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: flex-start;
        }
        .govai_bundle_label {
          font-size: 9px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--govai-text-label);
        }
        .govai_bundle_hash {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          color: var(--govai-text-secondary);
          animation: govai_bundle_soft 8s ease-in-out infinite;
        }

        .govai_proof_light {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 22px 36px;
          padding: 16px 18px 14px;
          border-radius: 10px;
          border: 1px solid var(--govai-border-faint);
          background: var(--govai-bg-panel);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03) inset;
        }
        .govai_proof_light__item {
          min-width: 140px;
          max-width: 220px;
          text-align: center;
        }
        .govai_proof_light__label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--govai-text-label);
          margin-bottom: 6px;
        }
        .govai_proof_light__detail {
          font-size: 12px;
          line-height: 1.45;
          color: var(--govai-text);
          opacity: 0.78;
        }

        @keyframes govai_preview_sheen {
          0%, 100% { background-position: 100% 0; opacity: 0.5; }
          50% { background-position: 0% 0; opacity: 1; }
        }
        @keyframes govai_ledger_drift {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        @keyframes govai_ledger_scan {
          0%, 100% { top: 14%; opacity: 0; }
          12% { opacity: 1; }
          50% { top: 72%; }
          88% { opacity: 1; }
        }
        @keyframes govai_verify_pulse {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        @keyframes govai_bundle_soft {
          0%, 100% { opacity: 0.65; }
          50% { opacity: 1; }
        }

        @media (max-width: 640px) {
          .govai_hero_cap {
            grid-template-columns: 1fr;
          }
          .govai_hero_cap__left {
            border-right: none;
            border-bottom: 1px solid var(--govai-border-faint);
            padding-bottom: 18px;
          }
          .govai_hero_cap__right {
            padding: 12px 12px 14px;
          }
        }
        @media (max-width: 560px) {
          .govai_secondary_pair {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 560px) {
          .govai_code_pre {
            font-size: 10.5px;
          }
        }
        @media (max-width: 560px) {
          .govai_landing_cli_grid {
            grid-template-columns: 1fr;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .govai_walkthrough_shell::after,
          .govai_ledger_track_inner,
          .govai_ledger_scan,
          .govai_ledger_verify_dot,
          .govai_policy_gate_box,
          .govai_bundle_hash {
            animation: none !important;
          }
          .govai_walkthrough_shell::after {
            opacity: 0;
          }
        }
      `}</style>
    </InfraShell>
  );
}
