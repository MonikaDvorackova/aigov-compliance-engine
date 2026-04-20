import type { DiscoveryScanContextFields } from "./scanHistoryTypes";

function firstTrimmed(...vals: (string | undefined)[]): string | null {
  for (const v of vals) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) return t;
  }
  return null;
}

/**
 * Reads only well-known environment variables (e.g. Vercel, GitHub Actions, generic git).
 * Does not invent URLs or SHAs; returns null when unset.
 */
export function gatherScanContextFromEnvironment(): Pick<
  DiscoveryScanContextFields,
  "projectId" | "repoUrl" | "branch" | "commitSha"
> {
  const githubRef = process.env.GITHUB_REF?.trim();
  const branchFromRef =
    githubRef?.startsWith("refs/heads/") ? githubRef.slice("refs/heads/".length) : null;

  return {
    projectId: firstTrimmed(process.env.VERCEL_PROJECT_ID, process.env.AI_DISCOVERY_PROJECT_ID),
    repoUrl: firstTrimmed(
      process.env.VERCEL_GIT_REPOSITORY_URL,
      process.env.GIT_REPOSITORY_URL,
      process.env.REPOSITORY_URL,
      process.env.GITHUB_REPOSITORY_URL
    ),
    branch: firstTrimmed(
      process.env.VERCEL_GIT_COMMIT_REF,
      process.env.GITHUB_REF_NAME,
      process.env.GITHUB_HEAD_REF,
      branchFromRef ?? undefined,
      process.env.GIT_BRANCH
    ),
    commitSha: firstTrimmed(
      process.env.VERCEL_GIT_COMMIT_SHA,
      process.env.GITHUB_SHA,
      process.env.GIT_COMMIT
    ),
  };
}
