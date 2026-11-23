import { Children, useLayoutEffect, useRef, type ReactNode } from 'react';

/** Fit two complete rows where possible while keeping the page scrollable. */
export function AdaptiveFeedGrid({ children, view }: { children: ReactNode; view: "home" | "explore" }) {
  const ref = useRef<HTMLDivElement>(null);
  const count = Children.count(children);
  useLayoutEffect(() => {
    const grid = ref.current!;
    const viewport = grid.closest<HTMLElement>('.screen-page-viewport');
    const fit = () => {
      if ((window.visualViewport?.scale ?? 1) > 1.01 || document.documentElement.hasAttribute('data-page-magnified')) return;
      const width = grid.clientWidth;
      if (!width) return;

      const gap = parseFloat(getComputedStyle(grid).columnGap);
      const preferred = Math.max(135, Math.min(window.innerHeight * 0.17, 200));
      const columns = Math.max(1, Math.min(count, Math.floor((width + gap) / (preferred + gap))));
      const bounds = grid.getBoundingClientRect();
      const scale = bounds.width / width;
      const bottom = Math.min(window.innerHeight, viewport?.getBoundingClientRect().bottom ?? window.innerHeight);
      const available = (bottom - bounds.top) / scale - (viewport?.scrollTop ?? window.scrollY) - 8;
      let caption = 0;
      for (const node of grid.querySelectorAll<HTMLElement>('.feed-tile-caption')) {
        caption = Math.max(caption, node.offsetHeight + 9);
      }
      const naturalSize = Math.min((width + gap) / columns - gap, Math.max(170, Math.min(window.innerHeight * 0.39, 280)));
      const oneRow = available - caption;
      const twoRows = (available - gap) / 2 - caption;
      let fittedColumns = '';
      let fittedSize = '';
      if (count > columns && twoRows < naturalSize) {
        const widthInOneRow = (width + gap) / count - gap;
        if (widthInOneRow >= 120 && widthInOneRow + caption <= available) {
          fittedColumns = String(count);
        } else if (twoRows >= 120) {
          fittedSize = Math.floor(twoRows) + 'px';
        }
      }
      if (!fittedColumns && !fittedSize && oneRow >= 120 && oneRow < naturalSize) {
        fittedSize = Math.floor(oneRow) + 'px';
      }
      if (grid.style.getPropertyValue('--feed-fit-columns') !== fittedColumns) grid.style.setProperty('--feed-fit-columns', fittedColumns);
      if (grid.style.getPropertyValue('--feed-fit-size') !== fittedSize) grid.style.setProperty('--feed-fit-size', fittedSize);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(grid);
    if (viewport) observer.observe(viewport);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [count]);
  return <div className="adaptive-feed-grid feed-tile-grid" data-feed-view={view} ref={ref}>{children}</div>;
}
