"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

import { ModeBadge, StatusBadge } from "@/app/_ui/console/runBadges";
import { fmt, norm, shortHash } from "@/lib/console/runFormat";
import type { RunRow } from "@/lib/console/runTypes";

export function RunsLedgerTableBody({ runs }: { runs: RunRow[] }) {
  const router = useRouter();

  return (
    <>
      {runs.map((r) => {
        const mode = norm(r.mode);
        const status = norm(r.status);
        const prodNotValid = mode === "prod" && status !== "valid";

        const rowStyle: CSSProperties = {
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: prodNotValid ? "rgba(255,255,255,0.03)" : "transparent",
        };

        const href = `/runs/${r.id}`;
        const go = () => {
          router.push(href);
        };

        return (
          <tr
            key={r.id}
            className="govai-run-row"
            style={rowStyle}
            tabIndex={0}
            aria-label={`Open run ${r.id}`}
            onClick={go}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              go();
            }}
          >
            <td style={{ padding: "10px 10px", whiteSpace: "nowrap", fontSize: 13, opacity: 0.9 }}>{fmt(r.created_at)}</td>

            <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
              <ModeBadge mode={r.mode} />
            </td>

            <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
              <StatusBadge status={r.status} />
            </td>

            <td style={{ padding: "10px 10px", whiteSpace: "nowrap", fontSize: 13, opacity: 0.86 }}>{r.policy_version ?? ""}</td>

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

            <td style={{ padding: "10px 10px", whiteSpace: "nowrap", fontSize: 13, opacity: 0.86 }}>{r.evidence_source ?? ""}</td>

            <td style={{ padding: "10px 10px", whiteSpace: "nowrap", fontSize: 13, opacity: 0.9 }}>{fmt(r.closed_at)}</td>

            <td
              style={{
                padding: "10px 10px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                whiteSpace: "nowrap",
                fontSize: 13,
              }}
            >
              <Link
                href={href}
                prefetch
                onClick={(e) => e.stopPropagation()}
                style={{
                  color: "rgba(255,255,255,0.85)",
                  textDecoration: "underline",
                  textUnderlineOffset: 4,
                  textDecorationColor: "rgba(29,78,216,0.65)",
                }}
              >
                {r.id}
              </Link>
            </td>
          </tr>
        );
      })}
    </>
  );
}
