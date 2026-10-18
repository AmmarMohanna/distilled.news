import { useEffect, type RefObject } from "react";

/** Keep menus above clipping containers and inside the visible viewport. */
export function useVisibleFeedMenu(ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const details = ref.current;
    const panel = details?.querySelector<HTMLElement>(".feed-options-popover");
    const trigger = details?.querySelector("summary");
    if (!details || !panel || !trigger) return;
    panel.setAttribute("popover", "manual");
    const position = () => {
      if (!details.open) { if (panel.matches(":popover-open")) panel.hidePopover(); return; }
      if (!panel.matches(":popover-open")) panel.showPopover();
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0;
      const y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const margin = 12;
      Object.assign(panel.style, { position: "fixed", inset: "auto", margin: "0", boxSizing: "border-box", minWidth: "0", maxWidth: `${Math.max(0, width - margin * 2)}px`, maxHeight: `${Math.max(0, height - margin * 2)}px`, overflowY: "auto" });
      const anchor = trigger.getBoundingClientRect();
      const size = panel.getBoundingClientRect();
      const below = y + height - margin - anchor.bottom - 6;
      const above = anchor.top - y - margin - 6;
      const top = below >= size.height || below >= above ? anchor.bottom + 6 : anchor.top - size.height - 6;
      const rtl = getComputedStyle(details).direction === "rtl";
      panel.style.left = `${Math.max(x + margin, Math.min(rtl ? anchor.left : anchor.right - size.width, x + width - size.width - margin))}px`;
      panel.style.top = `${Math.max(y + margin, Math.min(top, y + height - size.height - margin))}px`;
    };
    details.addEventListener("toggle", position);
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      details.removeEventListener("toggle", position);
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [ref]);
}
