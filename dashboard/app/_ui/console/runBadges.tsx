import { norm } from "@/lib/console/runFormat";
import { badgeToneStyle } from "./surfaces";

export function ModeBadge({ mode }: { mode: string | null }) {
  const m = norm(mode);
  const kind: "neutral" | "ok" | "issue" = m === "prod" ? "issue" : "neutral";
  const label = m ? m : "—";
  return <span style={badgeToneStyle(kind)}>{label}</span>;
}

export function StatusBadge({ status }: { status: string | null }) {
  const s = norm(status);
  const kind: "neutral" | "ok" | "error" =
    s === "valid" ? "ok" : s === "invalid" ? "error" : "neutral";
  const label = s ? s : "—";
  return <span style={badgeToneStyle(kind)}>{label}</span>;
}

/** Policy register: emphasize problems; quiet when clear; unknown when no prod signal. */
export function PolicyHealthBadge({ status }: { status: "attention" | "ok" | "unknown" }) {
  if (status === "attention") {
    return <span style={badgeToneStyle("issue")}>Needs attention</span>;
  }
  if (status === "unknown") {
    return <span style={badgeToneStyle("neutral")}>Unknown</span>;
  }
  return (
    <span style={{ ...badgeToneStyle("neutral"), opacity: 0.88, fontWeight: 500, fontSize: 11 }}>
      No prod issues
    </span>
  );
}
