import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {BriefingText} from './BriefingText';

async function render(summary:string,sections:Array<{title:string;summary:string}>,direction:'ltr'|'rtl',check:(host:HTMLDivElement)=>void){
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('div'),root=createRoot(host);
  try{await act(async()=>root.render(<BriefingText summary={summary} sections={sections} direction={direction}
    renderBody={text=><p className="news-summary">{text}</p>}/>));check(host)}
  finally{await act(async()=>root.unmount());vi.unstubAllGlobals()}
}

it('renders the explicit headline above the body rather than flattening them together',async()=>{
  const section={title:'',summary:'Brent crude rises to $116 per barrel\nThe source reports Brent at $116.'};
  await render(`${section.summary} [1]`,[section],'ltr',host=>{
    expect(host.querySelector('h3')?.textContent).toBe('Brent crude rises to $116 per barrel');
    expect(host.querySelector('p')?.textContent).toBe('The source reports Brent at $116. [1]');
    expect(host.querySelector('h3')?.nextElementSibling?.tagName).toBe('P');
  });
});

it('keeps multiple story bodies and section-reference numbers together',async()=>{
  const sections=[{title:'',summary:'First development\nFirst source-grounded body.'},{title:'',summary:'Second development\nSecond source-grounded body.'}];
  await render(sections.map((s,i)=>`${s.summary} [${i+1}]`).join('\n\n'),sections,'ltr',host=>{
    expect([...host.querySelectorAll('h3')].map(h=>h.textContent)).toEqual(['First development','Second development']);
    expect([...host.querySelectorAll('p')].map(p=>p.textContent)).toEqual(['First source-grounded body. [1]','Second source-grounded body. [2]']);
  });
});

it('separates Arabic headline and body with right-to-left isolation',async()=>{
  const section={title:'',summary:'ارتفاع سعر خام برنت\r\nذكر المصدر أن السعر بلغ 116 دولارًا.'};
  await render(`${section.summary} [1]`,[section],'rtl',host=>{
    expect(host.querySelector('.news-stories')?.getAttribute('dir')).toBe('rtl');
    expect(host.querySelector('h3 bdi')?.getAttribute('dir')).toBe('rtl');
    expect(host.querySelector('h3')?.textContent).toBe('ارتفاع سعر خام برنت');
    expect(host.querySelector('p')?.textContent).toBe('ذكر المصدر أن السعر بلغ 116 دولارًا. [1]');
  });
});

it('preserves legacy or partial summaries without guessing a headline or losing citations',async()=>{
  await render('Existing summary [1].\n  More detail.',[{title:'World',summary:'Different section detail'}],'ltr',host=>{
    expect(host.querySelector('h3')).toBeNull();
    expect(host.querySelector('p')?.textContent).toBe('Existing summary [1]. More detail.');
  });
  await render('Complete summary [2]',[],'ltr',host=>expect(host.querySelector('p')?.textContent).toBe('Complete summary [2]'));
});
