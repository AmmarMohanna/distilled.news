import {it,expect} from 'vitest';import {feedExistedInWindow} from './connector-publication-window';
it('skips pre-creation closed windows and admits the first partial window',()=>{
 expect(feedExistedInWindow('2026-10-15T20:11:32Z','2026-10-15T20:00:00Z')).toBe(false);
 expect(feedExistedInWindow('2026-10-15T20:30:00Z','2026-10-15T20:30:00Z')).toBe(false);
 expect(feedExistedInWindow('2026-10-15T20:11:32Z','2026-10-15T20:30:00Z')).toBe(true);
 expect(feedExistedInWindow('bad','2026-10-15T20:30:00Z')).toBe(false);
});
