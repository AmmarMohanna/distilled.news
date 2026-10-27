import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {AdaptiveFeedGrid, feedGridLayout} from './AdaptiveFeedGrid';
it('fits complete visible rows in desktop and mobile viewports', () => {
  for (const [width, available, desktop] of [[1100, 336, true], [1100, 580, true], [390, 500, false], [680, 430, false]] as const) {
    const layout = feedGridLayout(23, width, available, desktop);
    expect(layout.rows * layout.rowHeight + (layout.rows - 1) * layout.gap).toBeLessThanOrEqual(available);
    expect(layout.rowHeight).toBeGreaterThanOrEqual(84);
    expect(width / layout.columns).toBeGreaterThanOrEqual(Math.min(width, 320));
  }
});
it('renders every widget without pagination or slicing', () => {
  const children = Array.from({length: 23}, (_, i) => createElement('article', {key: i}, 'feed-' + i));
  const html = renderToStaticMarkup(createElement(AdaptiveFeedGrid, {count: 23, className: 'personal-feed-grid', children}));
  expect(html.match(/<article>/g)).toHaveLength(23);
  expect(html).not.toContain('<nav');
  expect(html).not.toContain('pagination');
});

it('uses compact rows only when the visible vertical space is tight',()=>{
  const short=feedGridLayout(1,620,140,false);expect(short.compact).toBe(true);expect(short.rowHeight).toBeLessThanOrEqual(140);
  const normal=feedGridLayout(5,620,430,false);expect(normal.compact).toBe(false);expect(normal.rowHeight).toBeGreaterThanOrEqual(112);expect(normal.rowHeight).toBeLessThanOrEqual(136);
});
