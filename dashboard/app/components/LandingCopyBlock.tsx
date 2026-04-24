"use client";

type Props = {
  label: string;
  code: string;
  tone?: "neutral" | "ok" | "error";
};

export function LandingCopyBlock({ label, code, tone = "neutral" }: Props) {
  const borderColor =
    tone === "ok"
      ? "color-mix(in srgb, rgba(110, 200, 160, 0.85) 42%, var(--govai-border-faint))"
      : tone === "error"
        ? "color-mix(in srgb, rgba(220, 145, 120, 0.85) 38%, var(--govai-border-faint))"
        : "var(--govai-border-faint)";

  return (
    <div
      className="govai_code_card"
      style={{
        border: `1px solid ${borderColor}`,
      }}
    >
      <div className="govai_code_card__top">
        <div className="govai_code_card__label">{label}</div>
        <button
          type="button"
          className="govai_code_copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code.trimEnd() + "\n");
            } catch {
              // ignore
            }
          }}
        >
          Copy
        </button>
      </div>
      <pre className="govai_code_pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}
