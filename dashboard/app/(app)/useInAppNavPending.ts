"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * True after the user activates an in-app navigation (same-origin anchor),
 * until pathname + search updates.
 */
export function useInAppNavPending(): boolean {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const routeKey = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;

  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [routeKey]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = (e.target as Element | null)?.closest?.("a[href]");
      if (!el) return;
      const a = el as HTMLAnchorElement;
      if (a.target && a.target !== "_self") return;
      if (a.download) return;

      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

      try {
        const u = new URL(href, window.location.href);
        if (u.origin !== window.location.origin) return;
        const next = u.pathname + (u.search || "");
        const current = window.location.pathname + window.location.search;
        if (next === current) return;
        setPending(true);
      } catch {
        /* ignore */
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  return pending;
}
