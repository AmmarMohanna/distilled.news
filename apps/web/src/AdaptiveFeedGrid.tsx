import type { ReactNode } from 'react';

/** Let the grid wrap while every tile keeps its full artwork and caption. */
export function AdaptiveFeedGrid({ children, view }: { children: ReactNode; view: "home" | "explore" }) {
  return <div className="adaptive-feed-grid feed-tile-grid" data-feed-view={view}>{children}</div>;
}
