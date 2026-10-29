import { useLayoutEffect, useRef, type ReactNode } from 'react';

export function fitFeedRowHeight(space: number, gap: number, natural: number, preferred: number) {
  const minimum = Math.max(104, Math.ceil(natural));
  const maximum = Math.max(144, minimum);
  let chosen = Math.max(minimum, Math.min(maximum, preferred));
  let distance = Infinity;
  for (let rows = 1; rows <= Math.ceil(Math.max(0, space) / (minimum + gap)) + 1; rows++) {
    const height = Math.floor((space - (rows - 1) * gap) / rows);
    if (height < minimum || height > maximum) continue;
    if (Math.abs(height - preferred) < distance) {
      chosen = height;
      distance = Math.abs(height - preferred);
    }
  }
  return chosen;
}

export function feedGridLayout(count: number, width: number, available: number, desktop: boolean) {
  const gap = desktop ? 16 : 10;
  // Home and Explore share width-based sizing. Collection length and the
  // grid's vertical position must not resize the same widget between routes.
  const space = Math.max(0, available);
  const columns = count ? Math.max(1, Math.min(3, Math.floor((width + gap) / (320 + gap)))) : 1;
  const cardWidth = (width - (columns - 1) * gap) / columns;
  const roomy = cardWidth >= 420;
  const compact = cardWidth < 360;
  const rowHeight = compact ? 120 : roomy ? 144 : 132;
  const rows = Math.max(1, Math.min(Math.ceil(count / columns), Math.floor((space + gap) / (rowHeight + gap))));
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
      if (!rect.width) return;
      const scale = grid.offsetWidth ? rect.width / grid.offsetWidth : 1;
      const viewport = grid.closest<HTMLElement>('.screen-page-viewport');
      const navigation = document.querySelector('.bottom-navigation')?.getBoundingClientRect();
      const viewportBottom = viewport?.getBoundingClientRect().bottom ?? window.innerHeight;
      const visualBottom = window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight;
      const navigationTop = window.innerWidth < 900 && navigation && navigation.height > 0 ? navigation.top : window.innerHeight;
      const bottom = Math.min(window.innerHeight, viewportBottom, visualBottom, navigationTop);
      const top = rect.top + (viewport?.scrollTop ?? window.scrollY) * scale;
      const layout = feedGridLayout(count, grid.clientWidth, Math.max(0, (bottom - top) / scale), window.innerWidth >= 900);
      grid.dataset.layout = 'list';
      grid.dataset.size = layout.roomy ? 'large' : 'compact';
      grid.dataset.density = layout.compact ? 'tight' : 'regular';
      grid.style.setProperty('--feed-columns', String(layout.columns));
      grid.style.setProperty('--feed-grid-gap', layout.gap + 'px');
      grid.style.setProperty('--feed-art-size', (layout.compact ? 44 : layout.roomy ? 72 : 56) + 'px');
      const cards = Array.from(grid.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
      for (const card of cards) card.style.removeProperty('margin-block-start');
      grid.style.setProperty('--feed-row-height', '0px');
      const natural = Math.max(0, ...cards.map(card => card.getBoundingClientRect().height / scale));
      const fold = Math.max(0, (bottom - top) / scale);
      const height = fitFeedRowHeight(Math.max(0, fold - 8), layout.gap, natural, layout.rowHeight);
      grid.style.setProperty('--feed-row-height', height + 'px');
      // Keep page scrolling. If a row cannot fit without shrinking its content,
      // begin that whole row below the fold instead of showing half of it.
      const bounds = cards.map(card => ({ card, top: (card.getBoundingClientRect().top - rect.top) / scale, bottom: (card.getBoundingClientRect().bottom - rect.top) / scale }));
      const partial = bounds.find(row => row.top > 1 && row.top < fold - 1 && row.bottom > fold + 1);
      if (partial) for (const row of bounds) {
        if (Math.abs(row.top - partial.top) < 2) row.card.style.marginBlockStart = Math.ceil(fold - partial.top + layout.gap) + 'px';
      }
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
