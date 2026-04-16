import type { ReactNode } from "react";
import { Panel } from "./primitives";
import { primaryCardDescription, sectionKickerStyle } from "./surfaces";

const bulletPrimary = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 12 as const,
  lineHeight: 1.5 as const,
  color: "var(--govai-text-secondary)",
};

const bulletSecondary = {
  margin: 0,
  paddingLeft: 16,
  fontSize: 11.5 as const,
  lineHeight: 1.42 as const,
  color: "var(--govai-text-secondary)",
};

function BulletListPrimary({ items }: { items: readonly [string, string, string] }) {
  return (
    <ul style={bulletPrimary}>
      {items.map((b) => (
        <li key={b} style={{ marginBottom: 5 }}>
          {b}
        </li>
      ))}
    </ul>
  );
}

function BulletListSecondary({ items }: { items: readonly string[] }) {
  return (
    <ul style={bulletSecondary}>
      {items.map((b) => (
        <li key={b} style={{ marginBottom: 3 }}>
          {b}
        </li>
      ))}
    </ul>
  );
}

/** Animated ledger: drifting event rows + scan line + verify pulse (CSS classes on page). */
function LedgerMotifAnimated() {
  const row = (h: string, t: string) => (
    <div key={h + t} className="govai_ledger_row">
      <span className="govai_ledger_pipe">│</span>
      <span className="govai_ledger_hash">{h}</span>
      <span className="govai_ledger_tag">{t}</span>
    </div>
  );

  const rows = (
    <>
      {row("0x7a3f…e2", "append")}
      {row("0x9c1d…4a", "link")}
      {row("0x2b8e…91", "link")}
      {row("0x4d01…c8", "append")}
      {row("0x1eaa…33", "link")}
      {row("0x8f22…7d", "link")}
    </>
  );

  return (
    <div className="govai_ledger_viewport" aria-hidden="true">
      <div className="govai_ledger_track">
        <div className="govai_ledger_track_inner">
          {rows}
          {rows}
        </div>
      </div>
      <div className="govai_ledger_scan" />
      <div className="govai_ledger_verify">
        <span className="govai_ledger_verify_dot" />
        <span>chain ok</span>
      </div>
    </div>
  );
}

function PolicyMotifSubtle() {
  return (
    <div className="govai_policy_gate" aria-hidden="true">
      <span className="govai_policy_tx">tx</span>
      <span className="govai_policy_arrow">→</span>
      <span className="govai_policy_gate_box">gate</span>
      <span className="govai_policy_arrow">→</span>
      <span className="govai_policy_out">write</span>
    </div>
  );
}

function BundleMotifSubtle() {
  return (
    <div className="govai_bundle_line" aria-hidden="true">
      <span className="govai_bundle_label">bundle</span>
      <span className="govai_bundle_hash">sha256 · a1f3…9c</span>
    </div>
  );
}

export function EvidenceLedgerHero() {
  return (
    <Panel
      style={{
        padding: 0,
        background: "var(--govai-bg-elevated)",
        border: "1px solid var(--govai-border)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
        overflow: "hidden",
      }}
    >
      <div className="govai_hero_cap">
        <div className="govai_hero_cap__left">
          <div style={{ ...sectionKickerStyle(), marginBottom: 8, fontSize: 9.5 }}>Append-only store</div>
          <h2
            style={{
              margin: "0 0 8px",
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              lineHeight: 1.2,
              color: "var(--govai-text)",
            }}
          >
            Evidence Ledger
          </h2>
          <p style={{ ...primaryCardDescription(), margin: "0 0 14px", fontSize: 12.5, lineHeight: 1.45 }}>
            Immutable, hash-chained record of all system events.
          </p>
          <BulletListPrimary items={["append-only log", "verifiable integrity", "replayable state"]} />
        </div>
        <div className="govai_hero_cap__right">
          <LedgerMotifAnimated />
        </div>
      </div>
    </Panel>
  );
}

export function PolicyEnforcementSecondary() {
  return (
    <Panel
      style={{
        padding: "14px 14px 12px",
        background: "var(--govai-bg-panel)",
        border: "1px solid var(--govai-border-faint)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
        height: "100%",
      }}
    >
      <div style={{ ...sectionKickerStyle(), marginBottom: 6, fontSize: 9 }}>Enforcement</div>
      <h3 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "var(--govai-text)", letterSpacing: "-0.02em" }}>
        Policy Enforcement
      </h3>
      <p style={{ ...primaryCardDescription(), margin: "0 0 10px", fontSize: 11.5, lineHeight: 1.42 }}>
        Invalid transitions rejected before persistence.
      </p>
      <BulletListSecondary items={["gated lifecycle", "approval constraints", "deterministic rules"]} />
      <div style={{ marginTop: 12 }}>
        <PolicyMotifSubtle />
      </div>
    </Panel>
  );
}

export function EvidenceBundlesSecondary() {
  return (
    <Panel
      style={{
        padding: "14px 14px 12px",
        background: "var(--govai-bg-panel)",
        border: "1px solid var(--govai-border-faint)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
        height: "100%",
      }}
    >
      <div style={{ ...sectionKickerStyle(), marginBottom: 6, fontSize: 9 }}>Export</div>
      <h3 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "var(--govai-text)", letterSpacing: "-0.02em" }}>
        Evidence Bundles
      </h3>
      <p style={{ ...primaryCardDescription(), margin: "0 0 10px", fontSize: 11.5, lineHeight: 1.42 }}>
        Verifiable audit artifacts for handoff and review.
      </p>
      <BulletListSecondary items={["bundle hash", "signed artifacts", "reproducible outputs"]} />
      <div style={{ marginTop: 12 }}>
        <BundleMotifSubtle />
      </div>
    </Panel>
  );
}

type ProofItem = { label: string; detail: string };

/** Light proof row: low visual weight, readable order */
export function CapabilityProofStrip({ items }: { items: readonly ProofItem[] }) {
  return (
    <div className="govai_proof_light">
      {items.map((it) => (
        <div key={it.label} className="govai_proof_light__item">
          <div className="govai_proof_light__label">{it.label}</div>
          <div className="govai_proof_light__detail">{it.detail}</div>
        </div>
      ))}
    </div>
  );
}
