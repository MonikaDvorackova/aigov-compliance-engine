import { describe, expect, it } from "vitest";
import { sha256Hex } from "./token";

describe("password reset token hashing", () => {
  it("hashes deterministically (hex digest for storage)", () => {
    expect(sha256Hex("test")).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
    );
  });
});
