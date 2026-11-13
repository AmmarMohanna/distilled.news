import {useLayoutEffect} from 'react';

type View={scale:number;x:number;y:number};
const levels=[1,1.1,1.25,1.5,1.75,2,2.5,3,4];
export function magnifyAt(view:View,scale:number,anchor:{x:number;y:number},width:number,height:number):View{
  const ratio=scale/view.scale;
  return {scale,x:Math.max(width*(1-scale),Math.min(0,anchor.x-(anchor.x-view.x)*ratio)),
    y:Math.max(height*(1-scale),Math.min(0,anchor.y-(anchor.y-view.y)*ratio))};
}

/** Keyboard magnification changes the visual transform, never viewport dimensions,
 * media rules or the browser's own zoom setting. Native pinch stays native.
 */
export function installPageMagnification(){
  const root=document.getElementById('root');
  if(!root)return ()=>{};
  const html=document.documentElement;
  let view:View={scale:1,x:0,y:0};
  let pointer={x:innerWidth/2,y:innerHeight/2},space=false,suppressClick=false;
  let drag:{id:number;x:number;y:number}|undefined;
  const paint=()=>{
    if(view.scale===1){
      root.style.removeProperty('transform');root.style.removeProperty('transform-origin');
      html.removeAttribute('data-page-magnified');html.removeAttribute('data-magnification-pan');
    }else{
      html.setAttribute('data-page-magnified','');
      root.style.transformOrigin='0 0';
      root.style.transform=`translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    }
    window.dispatchEvent(new Event('page-magnification-change'));
  };
  const pan=(x:number,y:number)=>{
    view={...view,x:Math.max(innerWidth*(1-view.scale),Math.min(0,view.x+x)),
      y:Math.max(innerHeight*(1-view.scale),Math.min(0,view.y+y))};paint();
  };
  const editable=(target:EventTarget|null)=>target instanceof Element&&Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
  const keydown=(event:KeyboardEvent)=>{
    if((event.ctrlKey||event.metaKey)&&!event.altKey){
      const plus=event.key==='+'||event.key==='='||event.code==='NumpadAdd';
      const minus=event.key==='-'||event.code==='NumpadSubtract';
      if(event.key==='0'){
        // At 1x, allow Ctrl+0 to reset any pre-existing browser-native zoom.
        if(view.scale>1){event.preventDefault();view={scale:1,x:0,y:0};paint();}
      }else if(plus||minus){
        event.preventDefault();
        const scale=plus?(levels.find(level=>level>view.scale)??4):([...levels].reverse().find(level=>level<view.scale)??1);
        view=magnifyAt(view,scale,pointer,innerWidth,innerHeight);paint();
      }
    }else if(event.code==='Space'&&view.scale>1&&!editable(event.target)){
      event.preventDefault();space=true;html.setAttribute('data-magnification-pan','');
    }
  };
  const keyup=(event:KeyboardEvent)=>{if(event.code==='Space'){space=false;html.removeAttribute('data-magnification-pan');}};
  const move=(event:PointerEvent)=>{
    pointer={x:event.clientX,y:event.clientY};
    if(drag&&drag.id===event.pointerId){event.preventDefault();if(Math.abs(event.clientX-drag.x)+Math.abs(event.clientY-drag.y)>2)suppressClick=true;pan(event.clientX-drag.x,event.clientY-drag.y);drag={id:event.pointerId,x:event.clientX,y:event.clientY};}
  };
  const down=(event:PointerEvent)=>{
    suppressClick=false;
    if(view.scale>1&&(event.button===1||(space&&event.button===0))&&!editable(event.target)){
      event.preventDefault();drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    }
  };
  const stop=()=>{drag=undefined;space=false;html.removeAttribute('data-magnification-pan');};
  const click=(event:MouseEvent)=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}};
  const wheel=(event:WheelEvent)=>{
    if(view.scale===1||event.ctrlKey||event.metaKey||event.target instanceof Element&&event.target.closest('dialog,[popover]:popover-open'))return;
    const unit=event.deltaMode===1?16:event.deltaMode===2?innerHeight:1;
    const x=-(event.shiftKey?event.deltaY:event.deltaX)*unit,y=event.shiftKey?0:-event.deltaY*unit;
    const before=view;pan(x,y);
    // Once the magnified viewport reaches an edge, allow normal page scrolling.
    if(view.x!==before.x||view.y!==before.y)event.preventDefault();
  };
  const resize=()=>{view=magnifyAt(view,view.scale,pointer,innerWidth,innerHeight);paint();};
  window.addEventListener('keydown',keydown,{capture:true});window.addEventListener('keyup',keyup);
  window.addEventListener('pointermove',move,{capture:true});window.addEventListener('pointerdown',down,{capture:true});
  window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop);
  window.addEventListener('click',click,true);
  window.addEventListener('wheel',wheel,{passive:false});window.addEventListener('resize',resize);
  return ()=>{
    window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup);
    window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerdown',down,true);
    window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop);
    window.removeEventListener('click',click,true);
    window.removeEventListener('wheel',wheel);window.removeEventListener('resize',resize);
    view={scale:1,x:0,y:0};paint();
  };
}
export function usePageMagnification(){useLayoutEffect(installPageMagnification,[]);}
