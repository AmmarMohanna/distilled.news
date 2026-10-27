import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {FeedListState} from './FeedListState';
vi.mock('./LanguageControl',()=>({useLanguage:()=>({t:(text:string)=>text})}));
it('shows a loading illustration without a retry action',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div'),root=createRoot(host);
 try{await act(async()=>root.render(<FeedListState/>));expect(host.querySelector('[role="status"]')?.textContent).toContain('Loading feeds');expect(host.querySelector('.feed-state-art')?.getAttribute('aria-hidden')).toBe('true');expect(host.querySelector('.feed-state-logo.is-loading')).not.toBeNull();expect(host.querySelector('.feed-state-ring')).not.toBeNull();expect(host.querySelector('.feed-state-cloud')).toBeNull();expect(host.querySelector('button')).toBeNull();}finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
it('offers an explicit retry on failure and catches its rejection',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div'),root=createRoot(host),retry=vi.fn(async()=>{throw Error('still unavailable');});
 try{await act(async()=>root.render(<FeedListState failed onRetry={retry}/>));expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load your feeds");expect(host.querySelector('.feed-state-logo')).not.toBeNull();expect(host.querySelector('.feed-state-logo.is-loading')).toBeNull();expect(host.querySelector('.feed-state-ring')).toBeNull();await act(async()=>host.querySelector('button')!.click());expect(retry).toHaveBeenCalledOnce();}finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
