import type { CSSProperties, ReactNode } from "react";

const wrap: CSSProperties = {
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
};

export default function ConsoleCanvas({ children }: { children: ReactNode }) {
  return <div style={wrap}>{children}</div>;
}
