import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {AdaptiveFeedGrid, feedGridLayout, fitFeedRowHeight} from './AdaptiveFeedGrid';
it('fits available space without shrinking long content or enlarging short cards excessively', () => {
  expect(fitFeedRowHeight(280,16,110,132)).toBe(132);
  expect(fitFeedRowHeight(268,16,110,132)).toBe(126);
  expect(fitFeedRowHeight(140,10,217,120)).toBe(217);
  expect(fitFeedRowHeight(2000,16,110,132)).toBeLessThanOrEqual(144);
});
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

it('keeps identical widget dimensions despite route position and collection length',()=>{
  const dimensions=(count:number,available:number)=>{
    const {rows,...layout}=feedGridLayout(count,1116,available,true);return layout;
  };
  expect(dimensions(1,140)).toEqual(dimensions(30,650));
  expect(dimensions(5,430)).toEqual(dimensions(30,140));
});

it('adapts columns to width while keeping sparse and busy collections consistent', () => {
  const sparse = feedGridLayout(5, 1116, 650, true);
  const busy = feedGridLayout(30, 1116, 650, true);
  expect(sparse.columns).toBe(3);
  expect(busy.columns).toBe(3);
  expect(sparse.rowHeight).toBe(busy.rowHeight);
  expect(feedGridLayout(5, 320, 650, false).columns).toBe(1);
  expect(feedGridLayout(0, 1116, 650, true).columns).toBe(1);
});
