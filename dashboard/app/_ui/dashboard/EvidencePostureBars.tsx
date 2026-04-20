type BarKind = "bundle" | "artifact";

type EvidencePostureBarsProps = {
  withBundle: number;
  withEvidenceJson: number;
  withReport: number;
  sampleSize: number;
};

function pct(present: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((present / total) * 100);
}

function fillClass(kind: BarKind, p: number): string {
  if (kind === "bundle") {
    if (p >= 100) return "govai-posture-fill--bar-bundle";
    if (p > 0) return "govai-posture-fill--bar-warning";
    return "govai-posture-fill--bar-danger";
  }
  /* Evidence / Report: complete → success matte; partial → muted warning; empty → danger */
  if (p >= 100) return "govai-posture-fill--bar-success";
  if (p > 0) return "govai-posture-fill--bar-warning-artifact";
  return "govai-posture-fill--bar-danger";
}

function BarRow({
  name,
  present,
  total,
  kind,
}: {
  name: string;
  present: number;
  total: number;
  kind: BarKind;
}) {
  const p = pct(present, total);
  const fill = fillClass(kind, p);
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="mb-1 flex justify-between gap-3 text-xs">
        <span className="font-medium uppercase tracking-wider [color:var(--govai-text-muted)]">{name}</span>
        <span className="tabular-nums [color:var(--govai-text-secondary)]">
          {present}/{total} ({p}%)
        </span>
      </div>
      <div className="govai-posture-track">
        <div className={`govai-posture-fill ${fill}`} style={{ width: `${Math.min(100, p)}%` }} />
      </div>
    </div>
  );
}

/** Technical readouts — steel / bronze / oxidized fills; labels carry meaning. */
export function EvidencePostureBars({ withBundle, withEvidenceJson, withReport, sampleSize }: EvidencePostureBarsProps) {
  return (
    <div className="max-w-md">
      <BarRow name="Bundle" present={withBundle} total={sampleSize} kind="bundle" />
      <BarRow name="Evidence JSON" present={withEvidenceJson} total={sampleSize} kind="artifact" />
      <BarRow name="Report" present={withReport} total={sampleSize} kind="artifact" />
    </div>
  );
}
