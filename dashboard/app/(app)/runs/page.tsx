import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RunRow = {
  id: string;
  created_at: string;
  mode: string | null;
  status: string | null;
  policy_version: string | null;
  bundle_sha256: string | null;
  evidence_sha256: string | null;
  report_sha256: string | null;
  evidence_source: string | null;
  closed_at: string | null;
};

function fmt(ts: string | null) {
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

function shortHash(v: string | null) {
  if (!v) return "";
  if (v.length <= 14) return v;
  return `${v.slice(0, 10)}…${v.slice(-4)}`;
}

function norm(v: string | null) {
  return (v ?? "").trim().toLowerCase();
}

function badgeStyle(kind: "neutral" | "ok" | "warn") {
  const border =
    kind === "ok"
      ? "1px solid rgba(255,255,255,0.28)"
      : kind === "warn"
      ? "1px solid rgba(255,255,255,0.34)"
      : "1px solid rgba(255,255,255,0.18)";

  const bg =
    kind === "ok"
      ? "rgba(255,255,255,0.09)"
      : kind === "warn"
      ? "rgba(255,255,255,0.11)"
      : "rgba(255,255,255,0.06)";

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 10px",
    borderRadius: 999,
    border,
    background: bg,
    fontSize: 12,
    lineHeight: "18px",
    whiteSpace: "nowrap" as const,
  };
}

function ModeBadge({ mode }: { mode: string | null }) {
  const m = norm(mode);
  const kind: "neutral" | "ok" | "warn" = m === "prod" ? "warn" : "neutral";
  const label = m ? m : "—";
  return <span style={badgeStyle(kind)}>{label}</span>;
}

function StatusBadge({ status }: { status: string | null }) {
  const s = norm(status);
  const kind: "neutral" | "ok" | "warn" =
    s === "valid" ? "ok" : s === "invalid" ? "warn" : "neutral";
  const label = s ? s : "—";
  return <span style={badgeStyle(kind)}>{label}</span>;
}

function StatPill({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
        fontSize: 13,
      }}
    >
      <span style={{ opacity: 0.72 }}>{label}</span>
      <span style={{ fontWeight: 700, opacity: 0.92 }}>{value}</span>
    </div>
  );
}

export default async function RunsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("[runs/page] AUTH GUARD", { hasUser: Boolean(user) });

  if (!user) {
    console.log("[runs/page] NO USER → redirect(/login)");
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("runs")
    .select(
      "id,created_at,mode,status,policy_version,bundle_sha256,evidence_sha256,report_sha256,evidence_source,closed_at"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const runs = (data ?? []) as RunRow[];
  const total = runs.length;
  const open = runs.filter((r) => !r.closed_at || !String(r.closed_at).trim()).length;
  const prod = runs.filter((r) => norm(r.mode) === "prod").length;
  const invalid = runs.filter((r) => norm(r.status) === "invalid").length;
  const prodNotValid = runs.filter((r) => norm(r.mode) === "prod" && norm(r.status) !== "valid").length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.02em" }}>Runs</h1>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.72 }}>
            Latest 50 runs from the <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>runs</span> table.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatPill label="Shown" value={total} />
          <StatPill label="Open" value={open} />
          <StatPill label="Prod" value={prod} />
          <StatPill label="Invalid" value={invalid} />
          <StatPill label="Prod≠Valid" value={prodNotValid} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {error ? (
          <div
            style={{
              padding: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.02)",
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Load error</div>
            <div style={{ opacity: 0.8 }}>{error.message}</div>
          </div>
        ) : runs.length === 0 ? (
          <div
            style={{
              padding: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.02)",
              fontSize: 13,
              opacity: 0.85,
            }}
          >
            No runs yet.
          </div>
        ) : (
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              overflow: "hidden",
              background: "rgba(0,0,0,0.12)",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                    <th style={{ padding: "10px 10px", textAlign: "left", fontSize: 12, opacity: 0.72 }}>
                      Created
                    </th>
                    <th style={{ padding: "10px 10px", textAlign: "left", fontSize: 12, opacity: 0.72 }}>
                      Mode
                    </th>
                    <th style={{ padding: "10px 10px", textAlign: "left", fontSize: 12, opacity: 0.72 }}>
                      Status
                    </th>
                    <th style={{ padding: "10px 10px", textAlign: "left", fontSize: 12, opacity: 0.72 }}>
                      Policy
                    </th>
                    <th style={{ padding: "10px 10px", textAlign: "left", fontSize: 12, opacity: 0.72 }}>
                      Bundle
                    </th>
                    <th style={{ padding: "10px 10px", textAlign: "left", fontSize: 12, opacity: 0.72 }}>
                      Evidence
                    </th>
                    <th style={{ padding: "10px 10px", textAlign: "left", fontSize: 12, opacity: 0.72 }}>
                      Report
                    </th>
                    <th style={{ padding: "10px 10px", textAlign: "left", fontSize: 12, opacity: 0.72 }}>
                      Source
                    </th>
                    <th style={{ padding: "10px 10px", textAlign: "left", fontSize: 12, opacity: 0.72 }}>
                      Closed
                    </th>
                    <th style={{ padding: "10px 10px", textAlign: "left", fontSize: 12, opacity: 0.72 }}>
                      ID
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {runs.map((r) => {
                    const mode = norm(r.mode);
                    const status = norm(r.status);
                    const prodNotValid = mode === "prod" && status !== "valid";

                    const rowStyle: React.CSSProperties = {
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      background: prodNotValid ? "rgba(255,255,255,0.03)" : "transparent",
                    };

                    return (
                      <tr key={r.id} style={rowStyle}>
                        <td style={{ padding: "10px 10px", whiteSpace: "nowrap", fontSize: 13, opacity: 0.9 }}>
                          {fmt(r.created_at)}
                        </td>

                        <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                          <ModeBadge mode={r.mode} />
                        </td>

                        <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                          <StatusBadge status={r.status} />
                        </td>

                        <td style={{ padding: "10px 10px", whiteSpace: "nowrap", fontSize: 13, opacity: 0.86 }}>
                          {r.policy_version ?? ""}
                        </td>

                        <td
                          style={{
                            padding: "10px 10px",
                            whiteSpace: "nowrap",
                            fontSize: 13,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            opacity: 0.86,
                          }}
                        >
                          {shortHash(r.bundle_sha256)}
                        </td>

                        <td
                          style={{
                            padding: "10px 10px",
                            whiteSpace: "nowrap",
                            fontSize: 13,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            opacity: 0.86,
                          }}
                        >
                          {shortHash(r.evidence_sha256)}
                        </td>

                        <td
                          style={{
                            padding: "10px 10px",
                            whiteSpace: "nowrap",
                            fontSize: 13,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            opacity: 0.86,
                          }}
                        >
                          {shortHash(r.report_sha256)}
                        </td>

                        <td style={{ padding: "10px 10px", whiteSpace: "nowrap", fontSize: 13, opacity: 0.86 }}>
                          {r.evidence_source ?? ""}
                        </td>

                        <td style={{ padding: "10px 10px", whiteSpace: "nowrap", fontSize: 13, opacity: 0.9 }}>
                          {fmt(r.closed_at)}
                        </td>

                        <td
                          style={{
                            padding: "10px 10px",
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            whiteSpace: "nowrap",
                            fontSize: 13,
                          }}
                        >
                          <a
                            href={`/runs/${r.id}`}
                            style={{
                              color: "rgba(255,255,255,0.85)",
                              textDecoration: "underline",
                              textUnderlineOffset: 4,
                              textDecorationColor: "rgba(29,78,216,0.65)",
                            }}
                          >
                            {r.id}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
