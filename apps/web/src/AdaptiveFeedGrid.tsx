import { useLayoutEffect, useRef, type ReactNode } from 'react';

export function feedGridLayout(count: number, width: number, available: number, desktop: boolean) {
  const gap = desktop ? 16 : 10;
  // Add columns only when each card has enough room for readable identity text.
  const columns = Math.max(1, Math.min(count, 3, Math.floor((width + gap) / (320 + gap))));
  const roomy = width / columns >= 400 && available >= 380;
  const compact = available < 190;
  const minimum = compact ? 120 : 176;
  const space = Math.max(0, available);
  const rows = Math.max(1, Math.min(Math.ceil(count / columns), Math.floor((space + gap) / (minimum + gap))));
  const fittedHeight = Math.floor((space - (rows - 1) * gap) / rows);
  const rowHeight = Math.max(minimum, Math.min(compact ? 136 : roomy ? 208 : 176, fittedHeight));
  return { columns, gap, roomy, compact, rows, rowHeight };
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
      const viewportBottom = viewport?.getBoundingClientRect().bottom ?? window.innerHeight;
      const visualBottom = window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight;
      const navigationTop = window.innerWidth < 900 && navigation && navigation.height > 0 ? navigation.top : window.innerHeight;
      const bottom = Math.min(window.innerHeight, viewportBottom, visualBottom, navigationTop);
      const top = rect.top + (viewport?.scrollTop ?? 0) * scale;
      const layout = feedGridLayout(count, grid.clientWidth, Math.max(0, (bottom - top) / scale), window.innerWidth >= 900);
      grid.dataset.layout = 'list';
      grid.dataset.size = layout.roomy ? 'large' : 'compact';
      grid.dataset.density = layout.compact ? 'tight' : 'regular';
      grid.style.setProperty('--feed-columns', String(layout.columns));
      grid.style.setProperty('--feed-row-height', layout.rowHeight + 'px');
      grid.style.setProperty('--feed-grid-gap', layout.gap + 'px');
      grid.style.setProperty('--feed-art-size', (layout.compact ? 44 : layout.roomy ? 80 : 56) + 'px');
    };
    measure();
    let active = true;
    const frame = requestAnimationFrame(measure);
    void document.fonts?.ready.then(() => { if (active) measure(); });
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    const main = grid.closest('main');
    if (main) observer.observe(main);
    const navigation = document.querySelector('.bottom-navigation');
    if (navigation) observer.observe(navigation);
    const viewport = grid.closest('.screen-page-viewport');
    if (viewport) observer.observe(viewport);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => { active = false; cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, [count]);
  return <div className={'adaptive-feed-grid ' + className} ref={ref}>{children}</div>;
}
