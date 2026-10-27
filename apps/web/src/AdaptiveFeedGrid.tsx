import { useLayoutEffect, useRef, type ReactNode } from 'react';

export function feedGridLayout(count: number, width: number, available: number, desktop: boolean) {
  const gap = desktop ? 16 : 10;
  // Prefer comfortable cards; add density only when the collection needs scrolling.
  const space = Math.max(0, available);
  const capacity = (cardWidth: number) => Math.max(1, Math.min(count || 1, 3, Math.floor((width + gap) / (cardWidth + gap))));
  const comfortableColumns = capacity(440);
  const comfortableRows = Math.ceil(count / comfortableColumns);
  const columns = comfortableRows * 144 + Math.max(0, comfortableRows - 1) * gap <= space
    ? comfortableColumns : capacity(320);
  const roomy = width / columns >= 400 && available >= 380;
  const compact = available < 190;
  const minimum = 112;
  const rows = Math.max(1, Math.min(Math.ceil(count / columns), Math.floor((space + gap) / (144 + gap))));
  const fittedHeight = Math.floor((space - (rows - 1) * gap) / rows);
  // Use some of the available space without stretching a small collection to fill it.
  const preferredHeight = Math.max(120, Math.min(176, Math.floor(space * 0.72 / rows)));
  const overflowing = Math.ceil(count / columns) > rows;
  const rowHeight = Math.max(minimum, Math.min(overflowing ? 192 : preferredHeight, fittedHeight));
  return { columns, gap, roomy, compact, rows, rowHeight };
}

/** Keep every feed in one adaptive list without pagination. */
export function AdaptiveFeedGrid({ children, className, count }: { children: ReactNode; className: string; count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid || !count) return;
    const measure = () => {
      if (!grid.clientWidth) return;
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
      grid.style.setProperty('--feed-art-size', (layout.compact ? 44 : layout.roomy ? Math.min(128, layout.rowHeight - 16) : grid.clientWidth < 300 ? 48 : 56) + 'px');
      const available = Math.max(0, (bottom - top) / scale);
      const cards = [...grid.children].filter(node => node.classList.contains('topic-card')) as HTMLElement[];
      const cardHeight = Math.max(layout.rowHeight, ...cards.map(card => card.getBoundingClientRect().height / scale));
      grid.style.setProperty('--feed-row-height', cardHeight + 'px');
      const visibleRows = Math.min(Math.ceil(count / layout.columns), Math.floor((available + layout.gap) / (cardHeight + layout.gap)));
      grid.dataset.completeRows = visibleRows > 0 ? 'true' : 'false';
      grid.style.maxHeight = visibleRows > 0 ? (visibleRows * cardHeight + (visibleRows - 1) * layout.gap) + 'px' : '';

    };
    measure();
    let active = true;
    const frame = requestAnimationFrame(measure);
    void document.fonts?.ready.then(() => { if (active) measure(); });
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    for (const card of grid.children) observer.observe(card);
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
