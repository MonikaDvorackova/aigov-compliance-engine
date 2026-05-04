"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DashboardContentSection,
  DashboardHero,
  DashboardPageIntroduction,
  DashboardPageShell,
  DashboardSectionHeader,
  dashboardErrorBanner,
  dashboardErrorBannerTitle,
  dashboardPageStack,
} from "@/app/_ui/dashboard";
import {
  govaiApiBaseUrl,
  govaiFetchJson,
  readSessionApiKey,
  writeSessionApiKey,
} from "@/lib/govaiHostedBilling";

type BillingStatus = {
  ok?: boolean;
  tenant_id?: string;
  subscription_status?: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  billing_units?: { billing_unit: string; stripe_price_id: string; active: boolean }[];
  enforcement_enabled?: boolean;
  can_use_hosted_api?: boolean;
  latest_invoice_status?: string | null;
};

type InvoiceRow = {
  stripe_invoice_id: string;
  status: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  created?: string | null;
};

export default function BillingClient() {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = govaiApiBaseUrl();

  const refresh = useCallback(async () => {
    setError(null);
    if (!base) {
      setError("Set NEXT_PUBLIC_GOVAI_API_BASE_URL for this deployment.");
      return;
    }
    if (!readSessionApiKey()) {
      setStatus(null);
      setInvoices([]);
      return;
    }
    setLoading(true);
    try {
      const s = await govaiFetchJson("/billing/status", { method: "GET" });
      if (!s.ok || typeof s.json !== "object" || s.json === null) {
        setError(`Status request failed (${s.status}).`);
        setStatus(null);
      } else {
        setStatus(s.json as BillingStatus);
      }
      const inv = await govaiFetchJson("/billing/invoices", { method: "GET" });
      if (inv.ok && inv.json && typeof inv.json === "object" && "invoices" in inv.json) {
        setInvoices((inv.json as { invoices: InvoiceRow[] }).invoices ?? []);
      } else {
        setInvoices([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    setApiKeyInput(readSessionApiKey());
    void refresh();
  }, [refresh]);

  const saveKey = () => {
    writeSessionApiKey(apiKeyInput);
    void refresh();
  };

  const startCheckout = async () => {
    setError(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const body = JSON.stringify({
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancel`,
    });
    const r = await govaiFetchJson("/billing/checkout-session", { method: "POST", body });
    const j = r.json as { checkout_url?: string; error?: { message?: string } };
    if (!r.ok || !j?.checkout_url) {
      setError(j?.error?.message ?? `Checkout failed (${r.status})`);
      return;
    }
    window.location.href = j.checkout_url;
  };

  const openPortal = async () => {
    setError(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const body = JSON.stringify({ return_url: `${origin}/billing` });
    const r = await govaiFetchJson("/billing/portal-session", { method: "POST", body });
    const j = r.json as { portal_url?: string; error?: { code?: string; hint?: string } };
    if (!r.ok || !j?.portal_url) {
      setError(j?.error?.hint ?? j?.error?.code ?? `Portal failed (${r.status})`);
      return;
    }
    window.location.href = j.portal_url;
  };

  const sub = status?.subscription_status ?? "none";
  const noAccount = !status?.stripe_customer_id && sub === "none";
  const isActive = sub === "active" || sub === "trialing";
  const isPastDue = sub === "past_due";
  const isCanceled = sub === "canceled" || sub === "cancelled";

  return (
    <DashboardPageShell>
      <div className={dashboardPageStack}>
        <DashboardPageIntroduction>
          <DashboardHero
            showBottomDivider={false}
            kicker="GovAI"
            title="Billing"
            description="Subscription, usage, and invoices for your ledger tenant (API key scoped)."
          />
        </DashboardPageIntroduction>

        {!base ? (
          <div className={dashboardErrorBanner} role="alert">
            <span className={dashboardErrorBannerTitle}>API base URL missing.</span> Set{" "}
            <code className="text-xs">NEXT_PUBLIC_GOVAI_API_BASE_URL</code> to your GovAI service URL.
          </div>
        ) : null}

        <DashboardContentSection>
          <DashboardSectionHeader title="API access" />
          <p className="mt-2 text-sm [color:var(--govai-text-secondary)]">
            The hosted GovAI API key is stored only in this browser tab (sessionStorage). Use a key mapped in{" "}
            <code className="text-xs">GOVAI_API_KEYS_JSON</code>.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className="w-full max-w-xl rounded-md border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm text-[var(--govai-text)]"
              type="password"
              autoComplete="off"
              placeholder="GovAI API key"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <button type="button" className="govai_btn govai_btnPrimary text-sm" onClick={saveKey}>
              Save key
            </button>
            <button type="button" className="govai_btn govai_btnGhost text-sm" onClick={() => void refresh()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </DashboardContentSection>

        {error ? (
          <div className={dashboardErrorBanner} role="alert">
            <span className={dashboardErrorBannerTitle}>Error.</span> {error}
          </div>
        ) : null}

        {loading && !status ? (
          <DashboardContentSection>
            <p className="text-sm [color:var(--govai-text-secondary)]">Loading billing status…</p>
          </DashboardContentSection>
        ) : null}

        {!loading && readSessionApiKey() && status ? (
          <>
            <DashboardContentSection>
              <DashboardSectionHeader title="Subscription" />
              <div className="mt-3 grid gap-2 text-sm [color:var(--govai-text)]">
                <div>
                  <span className="opacity-70">Tenant</span>{" "}
                  <span className="font-mono text-xs">{status.tenant_id}</span>
                </div>
                <div>
                  <span className="opacity-70">Status</span> <strong>{sub}</strong>
                  {status.enforcement_enabled ? (
                    <span className="ml-2 text-xs opacity-70">(enforcement on)</span>
                  ) : null}
                </div>
                {status.current_period_start && status.current_period_end ? (
                  <div>
                    <span className="opacity-70">Current period</span>{" "}
                    {status.current_period_start} → {status.current_period_end}
                  </div>
                ) : null}
                {typeof status.can_use_hosted_api === "boolean" ? (
                  <div>
                    <span className="opacity-70">Hosted API</span>{" "}
                    {status.can_use_hosted_api ? "allowed" : "blocked by billing policy"}
                  </div>
                ) : null}
                {status.latest_invoice_status ? (
                  <div>
                    <span className="opacity-70">Latest invoice</span> {status.latest_invoice_status}
                  </div>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="govai_btn govai_btnPrimary text-sm" onClick={() => void startCheckout()}>
                  Start subscription
                </button>
                <button
                  type="button"
                  className="govai_btn govai_btnGhost text-sm"
                  onClick={() => void openPortal()}
                  disabled={noAccount}
                >
                  Manage billing
                </button>
              </div>
              {noAccount ? (
                <p className="mt-2 text-xs [color:var(--govai-text-secondary)]">No billing account yet — start a subscription first.</p>
              ) : null}
              {isPastDue ? (
                <p className="mt-2 text-xs text-amber-200/90">Past due — update payment in the billing portal.</p>
              ) : null}
              {isCanceled ? (
                <p className="mt-2 text-xs [color:var(--govai-text-secondary)]">Subscription canceled.</p>
              ) : null}
              {isActive ? <p className="mt-2 text-xs text-emerald-200/90">Subscription active.</p> : null}
            </DashboardContentSection>

            <DashboardContentSection>
              <DashboardSectionHeader title="Metered line items" />
              {status.billing_units && status.billing_units.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm font-mono text-xs [color:var(--govai-text)]">
                  {status.billing_units.map((u) => (
                    <li key={u.billing_unit}>
                      {u.billing_unit} — {u.stripe_price_id} {u.active ? "" : "(inactive)"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm [color:var(--govai-text-secondary)]">No mapped subscription items yet (wait for webhook after checkout).</p>
              )}
            </DashboardContentSection>

            <DashboardContentSection>
              <DashboardSectionHeader title="Recent invoices" />
              {invoices.length === 0 ? (
                <p className="mt-2 text-sm [color:var(--govai-text-secondary)]">No invoices returned (or no Stripe customer).</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {invoices.map((inv) => (
                    <li key={inv.stripe_invoice_id} className="border-b border-[rgba(255,255,255,0.06)] pb-2">
                      <div className="font-mono text-xs">{inv.stripe_invoice_id}</div>
                      <div className="opacity-80">
                        {inv.status} · {(inv.amount_due / 100).toFixed(2)} {inv.currency.toUpperCase()} due
                      </div>
                      {inv.hosted_invoice_url ? (
                        <a className="text-xs underline" href={inv.hosted_invoice_url} target="_blank" rel="noreferrer">
                          Hosted invoice
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </DashboardContentSection>
          </>
        ) : null}

        {!readSessionApiKey() && base ? (
          <DashboardContentSection>
            <p className="text-sm [color:var(--govai-text-secondary)]">Save a GovAI API key above to load billing status.</p>
          </DashboardContentSection>
        ) : null}
      </div>
    </DashboardPageShell>
  );
}
