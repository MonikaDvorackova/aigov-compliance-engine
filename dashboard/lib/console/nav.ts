export type ConsoleNavItem = {
  href: string;
  title: string;
  subtitle: string;
};

export const CONSOLE_NAV: ConsoleNavItem[] = [
  { href: "/runs", title: "Runs", subtitle: "Operational ledger & review" },
  { href: "/policies", title: "Policies", subtitle: "Version register from runs" },
  { href: "/evidence", title: "Evidence", subtitle: "Audit posture & artifact register" },
  { href: "/ai-discovery", title: "AI discovery", subtitle: "Signals in your codebase" },
];

export function navMetaForPath(pathname: string): ConsoleNavItem {
  const hit = CONSOLE_NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return hit ?? CONSOLE_NAV[0];
}
