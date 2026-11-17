import { type ReactNode } from "react";
import { usePinchZoomLayout } from './usePinchZoomLayout';

// Keep controls at their intended size; longer pages and dialogs scroll naturally.
export function ScreenPages({ children, dialog = false }: { children: ReactNode; dialog?: boolean }) {
  usePinchZoomLayout(!dialog);
  return <div className={`screen-pages ${dialog ? "dialog-pages" : "app-pages"}`}><div className="screen-page-viewport"><div className="screen-page-content">{children}</div></div></div>;
}
