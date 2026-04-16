import type { CSSProperties, ReactNode } from "react";
import { StatCard } from "./primitives";

type Props = {
  label: string;
  value: ReactNode;
  hint?: string;
  style?: CSSProperties;
};

export default function SummaryStatCard({ label, value, hint, style }: Props) {
  return <StatCard label={label} value={value} hint={hint} style={style} />;
}
