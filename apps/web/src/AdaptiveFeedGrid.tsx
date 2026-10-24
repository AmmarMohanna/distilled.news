import { useLayoutEffect, useRef, type ReactNode } from 'react';

export function feedGridLayout(count: number, width: number, available: number, desktop: boolean) {
  const roomy = desktop && width >= 640 && available >= 380;
  const columns = Math.max(1, Math.min(count, roomy ? 2 : desktop ? Math.max(1, Math.floor((width + 16) / 296)) : width >= 600 ? 2 : 1));
  const gap = desktop ? 16 : 10;
  const minimum = roomy ? 160 : 84;
  // Leave bottom breathing room before sizing complete visible rows.
  const space = Math.max(0, available - 24);
  const rows = Math.max(1, Math.min(Math.ceil(count / columns), Math.floor((space + gap) / (minimum + gap))));
  const rowHeight = Math.max(minimum, Math.min(roomy ? 208 : 120, Math.floor((space - (rows - 1) * gap) / rows)));
  return { columns, gap, roomy, rows, rowHeight };
}

/** Keep every feed in one adaptive list without pagination. */
export function AdaptiveFeedGrid({ children, className, count }: { children: ReactNode; className: string; count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid || !count) return;
    const measure = () => {
      const rect = grid.getBoundingClientRect();
      const scale = grid.offsetWidth ? rect.width / grid.offsetWidth : 1;
      const viewport = grid.closest<HTMLElement>('.screen-page-viewport');
      const navigation = document.querySelector('.bottom-navigation')?.getBoundingClientRect();
      const bottom = Math.min(window.innerHeight, window.innerWidth < 900 ? navigation?.top ?? window.innerHeight : window.innerHeight);
      const top = rect.top + (viewport?.scrollTop ?? 0) * scale;
      const layout = feedGridLayout(count, grid.clientWidth, Math.max(0, (bottom - top) / scale), window.innerWidth >= 900);
      grid.dataset.layout = 'list';
      grid.dataset.size = layout.roomy ? 'large' : 'compact';
      grid.style.setProperty('--feed-columns', String(layout.columns));
      grid.style.setProperty('--feed-row-height', layout.rowHeight + 'px');
      grid.style.setProperty('--feed-visible-height', (layout.rows * layout.rowHeight + (layout.rows - 1) * layout.gap) + 'px');
      grid.style.setProperty('--feed-grid-gap', layout.gap + 'px');
      grid.style.setProperty('--feed-art-size', (layout.roomy ? Math.min(112, layout.rowHeight - 86) : Math.min(64, layout.rowHeight - 18)) + 'px');
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    const main = grid.closest('main');
    if (main) observer.observe(main);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [count]);
  return <div className={'adaptive-feed-grid ' + className} ref={ref}>{children}</div>;
}
