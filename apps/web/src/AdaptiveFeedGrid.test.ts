import {expect, it} from 'vitest';
import {feedPageLayout} from './AdaptiveFeedGrid';
it('fits complete rows and the pager within desktop and mobile viewports', () => {
  for (const [width, available, desktop] of [[1100, 336, true], [1100, 580, true], [390, 500, false], [680, 430, false]] as const) {
    const layout = feedPageLayout(23, width, available, desktop);
    expect(layout.rows * layout.rowHeight + (layout.rows - 1) * layout.gap + 64).toBeLessThanOrEqual(available);
    expect(layout.pageSize % layout.columns).toBe(0);
    expect(layout.rowHeight).toBeGreaterThanOrEqual(84);
    const pages = Math.ceil(23 / layout.pageSize);
    expect(pages * layout.pageSize).toBeGreaterThanOrEqual(23);
  }
});
it('keeps a short feed list on one page', () => {
  const layout = feedPageLayout(2, 1100, 580, true);
  expect(layout.pageSize).toBeGreaterThanOrEqual(2);
});
