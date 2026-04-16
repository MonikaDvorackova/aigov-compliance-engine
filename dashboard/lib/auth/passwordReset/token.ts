import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateRawResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Constant-time compare of a raw token to a stored SHA-256 hex digest. */
export function rawTokenMatchesHash(rawToken: string, storedHashHex: string): boolean {
  const digest = sha256Hex(rawToken);
  const a = Buffer.from(digest, "hex");
  const b = Buffer.from(storedHashHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
