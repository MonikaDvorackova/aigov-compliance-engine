import type { CSSProperties, ReactNode } from "react";

export function EvidenceLedgerHero() {
  return (
    <div className="govai_hero_cap">
      <div className="govai_hero_cap__left">
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--govai-text)", marginBottom: 8 }}>Ledger</div>
        <div className="govai_ledger_viewport">
          <div className="govai_ledger_track">
            <div className="govai_ledger_track_inner">
              <div className="govai_ledger_row">
                <span className="govai_ledger_pipe">│</span>
                <span className="govai_ledger_hash">0x…a1b2</span>
                <span className="govai_ledger_tag">bundle</span>
              </div>
              <div className="govai_ledger_row">
                <span className="govai_ledger_pipe">│</span>
                <span className="govai_ledger_hash">0x…c3d4</span>
                <span className="govai_ledger_tag">evidence</span>
              </div>
            </div>
          </div>
          <div className="govai_ledger_scan" aria-hidden />
          <div className="govai_ledger_verify">
            <span className="govai_ledger_verify_dot" aria-hidden />
            <span>Verified chain</span>
          </div>
        </div>
      </div>
      <div className="govai_hero_cap__right">
        <div style={{ fontSize: 11, color: "var(--govai-text-secondary)", lineHeight: 1.45 }}>
          Hash-linked artifacts roll forward with each transition. Export packs match the ledger view.
        </div>
      </div>
    </div>
  );
}

export function PolicyEnforcementSecondary() {
  return (
    <div style={surfaceCard()}>
      <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--govai-text-label)", marginBottom: 8 }}>
        Policy gate
      </div>
      <div className="govai_policy_gate">
        <span className="govai_policy_tx">eval</span>
        <span className="govai_policy_arrow">→</span>
        <span className="govai_policy_gate_box">APPROVAL</span>
        <span className="govai_policy_arrow">→</span>
        <span className="govai_policy_out">promotion</span>
      </div>
    </div>
  );
}

export function EvidenceBundlesSecondary() {
  return (
    <div style={surfaceCard()}>
      <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--govai-text-label)", marginBottom: 8 }}>
        Evidence bundle
      </div>
      <div className="govai_bundle_line">
        <span className="govai_bundle_label">pack.zip</span>
        <span className="govai_bundle_hash">sha256 · deterministic</span>
      </div>
    </div>
  );
}

type ProofItem = { label: string; detail: string };

export function CapabilityProofStrip({ items }: { items: readonly ProofItem[] }) {
  return (
    <div className="govai_proof_light">
      {items.map((item) => (
        <div key={item.label} className="govai_proof_light__item">
          <div className="govai_proof_light__label">{item.label}</div>
          <div className="govai_proof_light__detail">{item.detail}</div>
        </div>
      ))}
    </div>
  );
}

function surfaceCard(): CSSProperties {
  return {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid var(--govai-border-faint)",
    background: "var(--govai-bg-elevated)",
    minHeight: 120,
  };
}
