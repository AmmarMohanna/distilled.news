import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Keep card interiors consistent while the full feed list flows with the page. */
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
      const available = Math.max(0, (bottom - top) / scale);
      const width = grid.clientWidth;
      let roomy = window.innerWidth >= 900 && width >= 640 && available >= 320;
      const columns = Math.min(count, roomy ? 2 : window.innerWidth >= 900 ? Math.max(1, Math.floor((width + 16) / 296)) : width >= 600 ? 2 : 1);
      const gap = window.innerWidth >= 900 ? 16 : 10;
      const totalRows = Math.ceil(count / columns);
      const fitRows = (preferred: number, minimum: number) => {
        if (totalRows * preferred + (totalRows - 1) * gap <= available) return preferred;
        let rows = Math.max(1, Math.ceil((available + gap) / (preferred + gap)));
        let height = (available - (rows - 1) * gap) / rows;
        if (height < minimum) {
          rows = Math.max(1, Math.floor((available + gap) / (minimum + gap)));
          height = (available - (rows - 1) * gap) / rows;
        }
        return Math.max(minimum, height);
      };
      if (roomy && fitRows(208, 160) > 240) roomy = false;
      const rowHeight = roomy ? fitRows(208, 160) : fitRows(84, 64);
      grid.dataset.layout = 'list';
      grid.dataset.size = roomy ? 'large' : 'compact';
      grid.style.setProperty('--feed-columns', String(columns));
      grid.style.setProperty('--feed-row-height', `${rowHeight}px`);
      grid.style.setProperty('--feed-grid-gap', `${gap}px`);
      grid.style.setProperty('--feed-art-size', `${roomy ? Math.min(112, rowHeight - 86) : Math.min(64, rowHeight - 18)}px`);
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
