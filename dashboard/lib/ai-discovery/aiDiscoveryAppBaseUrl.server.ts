/**
 * Public URL for linking to AI Discovery in Slack alerts.
 * Prefer `AI_DISCOVERY_APP_BASE_URL`, then `NEXT_PUBLIC_SITE_URL`, then `VERCEL_URL`.
 */
export function resolveAiDiscoveryHistoryPageUrl(): string | null {
  const explicit =
    process.env.AI_DISCOVERY_APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercel = process.env.VERCEL_URL?.trim();
  const base = explicit || (vercel ? `https://${vercel}` : "");
  if (!base) return null;
  const normalized = base.replace(/\/$/, "");
  return `${normalized}/ai-discovery`;
}
