export function fmt(ts: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortHash(v: string | null) {
  if (!v) return "";
  if (v.length <= 14) return v;
  return `${v.slice(0, 10)}…${v.slice(-4)}`;
}

export function norm(v: string | null) {
  return (v ?? "").trim().toLowerCase();
}

export function hasTrimmed(v: string | null) {
  return Boolean(v && String(v).trim().length > 0);
}

/** Relative phrase for “last seen” style copy (English, short). */
export function relativeTimeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return fmt(iso);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return fmt(iso);
}

export type ActivityTier = "active" | "recent" | "stale";

/** Classify recency of last activity for register / queue signals. */
export function activityTierFromLastSeen(iso: string | null): ActivityTier {
  if (!iso) return "stale";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "stale";
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 2) return "active";
  if (days < 14) return "recent";
  return "stale";
}
