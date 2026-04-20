"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AigovMark from "../components/brand/AigovMark";
import InfraShell, { InfraPanel } from "../_ui/InfraShell";

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "white",
  fontSize: 14,
  padding: "0 12px",
  outline: "none",
  textAlign: "center",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  fontSize: 15,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 14px 30px rgba(0,0,0,0.28)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const linkStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.78)",
  textDecoration: "underline",
  textUnderlineOffset: 4,
  textDecorationColor: "rgba(29,78,216,0.55)",
  fontSize: 12,
};

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [checking, setChecking] = useState(true);
  const [tokenOk, setTokenOk] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        setTokenOk(false);
        setChecking(false);
        return;
      }
      try {
        const res = await fetch(`/api/auth/password-reset/validate?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as { valid?: boolean };
        if (!cancelled) {
          setTokenOk(Boolean(data.valid));
        }
      } catch {
        if (!cancelled) setTokenOk(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password !== password2) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setDone(true);
        setTimeout(() => router.push("/login"), 2000);
        return;
      }
      if (res.status >= 500 || data.error === "server_error") {
        setMessage("Something went wrong. Please try again.");
        return;
      }
      if (data.error === "weak_password") {
        setMessage("Password must be at least 8 characters (max 72).");
        return;
      }
      setMessage("This reset link is invalid or has expired.");
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const invalidMsg = "This reset link is invalid or has expired.";

  return (
    <InfraShell maxWidth={520} align="center" padding={18}>
      <style>{`
        button[data-btn="1"]:hover { transform: translateY(-1px); background: rgba(255,255,255,0.065); border-color: rgba(255,255,255,0.20); }
        input:focus { border-color: rgba(59,130,246,0.55); box-shadow: 0 0 0 3px rgba(59,130,246,0.14); }
      `}</style>

      <div style={{ width: "100%", textAlign: "center" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 12,
            minHeight: 96,
            alignItems: "center",
          }}
        >
          <AigovMark size={88} glow neon neonStrength="strong" tone="blue" />
        </div>

        <h1
          style={{
            margin: 0,
            letterSpacing: "-0.02em",
            fontWeight: 600,
            lineHeight: 1.12,
            fontSize: "clamp(24px, 4.5vw, 30px)",
            textWrap: "balance",
          }}
        >
          Set a new password
        </h1>

        <p
          style={{
            margin: "10px auto 14px",
            maxWidth: "44ch",
            opacity: 0.76,
            fontSize: 13,
            lineHeight: 1.5,
            textWrap: "balance",
          }}
        >
          Choose a new password for your account.
        </p>

        <InfraPanel>
          {checking ? (
            <div style={{ fontSize: 13, opacity: 0.75 }}>Checking your link…</div>
          ) : null}

          {!checking && !tokenOk ? (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.045)",
                fontSize: 12,
                textAlign: "left",
              }}
            >
              {invalidMsg}
            </div>
          ) : null}

          {!checking && tokenOk && !done ? (
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
              {message ? (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.045)",
                    fontSize: 12,
                    textAlign: "left",
                  }}
                >
                  {message}
                </div>
              ) : null}
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="new password"
                type="password"
                autoComplete="new-password"
                disabled={busy}
                style={inputStyle}
              />
              <input
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="confirm new password"
                type="password"
                autoComplete="new-password"
                disabled={busy}
                style={inputStyle}
              />
              <button
                type="submit"
                data-btn="1"
                disabled={busy || !password || !password2}
                style={{
                  ...buttonStyle,
                  cursor: busy || !password || !password2 ? "not-allowed" : "pointer",
                  opacity: busy || !password || !password2 ? 0.55 : 1,
                }}
              >
                Update password
              </button>
            </form>
          ) : null}

          {done ? (
            <div style={{ fontSize: 13, opacity: 0.9 }}>
              Your password was updated. Redirecting to sign in…
            </div>
          ) : null}

          <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
            <Link href="/login" style={linkStyle}>
              Back to sign in
            </Link>
          </div>
        </InfraPanel>
      </div>
    </InfraShell>
  );
}
