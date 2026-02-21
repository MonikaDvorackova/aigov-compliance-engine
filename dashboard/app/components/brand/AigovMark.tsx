"use client";

import React, { useEffect, useState } from "react";
import AigovMarkStatic from "./AigovMarkStatic";
import AigovMarkAnimated from "./AigovMarkAnimated";

export type AigovMarkProps = React.SVGProps<SVGSVGElement> & {
  isRunning?: boolean;
};

export default function AigovMark({ isRunning = false, ...svgProps }: AigovMarkProps) {
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);

    apply();

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }

    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, []);

  if (isRunning && !reduceMotion) {
    return <AigovMarkAnimated {...svgProps} />;
  }

  return <AigovMarkStatic {...svgProps} />;
}