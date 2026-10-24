import { Children, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from './LanguageControl';

export function feedPageLayout(count: number, width: number, available: number, desktop: boolean) {
  const roomy = desktop && width >= 640 && available >= 380;
  const columns = Math.max(1, Math.min(count, roomy ? 2 : desktop ? Math.max(1, Math.floor((width + 16) / 296)) : width >= 600 ? 2 : 1));
  const gap = desktop ? 16 : 10;
  const minimum = roomy ? 160 : 84;
  // Reserve the pager and bottom breathing room before sizing whole rows.
  const space = Math.max(0, available - 64);
  const rows = Math.max(1, Math.min(Math.ceil(count / columns), Math.floor((space + gap) / (minimum + gap))));
  const rowHeight = Math.max(minimum, Math.min(roomy ? 208 : 120, Math.floor((space - (rows - 1) * gap) / rows)));
  return { columns, gap, roomy, rows, rowHeight, pageSize: rows * columns };
}

/** Show complete feed cards; the next page contains the remaining rows. */
export function AdaptiveFeedGrid({ children, className, count }: { children: ReactNode; className: string; count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(1);
  const [page, setPage] = useState(0);
  const { t } = useLanguage();
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
      const layout = feedPageLayout(count, grid.clientWidth, Math.max(0, (bottom - top) / scale), window.innerWidth >= 900);
      grid.dataset.layout = 'list';
      grid.dataset.size = layout.roomy ? 'large' : 'compact';
      grid.style.setProperty('--feed-columns', String(layout.columns));
      grid.style.setProperty('--feed-row-height', layout.rowHeight + 'px');
      grid.style.setProperty('--feed-grid-gap', layout.gap + 'px');
      grid.style.setProperty('--feed-art-size', (layout.roomy ? Math.min(112, layout.rowHeight - 86) : Math.min(64, layout.rowHeight - 18)) + 'px');
      setPageSize(layout.pageSize);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    const main = grid.closest('main');
    if (main) observer.observe(main);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [count]);
  const cards = Children.toArray(children);
  const pages = Math.max(1, Math.ceil(cards.length / pageSize));
  const current = Math.min(page, pages - 1);
  return <><div className={'adaptive-feed-grid ' + className} ref={ref}>{cards.slice(current * pageSize, (current + 1) * pageSize)}</div>
    {pages > 1 && <nav className="feed-grid-pagination" aria-label={t('Feed pages')}><button type="button" aria-label={t('Previous page')} disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={18}/></button><span>{current + 1} / {pages}</span><button type="button" aria-label={t('Next page')} disabled={current === pages - 1} onClick={() => setPage(current + 1)}><ChevronRight size={18}/></button></nav>}</>;
}
