import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { norm } from "@/lib/console/runFormat";
import type { RunRow } from "@/lib/console/runTypes";

import { RunsLedgerTableBody } from "./RunsLedgerTableBody";

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
                  <RunsLedgerTableBody runs={runs} />
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
