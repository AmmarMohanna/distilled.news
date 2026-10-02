import { useLayoutEffect, useRef, type ReactNode } from "react";

// Every page uses the same scale for this viewport, based on the largest page
// encountered in the session. Long pages scroll once the compact scale is reached.
export function ScreenPages({ children, dialog = false }: { children: ReactNode; dialog?: boolean }) {
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = content.current!;
    let frame = 0;
    let fitting = false;
    let lastHeight = 0;
    const fit = () => {
      if (fitting) return;
      fitting = true;
      const available = Math.max(1, (window.visualViewport?.height ?? innerHeight) - (dialog ? 32 : 0));
      const minimumScale = dialog ? 0.7 : 0.85;
      const key = `dn-layout-scale:v2:${dialog ? "dialog" : "page"}:${innerWidth}:${available}`;
      let scale = Math.max(minimumScale, Math.min(1, Number(sessionStorage.getItem(key)) || 1));
      node.style.zoom = String(scale);
      if (node.getBoundingClientRect().height > available) {
        let low = minimumScale, high = scale;
        for (let i = 0; i < 14; i++) {
          const mid = (low + high) / 2;
          node.style.zoom = String(mid);
          if (node.getBoundingClientRect().height <= available) low = mid;
          else high = mid;
        }
        scale = low;
      }
      sessionStorage.setItem(key, String(scale));
      node.style.zoom = String(scale);
      document.documentElement.style.setProperty(dialog ? "--dialog-scale" : "--page-scale", String(scale));
      lastHeight = node.getBoundingClientRect().height;
      fitting = false;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    const resize = new ResizeObserver(() => {
      if (!fitting && Math.abs(node.getBoundingClientRect().height - lastHeight) > 1) schedule();
    });
    resize.observe(node);
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.target !== node)) schedule();
    });
    mutations.observe(node, { subtree: true, childList: true, characterData: true, attributes: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    node.addEventListener("load", schedule, true);
    fit();
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      node.removeEventListener("load", schedule, true);
    };
  }, [dialog]);
  return <div className={`screen-pages ${dialog ? "dialog-pages" : "app-pages"}`}><div className="screen-page-viewport"><div ref={content} className="screen-page-content">{children}</div></div></div>;
}
