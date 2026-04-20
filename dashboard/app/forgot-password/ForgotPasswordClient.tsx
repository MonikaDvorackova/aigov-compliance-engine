"use client";

import React, { useState } from "react";
import Link from "next/link";
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

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setMessage("Something went wrong. Please try again.");
        return;
      }
      setDone(true);
      setMessage(data.message ?? "If an account exists for this email, we sent a password reset link.");
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

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
          <AigovMark size={88} glow neon neonStrength="strong" tone="steel" />
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
          Forgot password
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
          Enter your email address. If an account exists, we will send a reset link.
        </p>

        <InfraPanel>
          {message ? (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.045)",
                fontSize: 12,
                opacity: 0.95,
                textAlign: "left",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              {message}
            </div>
          ) : null}

          {!done ? (
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email"
                inputMode="email"
                autoComplete="email"
                disabled={busy}
                style={inputStyle}
              />
              <button
                type="submit"
                data-btn="1"
                disabled={busy || !email.trim()}
                style={{
                  ...buttonStyle,
                  cursor: busy || !email.trim() ? "not-allowed" : "pointer",
                  opacity: busy || !email.trim() ? 0.55 : 1,
                }}
              >
                Send reset link
              </button>
            </form>
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
