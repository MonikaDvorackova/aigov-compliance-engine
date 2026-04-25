"use client";

import React, { useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "../components/Logo";
import InfraShell, { InfraPanel } from "../_ui/InfraShell";
import { LANDING_SHELL_BACKGROUND } from "../_ui/landingShellBackground";

function createSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createBrowserClient(url, anon);
}

function IconGoogle({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <path
        d="M21.6 12.27c0-.74-.07-1.45-.2-2.13H12v4.03h5.38c-.23 1.23-.93 2.27-1.98 2.98v2.47h3.2c1.87-1.72 2.99-4.25 2.99-7.35Z"
        fill="currentColor"
        opacity={0.9}
      />
      <path
        d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.2-2.47c-.9.6-2.05.96-3.43.96-2.64 0-4.88-1.78-5.68-4.17H3.02v2.56C4.66 19.78 8.06 22 12 22Z"
        fill="currentColor"
        opacity={0.72}
      />
      <path
        d="M6.32 13.89c-.2-.6-.32-1.24-.32-1.89s.12-1.29.32-1.89V7.55H3.02C2.37 8.85 2 10.32 2 12s.37 3.15 1.02 4.45l3.3-2.56Z"
        fill="currentColor"
        opacity={0.6}
      />
      <path
        d="M12 5.94c1.47 0 2.8.5 3.84 1.5l2.88-2.88C16.96 2.9 14.7 2 12 2 8.06 0 4.66 4.22 3.02 7.55l3.3 2.56c.8-2.39 3.04-4.17 5.68-4.17Z"
        fill="currentColor"
        opacity={0.82}
      />
    </svg>
  );
}

function IconGitHub({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <path
        fill="currentColor"
        d="M12 2c-5.52 0-10 4.58-10 10.23 0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.48 0-.24-.01-.86-.01-1.68-2.78.62-3.37-1.1-3.37-1.1-.45-1.19-1.1-1.5-1.1-1.5-.9-.64.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.58 2.34 1.12 2.91.86.09-.67.35-1.12.64-1.37-2.22-.26-4.55-1.14-4.55-5.08 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.72 0 0 .84-.27 2.75 1.05.8-.23 1.66-.34 2.52-.34.86 0 1.72.11 2.52.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.42.2 2.46.1 2.72.64.72 1.03 1.63 1.03 2.75 0 3.95-2.34 4.82-4.57 5.08.36.32.68.95.68 1.92 0 1.39-.01 2.51-.01 2.85 0 .26.18.58.69.48 3.96-1.36 6.83-5.19 6.83-9.71C22 6.58 17.52 2 12 2Z"
      />
    </svg>
  );
}

function useInitialMessage(): string | null {
  const sp = useSearchParams();
  const v = sp.get("message");
  if (!v || !v.trim()) return null;
  return v.trim();
}

function userFriendlyMessage(raw: string | null): string | null {
  if (!raw) return null;

  const s = raw.trim();
  if (!s) return null;

  const lower = s.toLowerCase();

  if (
    lower.includes("missing oauth code") ||
    lower.includes("oauth exchange failed") ||
    lower.includes("invalid code") ||
    lower.includes("pkce") ||
    lower.includes("code verifier")
  ) {
    return "Sign in didn’t complete. Please try again.";
  }

  if (lower.includes("unsupported provider") || lower.includes("provider")) {
    return "This sign in method is not available right now. Please use another option.";
  }

  if (lower.includes("invalid login credentials") || lower.includes("invalid") || lower.includes("credentials")) {
    return "Incorrect email or password.";
  }

  if (lower.includes("email not confirmed")) {
    return "Please confirm your email first.";
  }

  return s;
}

const linkStyle: React.CSSProperties = {
  color: "var(--govai-text-secondary)",
  textDecoration: "underline",
  textUnderlineOffset: 3,
  textDecorationColor: "var(--govai-link-decoration)",
  fontSize: 12,
};

export default function LoginClient() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const initialMessage = userFriendlyMessage(useInitialMessage());

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(initialMessage);

  async function signInEmailPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage(userFriendlyMessage(error.message) ?? "Sign in failed. Please try again.");
        return;
      }

      router.push("/runs");
    } catch (_err: any) {
      setMessage("Sign in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const oauthBlockStyle: React.CSSProperties = {
    pointerEvents: busy ? "none" : "auto",
    opacity: busy ? 0.55 : 1,
  };

  return (
    <InfraShell maxWidth={520} align="center" padding={20} background={LANDING_SHELL_BACKGROUND}>
      <div
        style={{
          width: "100%",
          minHeight: "min(72vh, 560px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <Link href="/" prefetch={false} aria-label="GovAI home" style={{ display: "inline-flex", lineHeight: 0 }}>
            <Logo />
          </Link>
        </div>

        <div style={{ letterSpacing: "0.2em", fontSize: 10, opacity: 0.62, marginBottom: 8, color: "var(--govai-text)" }}>
          GOVAI
        </div>

        <h1
          style={{
            margin: 0,
            letterSpacing: "-0.03em",
            fontWeight: 600,
            lineHeight: 1.12,
            fontSize: "clamp(22px, 3.6vw, 30px)",
            color: "var(--govai-text)",
            textWrap: "balance",
          }}
        >
          Dashboard login
        </h1>

        <p
          style={{
            margin: "8px auto 0",
            maxWidth: "48ch",
            fontSize: 13,
            lineHeight: 1.45,
            color: "var(--govai-text-secondary)",
            textWrap: "balance",
          }}
        >
          Sign in to load runs from the database.
        </p>

        <InfraPanel marginTop={18} padding={18} borderRadius={10}>
          {message ? (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--govai-border-faint)",
                background: "var(--govai-bg-panel)",
                fontSize: 12,
                lineHeight: 1.45,
                color: "var(--govai-text-secondary)",
                textAlign: "left",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              {message}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 8 }}>
            <a
              href="/auth/login/google?next=/runs"
              className="govai_btn govai_btnGhost govai_btnBlock"
              style={{ ...oauthBlockStyle, gap: 10 }}
              aria-disabled={busy}
            >
              <span style={{ display: "inline-flex", color: "var(--govai-text-secondary)" }}>
                <IconGoogle size={18} />
              </span>
              Continue with Google
            </a>

            <a
              href="/auth/login/github?next=/runs"
              className="govai_btn govai_btnGhost govai_btnBlock"
              style={{ ...oauthBlockStyle, gap: 10 }}
              aria-disabled={busy}
            >
              <span style={{ display: "inline-flex", color: "var(--govai-text-secondary)" }}>
                <IconGitHub size={18} />
              </span>
              Continue with GitHub
            </a>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: "var(--govai-text-tertiary)", textAlign: "center" }}>
            Or email and password
          </div>

          <form onSubmit={signInEmailPassword} style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              inputMode="email"
              autoComplete="email"
              disabled={busy}
              className="govai_login_field"
            />

            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              disabled={busy}
              className="govai_login_field"
            />

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -2 }}>
              <Link href="/forgot-password" prefetch={false} style={linkStyle}>
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              className="govai_btn govai_btnPrimary govai_btnBlock"
              disabled={busy || !email.trim() || !password}
            >
              Sign in
            </button>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                marginTop: 4,
                flexWrap: "wrap",
              }}
            >
              <Link href="/" prefetch={false} style={linkStyle}>
                Back to home
              </Link>

              <Link href="/runs" prefetch={false} style={linkStyle}>
                Open runs
              </Link>
            </div>
          </form>

          <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.45, color: "var(--govai-text-tertiary)", textAlign: "center" }}>
            Secure sign in via Google or GitHub.
          </div>
        </InfraPanel>
      </div>
    </InfraShell>
  );
}
