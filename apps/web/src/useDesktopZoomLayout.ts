import {useLayoutEffect} from 'react';

type View = {width:number;height:number;ratio:number;outerWidth:number;screen:string};
const key='dn_desktop_zoom_baseline_v1';

export function isDesktopZoom(baseline:View,current:View){
  return baseline.width>=900 && baseline.screen===current.screen &&
    current.ratio>baseline.ratio*1.04 &&
    Math.abs(current.outerWidth-baseline.outerWidth)<32 &&
    Math.abs(current.width*current.ratio/baseline.ratio-baseline.width)<40;
}

/** Keep dimensional breakpoints at the last unzoomed desktop viewport.
 * Color, motion, pointer and print media conditions remain live.
 */
export function preserveMediaDimensions(query:string,width:number,height:number,fontSize:number){
  return query.replace(/\(\s*(min|max)-(width|height)\s*:\s*([\d.]+)(px|em|rem)\s*\)/gi,
    (_match,bound:string,axis:string,value:string,unit:string)=>{
      const limit=Number(value)*(unit.toLowerCase()==='px'?1:fontSize);
      const size=axis.toLowerCase()==='width'?width:height;
      const matches=bound.toLowerCase()==='min'?size>=limit:size<=limit;
      return matches?'(min-width: 0px)':'(min-width: 100000000px)';
    });
}

export function useDesktopZoomLayout(){
  useLayoutEffect(()=>{
    if(!matchMedia('(hover: hover) and (pointer: fine)').matches)return;
    const root=document.documentElement;
    const view=():View=>({width:innerWidth,height:innerHeight,ratio:devicePixelRatio,
      outerWidth:window.outerWidth,screen:`${screen.width}x${screen.height}`});
    let baseline=view(),active=false;
    try{
      const saved=JSON.parse(sessionStorage.getItem(key)??'null') as View|null;
      if(saved&&Object.values(saved).every(value=>typeof value==='string'||Number.isFinite(value))&&isDesktopZoom(saved,baseline))baseline=saved;
    }catch{/* Storage is optional; zoom changes still work within this visit. */}
    const originals=new Map<CSSMediaRule,string>();
    const restore=()=>{
      for(const [rule,query] of originals)rule.media.mediaText=query;
      originals.clear();root.removeAttribute('data-desktop-zoom');
      root.style.removeProperty('--desktop-zoom-width');active=false;
    };
    const measure=()=>{
      const current=view();
      if(isDesktopZoom(baseline,current)){
        if(active)return;
        const fontSize=parseFloat(getComputedStyle(root).fontSize)||16;
        const visit=(rules:CSSRuleList)=>{
          for(const rule of Array.from(rules)){
            if(rule instanceof CSSMediaRule){
              const query=rule.media.mediaText;
              const fixed=preserveMediaDimensions(query,baseline.width,baseline.height,fontSize);
              if(fixed!==query){originals.set(rule,query);rule.media.mediaText=fixed;}
            }
            if('cssRules' in rule)visit((rule as CSSGroupingRule).cssRules);
          }
        };
        for(const sheet of Array.from(document.styleSheets)){
          // Never modify third-party styles or attempt to read cross-origin CSS.
          if(sheet.href&&new URL(sheet.href).origin!==location.origin)continue;
          try{visit(sheet.cssRules);}catch{/* Inaccessible styles retain their native behavior. */}
        }
        root.style.setProperty('--desktop-zoom-width',`${baseline.width}px`);
        root.setAttribute('data-desktop-zoom','');active=true;
      }else{
        if(active)restore();
        baseline=current;
        try{sessionStorage.setItem(key,JSON.stringify(baseline));}catch{}
      }
    };
    // Freeze breakpoints before grids handle the same resize notification.
    measure();window.addEventListener('resize',measure,true);
    return ()=>{window.removeEventListener('resize',measure,true);restore();};
  },[]);
}
