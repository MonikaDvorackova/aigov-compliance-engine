import { describe, expect, it } from "vitest";

import { joinRepoBlobUrl } from "./fileBaseUrl";

describe("joinRepoBlobUrl", () => {
  it("joins base and nested path with single slash", () => {
    expect(joinRepoBlobUrl("https://github.com/org/repo/blob/main", "a/b/c.ts")).toBe(
      "https://github.com/org/repo/blob/main/a/b/c.ts"
    );
  });

  it("strips trailing slashes on base without duplicating", () => {
    expect(joinRepoBlobUrl("https://github.com/org/repo/blob/main/", "x.py")).toBe(
      "https://github.com/org/repo/blob/main/x.py"
    );
    expect(joinRepoBlobUrl("https://github.com/org/repo/blob/main///", "x.py")).toBe(
      "https://github.com/org/repo/blob/main/x.py"
    );
  });

  it("normalizes backslashes and leading slashes", () => {
    expect(joinRepoBlobUrl("https://x/blob/main", "\\a\\b\\c")).toBe("https://x/blob/main/a/b/c");
    expect(joinRepoBlobUrl("https://x/blob/main", "/a/b")).toBe("https://x/blob/main/a/b");
  });

  it("encodes each segment once (special chars, spaces, hash)", () => {
    expect(joinRepoBlobUrl("https://x/blob/main", "src/file #1.ts")).toBe(
      "https://x/blob/main/src/file%20%231.ts"
    );
    expect(joinRepoBlobUrl("https://x/blob/main", "weird?.tsx")).toBe(
      "https://x/blob/main/weird%3F.tsx"
    );
  });

  it("does not encode path separators as %2F", () => {
    const u = joinRepoBlobUrl("https://x/blob/main", "pkg/sub/file.py");
    expect(u).toContain("/pkg/sub/");
    expect(u).not.toContain("%2F");
  });

  it("handles empty relative path as base only", () => {
    expect(joinRepoBlobUrl("https://x/blob/main", "")).toBe("https://x/blob/main");
  });
});
