"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import AigovMark from "../components/brand/AigovMark";
import InfraShell from "../_ui/InfraShell";
import { consoleElevatedPanelStyle } from "../_ui/console/surfaces";
import { getNextPublicSupabaseKey, getNextPublicSupabaseUrl } from "@/lib/supabase/publicEnv";

const LOGIN_SHELL_BACKGROUND = [
  "radial-gradient(900px 480px at 50% -8%, rgba(255,255,255,0.035) 0%, transparent 58%)",
  "var(--govai-bg-app)",
].join(", ");

function createSupabaseBrowserClient(): SupabaseClient {
  return createBrowserClient(getNextPublicSupabaseUrl(), getNextPublicSupabaseKey());
}

function IconGoogle({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21.6 12.27c0-.74-.07-1.45-.2-2.13H12v4.03h5.38c-.23 1.23-.93 2.27-1.98 2.98v2.47h3.2c1.87-1.72 2.99-4.25 2.99-7.35Z"
        fill={color}
        opacity="0.9"
      />
      <path
        d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.2-2.47c-.9.6-2.05.96-3.43.96-2.64 0-4.88-1.78-5.68-4.17H3.02v2.56C4.66 19.78 8.06 22 12 22Z"
        fill={color}
        opacity="0.72"
      />
      <path
        d="M6.32 13.89c-.2-.6-.32-1.24-.32-1.89s.12-1.29.32-1.89V7.55H3.02C2.37 8.85 2 10.32 2 12s.37 3.15 1.02 4.45l3.3-2.56Z"
        fill={color}
        opacity="0.6"
      />
      <path
        d="M12 5.94c1.47 0 2.8.5 3.84 1.5l2.88-2.88C16.96 2.9 14.7 2 12 2 8.06 0 4.66 4.22 3.02 7.55l3.3 2.56c.8-2.39 3.04-4.17 5.68-4.17Z"
        fill={color}
        opacity="0.82"
      />
    </svg>
  );
}

function IconGitHub({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={color}
        d="M12 2c-5.52 0-10 4.58-10 10.23 0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.48 0-.24-.01-.86-.01-1.68-2.78.62-3.37-1.1-3.37-1.1-.45-1.19-1.1-1.5-1.1-1.5-.9-.64.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.58 2.34 1.12 2.91.86.09-.67.35-1.12.64-1.37-2.22-.26-4.55-1.14-4.55-5.08 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.72 0 0 .84-.27 2.75 1.05.8-.23 1.66-.34 2.52-.34.86 0 1.72.11 2.52.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.42.2 2.46.1 2.72.64.72 1.03 1.63 1.03 2.75 0 3.95-2.34 4.82-4.57 5.08.36.32.68.95.68 1.92 0 1.39-.01 2.51-.01 2.85 0 .26.18.58.69.48 3.96-1.36 6.83-5.19 6.83-9.71C22 6.58 17.52 2 12 2Z"
      />
    </svg>
  );
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

  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid email or password") ||
    (lower.includes("invalid") && lower.includes("password"))
  ) {
    return "Incorrect email or password.";
  }

  if (lower.includes("email not confirmed")) {
    return "Please confirm your email first.";
  }

  return s;
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const messageFromUrl = useMemo(() => {
    const oauthErr = searchParams.get("oauth_err") === "1";
    const raw = searchParams.get("message");
    if (oauthErr && raw?.trim()) {
      try {
        return `OAuth: ${decodeURIComponent(raw.trim())}`;
      } catch {
        return `OAuth: ${raw.trim()}`;
      }
    }
    return userFriendlyMessage(raw);
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(messageFromUrl);

  useEffect(() => {
    setMessage(messageFromUrl);
  }, [messageFromUrl]);

  /** If session exists but this client still mounted (edge case), leave login immediately. */
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      console.log("[login/client] session present -> /runs");
      router.replace("/runs");
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

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
        console.log("[login:error]", {
          message: error.message,
          status: error.status,
          name: error.name,
        });
        setMessage(error.message || "Sign in failed. Please try again.");
        return;
      }

      router.push("/runs");
    } catch (err: unknown) {
      console.log("[login:error]", err);
      setMessage("Sign in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const oauthPrimaryBtn: React.CSSProperties = {
    width: "100%",
    height: 34,
    borderRadius: 8,
    border: "1px solid color-mix(in srgb, var(--govai-accent) 55%, transparent)",
    background: "color-mix(in srgb, var(--govai-accent) 18%, var(--govai-bg-elevated))",
    color: "var(--govai-text)",
    fontSize: 13,
    fontWeight: 600,
    cursor: busy ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease",
    opacity: busy ? 0.65 : 1,
  };

  const oauthSecondaryBtn: React.CSSProperties = {
    width: "100%",
    height: 34,
    borderRadius: 8,
    border: "1px solid var(--govai-border)",
    background: "transparent",
    color: "var(--govai-text-secondary)",
    fontSize: 13,
    fontWeight: 500,
    cursor: busy ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease",
    opacity: busy ? 0.65 : 1,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 34,
    borderRadius: 8,
    border: "1px solid var(--govai-border)",
    background: "var(--govai-bg-panel)",
    color: "var(--govai-text)",
    fontSize: 13,
    padding: "0 10px",
    outline: "none",
    textAlign: "left",
    boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
  };

  const emailSubmitBtn: React.CSSProperties = {
    width: "100%",
    height: 32,
    borderRadius: 8,
    border: "1px solid var(--govai-border-faint)",
    background: "var(--govai-bg-panel)",
    color: "var(--govai-text-tertiary)",
    fontSize: 12,
    fontWeight: 500,
    cursor: busy ? "not-allowed" : "pointer",
    transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
  };

  const linkStyle: React.CSSProperties = {
    color: "var(--govai-text-secondary)",
    textDecoration: "underline",
    textUnderlineOffset: 3,
    textDecorationColor: "var(--govai-link-decoration)",
    fontSize: 11,
  };

  const loginPanelStyle: React.CSSProperties = {
    ...consoleElevatedPanelStyle(),
    padding: 14,
    marginTop: 10,
    textAlign: "left" as const,
  };

  return (
    <InfraShell maxWidth={440} align="center" padding={16} background={LOGIN_SHELL_BACKGROUND}>
      <style>{`
        .login_oauthPrimary:hover:not(:disabled) {
          background: color-mix(in srgb, var(--govai-accent) 28%, var(--govai-bg-elevated));
          border-color: color-mix(in srgb, var(--govai-accent) 70%, transparent);
        }
        .login_oauthSecondary:hover:not(:disabled) {
          background: var(--govai-bg-panel);
          border-color: var(--govai-border);
          color: var(--govai-text);
        }
        .login_emailSubmit:hover:not(:disabled) {
          border-color: var(--govai-border);
          color: var(--govai-text-secondary);
          background: var(--govai-bg-elevated);
        }
        .login_input:focus {
          outline: none;
          border-color: var(--govai-border-strong);
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.08);
        }
        a.login_footerLink:hover { color: var(--govai-text); text-decoration-color: var(--govai-link-decoration); }
      `}</style>

      <div style={{ width: "100%", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <span style={{ display: "inline-flex", lineHeight: 0 }}>
            <AigovMark size={28} glow={false} neon={false} neonStrength="off" tone="steel" isRunning={false} />
          </span>
        </div>

        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            marginBottom: 6,
            color: "var(--govai-text-label)",
          }}
        >
          GOVAI
        </div>

        <h1
          style={{
            margin: 0,
            letterSpacing: "-0.02em",
            fontWeight: 600,
            lineHeight: 1.15,
            fontSize: "clamp(20px, 3.8vw, 24px)",
            textWrap: "balance",
            color: "var(--govai-text)",
          }}
        >
          Sign in
        </h1>

        <p
          style={{
            margin: "6px auto 0",
            maxWidth: "40ch",
            fontSize: 12,
            lineHeight: 1.4,
            textWrap: "balance",
            color: "var(--govai-text-secondary)",
          }}
        >
          Access the compliance dashboard.
        </p>

        <section style={loginPanelStyle}>
          {message ? (
            <div
              style={{
                marginBottom: 10,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--govai-border-faint)",
                background: "var(--govai-bg-panel)",
                fontSize: 12,
                lineHeight: 1.4,
                color: "var(--govai-text-secondary)",
                textAlign: "left",
              }}
            >
              {message}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 8 }}>
            <button
              type="button"
              className="login_oauthPrimary"
              disabled={busy}
              onClick={() => {
                console.log("[login] Google button clicked");
                window.location.assign("/auth/login/google?next=/runs");
              }}
              style={oauthPrimaryBtn}
            >
              <span style={{ display: "inline-flex", color: "var(--govai-text-secondary)" }}>
                <IconGoogle size={16} />
              </span>
              Continue with Google
            </button>

            <button
              type="button"
              className="login_oauthSecondary"
              disabled={busy}
              onClick={() => {
                console.log("[login] GitHub button clicked");
                window.location.assign("/auth/login/github?next=/runs");
              }}
              style={oauthSecondaryBtn}
            >
              <span style={{ display: "inline-flex", color: "var(--govai-text-secondary)" }}>
                <IconGitHub size={16} />
              </span>
              Continue with GitHub
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            marginTop: 12,
            marginBottom: 8,
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--govai-divider)" }} />
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--govai-text-label)",
              }}
            >
              Email
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--govai-divider)" }} />
          </div>

          <form onSubmit={signInEmailPassword} style={{ display: "grid", gap: 8 }}>
            <input
              className="login_input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              inputMode="email"
              autoComplete="email"
              disabled={busy}
              style={inputStyle}
            />

            <input
              className="login_input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              disabled={busy}
              style={inputStyle}
            />

            <button
              type="submit"
              className="login_emailSubmit"
              disabled={busy || !email.trim() || !password}
              style={{
                ...emailSubmitBtn,
                opacity: busy || !email.trim() || !password ? 0.55 : 0.88,
                cursor: busy || !email.trim() || !password ? "not-allowed" : "pointer",
              }}
            >
              Sign in with email
            </button>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                marginTop: 4,
              }}
            >
              <a href="/" className="login_footerLink" style={linkStyle}>
                Home
              </a>

              <a href="/runs" className="login_footerLink" style={linkStyle}>
                Runs
              </a>
            </div>
          </form>
        </section>
      </div>
    </InfraShell>
  );
}