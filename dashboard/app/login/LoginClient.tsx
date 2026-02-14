"use client";

import React, { useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";

function createSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

function IconGoogle({ size = 18, color = "#1D4ED8" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21.6 12.27c0-.74-.07-1.45-.2-2.13H12v4.03h5.38c-.23 1.23-.93 2.27-1.98 2.98v2.47h3.2c1.87-1.72 2.99-4.25 2.99-7.35Z"
        fill={color}
        opacity="0.95"
      />
      <path
        d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.2-2.47c-.9.6-2.05.96-3.43.96-2.64 0-4.88-1.78-5.68-4.17H3.02v2.56C4.66 19.78 8.06 22 12 22Z"
        fill={color}
        opacity="0.78"
      />
      <path
        d="M6.32 13.89c-.2-.6-.32-1.24-.32-1.89s.12-1.29.32-1.89V7.55H3.02C2.37 8.85 2 10.32 2 12s.37 3.15 1.02 4.45l3.3-2.56Z"
        fill={color}
        opacity="0.66"
      />
      <path
        d="M12 5.94c1.47 0 2.8.5 3.84 1.5l2.88-2.88C16.96 2.9 14.7 2 12 2 8.06 2 4.66 4.22 3.02 7.55l3.3 2.56c.8-2.39 3.04-4.17 5.68-4.17Z"
        fill={color}
        opacity="0.88"
      />
    </svg>
  );
}

function IconGitHub({ size = 18, color = "#1D4ED8" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={color}
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

  if (lower.includes("missing oauth code") || lower.includes("oauth exchange failed") || lower.includes("invalid code")) {
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

export default function LoginClient() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const initialMessage = userFriendlyMessage(useInitialMessage());

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(initialMessage);

  const blue = "#1D4ED8";
  const iconGlow =
    "drop-shadow(0 0 8px rgba(59,130,246,0.90)) drop-shadow(0 0 18px rgba(59,130,246,0.65)) drop-shadow(0 0 40px rgba(29,78,216,0.45))";

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

  async function signInOAuth(provider: "google" | "github") {
    setBusy(true);
    setMessage(null);

    try {
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) {
        setMessage(userFriendlyMessage(error.message) ?? "Sign in failed. Please try again.");
        return;
      }
    } catch (_err: any) {
      setMessage("Sign in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const shellBg =
    "radial-gradient(1200px 520px at 50% 8%, rgba(255,255,255,0.08), rgba(0,0,0,0) 60%), radial-gradient(900px 520px at 20% 28%, rgba(29,78,216,0.10), rgba(0,0,0,0) 55%), radial-gradient(900px 520px at 82% 42%, rgba(255,255,255,0.06), rgba(0,0,0,0) 55%)";

  const cardBorder = "1px solid rgba(255,255,255,0.14)";
  const cardBg = "rgba(255,255,255,0.03)";

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 44,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    fontSize: 14,
    padding: "0 12px",
    outline: "none",
    textAlign: "center",
  };

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    height: 44,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    fontSize: 14,
    cursor: busy ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
    transition: "transform 120ms ease, background 120ms ease, border-color 120ms ease",
  };

  const linkStyle: React.CSSProperties = {
    color: "rgba(255,255,255,0.80)",
    textDecoration: "underline",
    textUnderlineOffset: 4,
    textDecorationColor: "rgba(29,78,216,0.65)",
    fontSize: 12,
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: shellBg,
        padding: 18,
        display: "grid",
        placeItems: "center",
      }}
    >
      <style>{`
        button[data-btn="1"]:hover { transform: translateY(-1px); background: rgba(255,255,255,0.055); border-color: rgba(255,255,255,0.22); }
        button[data-btn="1"]:active { transform: translateY(0px); background: rgba(255,255,255,0.045); }
        input:focus { border-color: rgba(59,130,246,0.70); box-shadow: 0 0 0 3px rgba(59,130,246,0.20); }
        a:hover { color: rgba(255,255,255,0.92); text-decoration-color: rgba(59,130,246,0.95); }
      `}</style>

      <div style={{ width: "100%", maxWidth: 520, textAlign: "center" }}>
        <div style={{ opacity: 0.75, fontSize: 12, letterSpacing: "0.08em" }}>AIGOV</div>

        <h1
          style={{
            margin: 0,
            marginTop: 10,
            fontSize: 28,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
        >
          Dashboard Login
        </h1>

        <p
          style={{
            marginTop: 10,
            marginBottom: 14,
            opacity: 0.78,
            fontSize: 13,
          }}
        >
          Sign in to load runs from the database.
        </p>

        <div
          style={{
            margin: "0 auto",
            borderRadius: 16,
            border: cardBorder,
            background: cardBg,
            boxShadow: "0 18px 60px rgba(0,0,0,0.40)",
            padding: 16,
            textAlign: "left",
          }}
        >
          {message ? (
            <div
              style={{
                marginBottom: 10,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.05)",
                fontSize: 12,
                opacity: 0.95,
                textAlign: "left",
              }}
            >
              {message}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 10 }}>
            <button type="button" data-btn="1" onClick={() => signInOAuth("google")} disabled={busy} style={buttonStyle}>
              <span style={{ display: "inline-flex", filter: iconGlow }}>
                <IconGoogle color={blue} size={18} />
              </span>
              Continue with Google
            </button>

            <button type="button" data-btn="1" onClick={() => signInOAuth("github")} disabled={busy} style={buttonStyle}>
              <span style={{ display: "inline-flex", filter: iconGlow }}>
                <IconGitHub color={blue} size={18} />
              </span>
              Continue with GitHub
            </button>
          </div>

          <div style={{ marginTop: 14, opacity: 0.65, fontSize: 12, textAlign: "center" }}>
            Or email and password
          </div>

          <form onSubmit={signInEmailPassword} style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
              inputMode="email"
              autoComplete="email"
              disabled={busy}
              style={inputStyle}
            />

            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              type="password"
              autoComplete="current-password"
              disabled={busy}
              style={inputStyle}
            />

            <button
              type="submit"
              data-btn="1"
              disabled={busy || !email.trim() || !password}
              style={{
                ...buttonStyle,
                background:
                  busy || !email.trim() || !password ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
              }}
            >
              Sign in
            </button>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                marginTop: 2,
                opacity: 0.8,
              }}
            >
              <a href="/" style={linkStyle}>
                Back to home
              </a>

              <a href="/runs" style={linkStyle}>
                Open runs
              </a>
            </div>
          </form>

          <div style={{ marginTop: 10, opacity: 0.55, fontSize: 11, textAlign: "center" }}>
            Secure sign in via Google or GitHub.
          </div>
        </div>
      </div>
    </main>
  );
}
