import type { NextRequest } from "next/server";
import { getPasswordResetPool } from "./pgPool";
import { generateRawResetToken, sha256Hex } from "./token";
import { sendPasswordResetEmail } from "@/lib/mail/sendPasswordResetEmail";
import { createSupabaseServiceRoleClient } from "@/lib/auth/supabaseAdmin";

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function validateNewPasswordRules(password: string): { ok: true } | { ok: false; message: string } {
  const p = password;
  if (p.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (p.length > 72) return { ok: false, message: "Password is too long." };
  return { ok: true };
}

type AuthUserRow = {
  id: string;
  has_password: boolean;
};

async function findAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
  const pool = getPasswordResetPool();
  const res = await pool.query<AuthUserRow>(
    `
    select
      id::text as id,
      (encrypted_password is not null and length(btrim(encrypted_password)) > 0) as has_password
    from auth.users
    where lower(email) = lower($1)
    limit 1
    `,
    [email.trim()]
  );
  if ((res.rowCount ?? 0) === 0) return null;
  return res.rows[0] ?? null;
}

export async function requestPasswordReset(email: string, request?: NextRequest): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return;
  }

  let user: AuthUserRow | null = null;
  try {
    user = await findAuthUserByEmail(normalized);
  } catch (e) {
    console.error("[password-reset] lookup failed", e instanceof Error ? e.message : e);
    return;
  }

  if (!user || !user.has_password) {
    return;
  }

  const raw = generateRawResetToken();
  const tokenHash = sha256Hex(raw);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

  try {
    const pool = getPasswordResetPool();
    await pool.query(
      `
      insert into public.password_reset_tokens (user_id, token_hash, expires_at)
      values ($1::uuid, $2, $3)
      `,
      [user.id, tokenHash, expiresAt.toISOString()]
    );
  } catch (e) {
    console.error("[password-reset] token insert failed", e instanceof Error ? e.message : e);
    return;
  }

  try {
    await sendPasswordResetEmail({ to: normalized, rawResetToken: raw, request });
  } catch (e) {
    console.error("[password-reset] mail send failed", e instanceof Error ? e.message : e);
  }
}

export async function validatePasswordResetToken(rawToken: string): Promise<boolean> {
  const t = rawToken.trim();
  if (!t) return false;

  const tokenHash = sha256Hex(t);

  try {
    const pool = getPasswordResetPool();
    const res = await pool.query<{ used_at: string | null; expires_at: string }>(
      `
      select used_at, expires_at
      from public.password_reset_tokens
      where token_hash = $1
      limit 1
      `,
      [tokenHash]
    );
    if ((res.rowCount ?? 0) === 0) return false;
    const row = res.rows[0];
    if (!row) return false;
    if (row.used_at) return false;
    if (new Date(row.expires_at).getTime() <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

type TokenRow = {
  id: string;
  user_id: string;
};

async function loadActiveResetToken(rawToken: string): Promise<TokenRow | null> {
  const tokenHash = sha256Hex(rawToken.trim());
  const pool = getPasswordResetPool();
  const res = await pool.query<TokenRow>(
    `
    select id::text as id, user_id::text as user_id
    from public.password_reset_tokens
    where token_hash = $1
      and used_at is null
      and expires_at > now()
    limit 1
    `,
    [tokenHash]
  );
  if ((res.rowCount ?? 0) === 0) return null;
  return res.rows[0] ?? null;
}

export async function confirmPasswordReset(
  rawToken: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; code: "invalid_or_expired" | "weak_password" | "server_error" }> {
  const rules = validateNewPasswordRules(newPassword);
  if (!rules.ok) {
    return { ok: false, code: "weak_password" };
  }

  const raw = rawToken.trim();
  if (!raw) return { ok: false, code: "invalid_or_expired" };

  let tokenRow: TokenRow | null = null;
  try {
    tokenRow = await loadActiveResetToken(raw);
  } catch (e) {
    console.error("[password-reset] load token failed", e instanceof Error ? e.message : e);
    return { ok: false, code: "server_error" };
  }

  if (!tokenRow) return { ok: false, code: "invalid_or_expired" };

  let admin;
  try {
    admin = createSupabaseServiceRoleClient();
  } catch (e) {
    console.error("[password-reset] admin client", e instanceof Error ? e.message : e);
    return { ok: false, code: "server_error" };
  }

  const { error } = await admin.auth.admin.updateUserById(tokenRow.user_id, { password: newPassword });

  if (error) {
    console.error("[password-reset] admin update user failed", error.message);
    return { ok: false, code: "server_error" };
  }

  const pool = getPasswordResetPool();
  try {
    await pool.query(
      `
      update public.password_reset_tokens
      set used_at = now()
      where id = $1::uuid
      `,
      [tokenRow.id]
    );

    await pool.query(
      `
      update public.password_reset_tokens
      set used_at = now()
      where user_id = $1::uuid and used_at is null and id <> $2::uuid
      `,
      [tokenRow.user_id, tokenRow.id]
    );
  } catch (e) {
    console.error("[password-reset] token finalize after password update", e instanceof Error ? e.message : e);
  }

  // Best-effort session revocation: GoTrue may already invalidate refresh tokens on admin password updates.
  try {
    await pool.query("delete from auth.sessions where user_id = $1::uuid", [tokenRow.user_id]);
  } catch {
    /* ignore if table/column layout differs */
  }

  try {
    await pool.query("delete from auth.refresh_tokens where user_id = $1::uuid", [tokenRow.user_id]);
  } catch {
    /* ignore if table/column layout differs */
  }

  return { ok: true };
}
