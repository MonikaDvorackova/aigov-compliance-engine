"use client";

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

function createSupabaseBrowserClient() {
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

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInEmailPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signErr) {
        setError(signErr.message);
        setBusy(false);
        return;
      }

      router.push("/runs");
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function signInGoogle() {
    setBusy(true);
    setError(null);

    try {
      const { error: signErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/runs`,
        },
      });

      if (signErr) {
        setError(signErr.message);
        setBusy(false);
        return;
      }
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>AIGov Dashboard Login</h1>
      <p style={{ marginTop: 8, opacity: 0.85 }}>
        Přihlas se, aby šlo načíst runs z databáze.
      </p>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={signInGoogle}
          disabled={busy}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Continue with Google
        </button>
      </div>

      <div style={{ marginTop: 18, opacity: 0.7, fontSize: 13 }}>
        Nebo email a heslo
      </div>

      <form onSubmit={signInEmailPassword} style={{ marginTop: 10, display: "grid", gap: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          inputMode="email"
          autoComplete="email"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent",
          }}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          type="password"
          autoComplete="current-password"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent",
          }}
        />

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Sign in
        </button>

        {error ? (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.2)",
              opacity: 0.9,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}
      </form>
    </main>
  );
}
