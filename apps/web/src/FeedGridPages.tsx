import { Children, cloneElement, isValidElement, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from './LanguageControl';

/** Page whole cards using their rendered size, including browser zoom and sidebar changes. */
export function FeedGridPages({ children, className }: { children: ReactNode; className: string }) {
  const cards = Children.toArray(children);
  const grid = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(6);
  const [page, setPage] = useState(0);
  const { t } = useLanguage();
  const pages = Math.max(1, Math.ceil(cards.length / capacity));
  const current = Math.min(page, pages - 1);
  useLayoutEffect(() => {
    const node = grid.current;
    if (!node) return;
    const measure = () => {
      const card = node.querySelector<HTMLElement>('.topic-card:not([hidden])');
      if (!card) return;
      const viewport = node.closest<HTMLElement>('.screen-page-viewport');
      const rect = node.getBoundingClientRect();
      const scale = node.offsetWidth ? rect.width / node.offsetWidth : 1;
      const navigation = document.querySelector('.bottom-navigation')?.getBoundingClientRect();
      const bottom = Math.min(window.innerHeight, viewport?.getBoundingClientRect().bottom ?? window.innerHeight, window.innerWidth < 900 ? navigation?.top ?? window.innerHeight : window.innerHeight);
      const top = rect.top + (viewport?.scrollTop ?? 0) * scale;
      const style = getComputedStyle(node);
      const columns = Math.max(1, style.gridTemplateColumns.split(' ').length);
      const gap = parseFloat(style.rowGap) || 0;
      const height = card.getBoundingClientRect().height / scale;
      const available = (bottom - top) / scale - 76;
      const rows = Math.max(1, Math.floor((available + gap) / (height + gap)));
      setCapacity(Math.max(1, columns * rows));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (node.parentElement) observer.observe(node.parentElement);
    const main = node.closest('main');
    if (main) observer.observe(main);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [cards.length, className]);
  return <div className="feed-grid-pages">
    <div className={className} ref={grid}>{cards.map((card, index) => {
      const hidden = index < current * capacity || index >= (current + 1) * capacity;
      return isValidElement<{ style?: CSSProperties; hidden?: boolean; children?: ReactNode }>(card)
        ? cloneElement(card, { hidden, style: hidden ? { display: 'none' } : undefined }, hidden ? null : card.props.children) : card;
    })}</div>
    {pages > 1 && <nav className="feed-grid-pagination" aria-label={t('Feed pages')}>
      <button type="button" aria-label={t('Previous page')} disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={18}/></button>
      <span aria-live="polite">{current + 1} / {pages}</span>
      <button type="button" aria-label={t('Next page')} disabled={current === pages - 1} onClick={() => setPage(current + 1)}><ChevronRight size={18}/></button>
    </nav>}
  </div>;
}
