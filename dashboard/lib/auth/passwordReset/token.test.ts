import { describe, expect, it } from "vitest";
import { generateRawResetToken, sha256Hex } from "./token";

describe("password reset tokens", () => {
  it("hashes deterministically (hex digest for storage)", () => {
    expect(sha256Hex("test")).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
    );
  });

  it("generates 32 bytes of entropy as base64url (feature path)", () => {
    const a = generateRawResetToken();
    const b = generateRawResetToken();
    expect(a).not.toBe(b);
    expect(a.length).toBe(43);
    expect(b.length).toBe(43);
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
    expect(sha256Hex(a)).toMatch(/^[a-f0-9]{64}$/);
  });
});
