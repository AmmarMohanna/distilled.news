import { Children, useLayoutEffect, useRef, type ReactNode } from 'react';

/** Fit complete rows where possible while keeping the page scrollable. */
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

      const { columnGap, rowGap } = getComputedStyle(grid);
      const gap = parseFloat(columnGap);
      const preferred = Math.max(135, Math.min(window.innerHeight * 0.17, 200));
      const columns = Math.max(1, Math.min(count, Math.floor((width + gap) / (preferred + gap))));
      const bounds = grid.getBoundingClientRect();
      const scale = bounds.width / width;
      const bottom = Math.min(window.innerHeight, viewport?.getBoundingClientRect().bottom ?? window.innerHeight);
      const available = (bottom - bounds.top) / scale - (viewport?.scrollTop ?? window.scrollY) - 8;
      let caption = 0;
      for (const tile of grid.querySelectorAll<HTMLElement>('.feed-tile')) {
        const label = tile.querySelector<HTMLElement>('.feed-tile-caption');
        const cover = tile.querySelector<HTMLElement>('.feed-tile-cover');
        if (!label || !cover) continue;
        caption = Math.max(caption, label.offsetHeight + parseFloat(getComputedStyle(label).marginBlockStart)
          + parseFloat(getComputedStyle(cover).marginBlockEnd));
      }
      const naturalSize = Math.min((width + gap) / columns - gap, Math.max(170, Math.min(window.innerHeight * 0.39, 280)));
      const verticalGap = parseFloat(rowGap);
      const minimumSize = 120;
      const rowsNeeded = Math.ceil(count / columns);
      const rowsAtMinimum = Math.floor((available + verticalGap) / (minimumSize + caption + verticalGap));
      const fittedRows = Math.min(rowsNeeded, rowsAtMinimum);
      let fittedColumns = '';
      let fittedSize = '';
      if (rowsNeeded > 1 && fittedRows === 1) {
        const widthInOneRow = (width + gap) / count - gap;
        if (widthInOneRow >= minimumSize && widthInOneRow + caption <= available) {
          fittedColumns = String(count);
        }
      }
      if (!fittedColumns && fittedRows > 0) {
        const size = (available - (fittedRows - 1) * verticalGap) / fittedRows - caption;
        if (size >= minimumSize && size < naturalSize) fittedSize = Math.floor(size) + 'px';
      }
      if (!fittedColumns && window.matchMedia('(max-width: 520px)').matches) fittedColumns = String(columns);
      if (grid.style.getPropertyValue('--feed-fit-columns') !== fittedColumns) grid.style.setProperty('--feed-fit-columns', fittedColumns);
      if (grid.style.getPropertyValue('--feed-fit-size') !== fittedSize) grid.style.setProperty('--feed-fit-size', fittedSize);
    };
    fit();
    let observedWidth = grid.clientWidth;
    let observedHeight = viewport?.clientHeight ?? window.innerHeight;
    const observer = new ResizeObserver(() => {
      const width = grid.clientWidth;
      const height = viewport?.clientHeight ?? window.innerHeight;
      // A fitted tile can change its caption's wrapping and the grid height.
      // Refitting from that change alone can alternate between two sizes.
      if (width === observedWidth && height === observedHeight) return;
      observedWidth = width;
      observedHeight = height;
      fit();
    });
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
