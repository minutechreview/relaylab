"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * The header's icon row is a horizontally-scrollable container (mobile
 * fix: keeps every icon reachable instead of clipping off-screen). Setting
 * overflow-x on it implicitly makes overflow-y a clipping context too (CSS
 * spec), so a plain `position: absolute` dropdown anchored inside that row
 * gets clipped/misplaced by the row's own bounds instead of overlaying the
 * page. Portal the panel to document.body and position it with `fixed`
 * coordinates computed from the trigger's own rect, so it always escapes
 * any scrollable/clipping ancestor regardless of where the trigger lives.
 */
export function HeaderMenuPanel({
  anchorRef,
  isOpen,
  children,
  gapPx = 8,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  isOpen: boolean;
  children: ReactNode;
  gapPx?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const top = rect.bottom + gapPx;
      let right = window.innerWidth - rect.right;
      // First pass anchors to the trigger's right edge; the panel's own
      // width isn't known until it's actually rendered (its content sets
      // it, not this wrapper). Once mounted, clamp so it never runs off
      // either edge — a mid-scroll trigger inside the horizontally
      // scrollable header can sit far enough left that naive right-anchoring
      // pushes the panel off the left edge of the viewport.
      const panelWidth = panelRef.current?.getBoundingClientRect().width;
      if (panelWidth !== undefined) {
        const maxRight = window.innerWidth - 8 - panelWidth;
        const minRight = 8;
        right = Math.min(maxRight, Math.max(minRight, right));
      }
      setPosition({ top, right: Math.max(8, right) });
    }
    updatePosition();
    // Re-run once more after the panel itself has painted, now that
    // panelRef has a real width to clamp against.
    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, anchorRef, gapPx]);

  if (!isOpen || !position || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-header-menu-panel="true"
      ref={panelRef}
      style={{
        position: "fixed",
        top: position.top,
        right: position.right,
        maxWidth: "calc(100vw - 16px)",
        zIndex: 100,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Treats clicks inside a portaled HeaderMenuPanel as "inside" for outside-click-to-close checks. */
export function isInsideHeaderMenuPanel(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-header-menu-panel="true"]') !== null;
}
