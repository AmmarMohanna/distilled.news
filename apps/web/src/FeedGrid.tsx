import { Children, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from './LanguageControl';

/** Page through complete cards instead of hiding feeds below the viewport. */
export function FeedGrid({ children, className }: { children: ReactNode; className: string }) {
  const items = Children.toArray(children);
  const identity = items.map(item => typeof item === 'object' && item && 'key' in item ? item.key : '').join(',');
  const grid = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(1);
  const [page, setPage] = useState(0);
  const { t } = useLanguage();
  useLayoutEffect(() => { setPage(0); }, [identity]);
  useLayoutEffect(() => {
    const measure = () => {
      const node = grid.current, card = node?.firstElementChild;
      if (!node || !card) return;
      const style = getComputedStyle(node);
      const columns = style.gridTemplateColumns.split(/\s+/).length;
      const gap = parseFloat(style.rowGap) || 0;
      const bottom = document.querySelector('.bottom-navigation')?.getBoundingClientRect();
      const limit = bottom && bottom.width > innerWidth / 2 ? bottom.top : innerHeight;
      const available = limit - node.getBoundingClientRect().top - 80;
      const rows = Math.max(1, Math.floor((available + gap) / (card.getBoundingClientRect().height + gap)));
      setCapacity(Math.max(1, columns * rows));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (grid.current) observer.observe(grid.current);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [identity]);
  const pages = Math.max(1, Math.ceil(items.length / capacity));
  const current = Math.min(page, pages - 1);
  return <div className="feed-grid-pages"><div ref={grid} className={className}>{items.slice(current * capacity, (current + 1) * capacity)}</div>{pages > 1 && <nav className="feed-grid-pagination" aria-label={t('Feeds')}><button type="button" aria-label={t('Previous page')} disabled={!current} onClick={() => setPage(current - 1)}><ChevronLeft size={18}/></button><span aria-live="polite">{current + 1} / {pages}</span><button type="button" aria-label={t('Next page')} disabled={current === pages - 1} onClick={() => setPage(current + 1)}><ChevronRight size={18}/></button></nav>}</div>;
}
