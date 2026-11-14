import {afterEach,expect,it} from 'vitest';
import {installPageMagnification,magnifyAt} from './usePageMagnification';
let cleanup:(()=>void)|undefined;
afterEach(()=>{cleanup?.();cleanup=undefined;document.body.innerHTML='';});
function setup(){document.body.innerHTML='<div id="root">Content</div>';cleanup=installPageMagnification();}
function key(value:string){const event=new KeyboardEvent('keydown',{key:value,ctrlKey:true,cancelable:true,bubbles:true});window.dispatchEvent(event);return event;}
it('magnifies around the chosen point and keeps the viewport covered',()=>{
  expect(magnifyAt({scale:1,x:0,y:0},2,{x:300,y:200},1000,800)).toEqual({scale:2,x:-300,y:-200});
  expect(magnifyAt({scale:2,x:-300,y:-200},1,{x:300,y:200},1000,800)).toEqual({scale:1,x:0,y:0});
});
it('captures Ctrl plus without changing document dimensions or media rules',()=>{
  setup();const width=innerWidth;
  expect(key('+').defaultPrevented).toBe(true);
  expect(document.getElementById('root')!.style.transform).toContain('scale(1.1)');
  expect(innerWidth).toBe(width);
  expect(document.documentElement.hasAttribute('data-page-magnified')).toBe(true);
  expect(document.documentElement.style.minWidth).toBe('');
});
it('reduces magnification and restores the original styles on Ctrl zero',()=>{
  setup();key('+');key('+');key('-');
  expect(document.getElementById('root')!.style.transform).toContain('scale(1.1)');
  expect(key('0').defaultPrevented).toBe(true);
  expect(document.getElementById('root')!.style.transform).toBe('');
  expect(document.documentElement.hasAttribute('data-page-magnified')).toBe(false);
  expect(key('0').defaultPrevented).toBe(false);
});
it('does not intercept native pinch wheel events or unrelated shortcuts',()=>{
  setup();key('+');
  const pinch=new WheelEvent('wheel',{ctrlKey:true,deltaY:-100,cancelable:true});window.dispatchEvent(pinch);
  expect(pinch.defaultPrevented).toBe(false);
  expect(key('f').defaultPrevented).toBe(false);
});
it('accepts bounded extension magnification and removes its bridge on cleanup',()=>{
  setup();
  expect(document.documentElement.hasAttribute('data-distilled-magnification-ready')).toBe(true);
  window.dispatchEvent(new CustomEvent('distilled:browser-zoom',{detail:1.75}));
  expect(document.getElementById('root')!.style.transform).toContain('scale(1.75)');
  window.dispatchEvent(new CustomEvent('distilled:browser-zoom',{detail:NaN}));
  expect(document.getElementById('root')!.style.transform).toContain('scale(1.75)');
  window.dispatchEvent(new CustomEvent('distilled:browser-zoom',{detail:100}));
  expect(document.getElementById('root')!.style.transform).toContain('scale(4)');
  cleanup?.();cleanup=undefined;
  expect(document.documentElement.hasAttribute('data-distilled-magnification-ready')).toBe(false);
});
