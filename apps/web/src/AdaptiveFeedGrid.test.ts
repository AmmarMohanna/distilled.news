import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {AdaptiveFeedGrid} from './AdaptiveFeedGrid';

it('renders every widget without pagination or slicing', () => {
  const children = Array.from({length: 23}, (_, i) => createElement('article', {key: i}, 'feed-' + i));
  const html = renderToStaticMarkup(createElement(AdaptiveFeedGrid, {view: 'home', children}));
  expect(html.match(/<article>/g)).toHaveLength(23);
  expect(html).not.toContain('<nav');
  expect(html).not.toContain('pagination');
});
