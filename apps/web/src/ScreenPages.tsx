import { type ReactNode } from "react";

// Keep controls at their intended size; longer pages and dialogs scroll naturally.
export function ScreenPages({ children, dialog = false }: { children: ReactNode; dialog?: boolean }) {
  return <div className={`screen-pages ${dialog ? "dialog-pages" : "app-pages"}`}><div className="screen-page-viewport"><div className="screen-page-content">{children}</div></div></div>;
}
