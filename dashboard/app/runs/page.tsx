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
  return d.toLocaleString("cs-CZ", {
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
      ? "1px solid rgba(255,255,255,0.36)"
      : "1px solid rgba(255,255,255,0.18)";

  const bg =
    kind === "ok"
      ? "rgba(255,255,255,0.08)"
      : kind === "warn"
      ? "rgba(255,255,255,0.10)"
      : "rgba(255,255,255,0.06)";

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 8px",
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
  const kind: "neutral" | "ok" | "warn" =
    m === "prod" ? "warn" : m === "ci" ? "neutral" : "neutral";

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

export default async function RunsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("runs")
    .select(
      "id,created_at,mode,status,policy_version,bundle_sha256,evidence_sha256,report_sha256,evidence_source,closed_at"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const runs = (data ?? []) as RunRow[];

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>Runs</h1>
      <p style={{ marginTop: 8, marginBottom: 16, opacity: 0.8 }}>
        Posledních 50 runů z tabulky runs.
      </p>

      {error ? (
        <div
          style={{
            padding: 14,
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Chyba načtení</div>
          <div style={{ opacity: 0.85, fontSize: 13 }}>{error.message}</div>
        </div>
      ) : runs.length === 0 ? (
        <div
          style={{
            padding: 14,
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 12,
          }}
        >
          <div style={{ opacity: 0.85, fontSize: 13 }}>
            Zatím tu nejsou žádné runs.
          </div>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.06)" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>
                    Created
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>
                    Mode
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>
                    Status
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>
                    Policy
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>
                    Bundle
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>
                    Evidence
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>
                    Report
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>
                    Source
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>
                    Closed
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>ID</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const mode = norm(r.mode);
                  const status = norm(r.status);
                  const prodNotValid = mode === "prod" && status !== "valid";

                  const rowStyle: React.CSSProperties = {
                    borderTop: "1px solid rgba(255,255,255,0.10)",
                    background: prodNotValid ? "rgba(255,255,255,0.05)" : "transparent",
                  };

                  return (
                    <tr key={r.id} style={rowStyle}>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {fmt(r.created_at)}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <ModeBadge mode={r.mode} />
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <StatusBadge status={r.status} />
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {r.policy_version ?? ""}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {shortHash(r.bundle_sha256)}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {shortHash(r.evidence_sha256)}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {shortHash(r.report_sha256)}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {r.evidence_source ?? ""}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {fmt(r.closed_at)}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <a
                          href={`/runs/${r.id}`}
                          style={{ textDecoration: "underline" }}
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
    </main>
  );
}
