"use client";

import React from "react";
import AigovMark from "@/app/components/brand/AigovMark";

/**
 * Brand assemble animation while model evaluation has not produced a boolean result yet.
 */
export function ComplianceEvaluationMark({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", lineHeight: 0 }}
      title="Evaluation in progress"
      aria-label="Evaluation in progress"
    >
      <AigovMark isRunning animationMode="assemble" size={36} glow={false} neon={false} tone="steel" />
    </span>
  );
}
