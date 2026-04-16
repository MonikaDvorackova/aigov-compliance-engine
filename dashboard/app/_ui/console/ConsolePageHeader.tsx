import type { ReactNode } from "react";
import { consoleGap, pageLeadStyle, pageTitleStyle } from "./surfaces";

export default function ConsolePageHeader({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <header style={{ marginBottom: consoleGap.afterHeader }}>
      <h1 style={pageTitleStyle()}>{title}</h1>
      {lead != null ? <div style={pageLeadStyle()}>{lead}</div> : null}
    </header>
  );
}
