import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {parseReadProgress,readProgressKey,useReadProgress} from './useReadProgress';
afterEach(()=>{localStorage.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each(['{broken','null','{}','"wrong"','[1]','["one",null]'])('rejects invalid saved history %s',raw=>{expect([...parseReadProgress(raw)]).toEqual([]);});
it('validates string IDs and deduplicates without losing legitimate values',()=>{expect([...parseReadProgress('["one","two","one"]')]).toEqual(['one','two']);});
it('isolates accounts, anonymous history and feed paths without overwriting history on a switch',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 localStorage.setItem('ln_read:publisher:news','["ambiguous-legacy"]');
 localStorage.setItem(readProgressKey('publisher','news','b'),'["b-old"]');
 const host=document.createElement('div'),root=createRoot(host);
 function Reader({id,slug='news'}:{id:string|null|undefined;slug?:string}){const [ids,set]=useReadProgress('publisher',slug,id);return <button onClick={()=>set(current=>new Set([...current,'marked']))}>{[...ids].join(',')}</button>;}
 const render=async(id:string|null|undefined,slug='news')=>{await act(async()=>root.render(<Reader id={id} slug={slug}/>));return host.textContent;};
 try {
  expect(await render(undefined)).toBe('');expect(await render('a')).toBe('');
  await act(async()=>host.querySelector('button')!.click());expect(host.textContent).toBe('marked');
  expect(await render('b')).toBe('b-old');expect(await render(null)).toBe('');
  expect(await render('a','other')).toBe('');expect(await render('a')).toBe('marked');
  expect(JSON.parse(localStorage.getItem(readProgressKey('publisher','news','b'))!)).toEqual(['b-old']);
  expect(localStorage.getItem('ln_read:publisher:news')).toBe('["ambiguous-legacy"]');
 }finally{await act(async()=>root.unmount());}
});
it('recovers from corrupt data and blocked storage without crashing the reader',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const key=readProgressKey('publisher','news','a');localStorage.setItem(key,'{bad');
 const host=document.createElement('div'),root=createRoot(host);
 function Reader(){const [ids]=useReadProgress('publisher','news','a');return <p>{ids.size}</p>;}
 try {await act(async()=>root.render(<Reader/>));expect(host.textContent).toBe('0');expect(localStorage.getItem(key)).toBe('[]');}
 finally {await act(async()=>root.unmount());}
 const blocked=createRoot(host);vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked')});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked')});
 try{await act(async()=>blocked.render(<Reader/>));expect(host.textContent).toBe('0');}finally{await act(async()=>blocked.unmount());}
});
