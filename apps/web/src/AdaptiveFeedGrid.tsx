import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Divide the remaining viewport between complete rows, including the gaps. */
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
      const bottom = Math.min(window.innerHeight, viewport?.getBoundingClientRect().bottom ?? window.innerHeight, window.innerWidth < 900 ? navigation?.top ?? window.innerHeight : window.innerHeight);
      const top = rect.top + (viewport?.scrollTop ?? 0) * scale;
      const available = Math.max(80, (bottom - top) / scale - 48);
      const width = grid.clientWidth;
      const roomy = window.innerWidth >= 900 && width >= 640 && available >= 380;
      const columns = Math.min(count, roomy ? 2 : window.innerWidth >= 900 ? Math.max(1, Math.floor((width + 16) / 296)) : width >= 600 ? 2 : 1);
      const gap = window.innerWidth >= 900 ? 16 : 10;
      const minimum = roomy ? 180 : 80;
      // Card design determines density, not how many feeds happen to be saved.
      const visibleRows = Math.max(1, Math.min(roomy ? 2 : 3, Math.floor((available + gap) / (minimum + gap))));
      const rowHeight = Math.floor((available - gap * (visibleRows - 1)) / visibleRows);
      grid.dataset.layout = roomy ? 'large' : 'compact';
      grid.style.setProperty('--feed-columns', String(columns));
      grid.style.setProperty('--feed-row-height', `${rowHeight}px`);
      grid.style.setProperty('--feed-grid-height', `${visibleRows * rowHeight + gap * (visibleRows - 1)}px`);
      grid.style.setProperty('--feed-grid-gap', `${gap}px`);
      grid.style.setProperty('--feed-image-height', `${Math.max(56, rowHeight - 152)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    const main = grid.closest('main');
    if (main) observer.observe(main);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [count]);
  return <div className={`adaptive-feed-grid ${className}`} ref={ref}>{children}</div>;
}
