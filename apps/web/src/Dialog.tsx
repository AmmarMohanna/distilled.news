import { useEffect, useRef, type ReactNode } from "react";
import { ScreenPages } from "./ScreenPages";

let openDialogs = 0;
let previousOverflow = "";

export function Dialog(props: {
  label: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const startedOutside = useRef(false);

  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (openDialogs++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialog.showModal();
    // Opacity only: fitting measurements stay stable, and controls work immediately.
    const entry = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? dialog.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" })
      : undefined;
    return () => {
      entry?.cancel();
      // The dialog unmounts right away, so leave a faded, inert copy behind: closing eases out instead of vanishing.
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && dialog.isConnected) {
        const ghost = dialog.cloneNode(true) as HTMLDialogElement;
        ghost.removeAttribute("open");
        ghost.setAttribute("inert", "");
        ghost.setAttribute("aria-hidden", "true");
        ghost.removeAttribute("aria-label");
        document.body.appendChild(ghost);
        try {
          ghost.showModal();
          const options = { duration: 140, easing: "ease-in", fill: "forwards" as const };
          ghost.animate([{ opacity: 1 }, { opacity: 0 }], options);
          ghost.animate([{ opacity: 1 }, { opacity: 0 }], { ...options, pseudoElement: "::backdrop" });
          window.setTimeout(() => { try { ghost.close(); } catch { /* already closed */ } ghost.remove(); }, 160);
        } catch { ghost.remove(); }
      }
      dialog.close();
      if (--openDialogs === 0) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  function outside(event: React.MouseEvent<HTMLDialogElement> | React.PointerEvent<HTMLDialogElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget && (
      event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom
    );
  }

  return <dialog
    ref={ref}
    className={`experience-dialog ${props.className ?? ""}`}
    aria-label={props.label}
    onCancel={event => { event.preventDefault(); props.onClose(); }}
    onPointerDown={event => { startedOutside.current = outside(event); }}
    onClick={event => {
      if (startedOutside.current && outside(event)) props.onClose();
      startedOutside.current = false;
    }}
  ><ScreenPages dialog>{props.children}</ScreenPages></dialog>;
}
