import { describe, expect, it, vi } from "vitest";
import { govaiApiBaseUrl } from "./govaiHostedBilling";

describe("govaiApiBaseUrl", () => {
  it("trims trailing slash from env", () => {
    vi.stubEnv("NEXT_PUBLIC_GOVAI_API_BASE_URL", "https://example.com/govai/");
    expect(govaiApiBaseUrl()).toBe("https://example.com/govai");
    vi.unstubAllEnvs();
  });
});
