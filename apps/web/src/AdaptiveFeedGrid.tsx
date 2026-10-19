import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from './LanguageControl';

/** Keep card interiors consistent while the full feed list flows with the page. */
export function AdaptiveFeedGrid({ children, className, count }: { children: ReactNode; className: string; count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(count || 1);
  const [page, setPage] = useState(0);
  const { language } = useLanguage();
  const labels = language === 'fr' ? { previous: 'Précédent', next: 'Suivant', pages: 'Pages de fils' } : language === 'ar' ? { previous: 'السابق', next: 'التالي', pages: 'صفحات الخلاصات' } : { previous: 'Previous', next: 'Next', pages: 'Feed pages' };
  useEffect(() => setPage(0), [children]);
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
      const roomy = window.innerWidth >= 900 && width >= 640 && available >= 380;
      const columns = Math.min(count, roomy ? 2 : window.innerWidth >= 900 ? Math.max(1, Math.floor((width + 16) / 296)) : width >= 600 ? 2 : 1);
      const gap = window.innerWidth >= 900 ? 16 : 10;
      // Content-sized cards and a uniform gap; overflow stays on the full page.
      const rowHeight = roomy ? 208 : 84;
      const allRows = Math.ceil(count / columns);
      const needsPaging = allRows * rowHeight + (allRows - 1) * gap > available;
      const rows = Math.max(1, Math.floor((available - (needsPaging ? 60 : 0) + gap) / (rowHeight + gap)));
      setCapacity(Math.max(columns, Math.min(count, rows * columns)));
      grid.dataset.layout = roomy ? 'large' : 'compact';
      grid.style.setProperty('--feed-columns', String(columns));
      grid.style.setProperty('--feed-row-height', `${rowHeight}px`);
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
  const pages = Math.max(1, Math.ceil(count / capacity));
  const current = Math.min(page, pages - 1);
  return <><div className={`adaptive-feed-grid ${className}`} ref={ref}>{Children.toArray(children).slice(current * capacity, (current + 1) * capacity)}</div>
    {pages > 1 && <nav className="feed-pagination" aria-label={labels.pages}>
      <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={18}/>{labels.previous}</button>
      <span aria-live="polite">{current * capacity + 1}–{Math.min(count, (current + 1) * capacity)} / {count}</span>
      <button type="button" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>{labels.next}<ChevronRight size={18}/></button>
    </nav>}
  </>;
}
