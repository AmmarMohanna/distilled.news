import {expect,it} from 'vitest';
import {isDesktopZoom,preserveMediaDimensions} from './useDesktopZoomLayout';
const baseline={width:1440,height:900,ratio:1.25,outerWidth:1456,screen:'1536x960'};
it('recognizes page zoom on a scaled desktop without confusing resize or monitor changes',()=>{
  expect(isDesktopZoom(baseline,{...baseline,width:823,height:514,ratio:2.1875})).toBe(true);
  expect(isDesktopZoom(baseline,{...baseline,width:820,outerWidth:836})).toBe(false);
  expect(isDesktopZoom(baseline,{...baseline,width:823,ratio:2.1875,screen:'1920x1080'})).toBe(false);
  expect(isDesktopZoom({...baseline,width:390},{...baseline,width:223,ratio:2.1875})).toBe(false);
});
it('preserves only dimensional conditions and keeps other media preferences live',()=>{
  expect(preserveMediaDimensions('(min-width: 900px) and (prefers-reduced-motion: reduce)',1440,900,16)).toBe('(min-width: 0px) and (prefers-reduced-motion: reduce)');
  expect(preserveMediaDimensions('(max-width: 899px), print',1440,900,16)).toBe('(min-width: 100000000px), print');
  expect(preserveMediaDimensions('(max-height: 40rem)',1440,900,16)).toBe('(min-width: 100000000px)');
});
