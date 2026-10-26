import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {UnreadSummary} from './UnreadSummary';
import {summarizeUnread} from './api';
vi.mock('./api',()=>({summarizeUnread:vi.fn()}));
vi.mock('./LanguageControl',()=>({useLanguage:()=>({t:(value:string)=>value})}));
let root:Root,host:HTMLDivElement;
beforeEach(()=>{(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.mocked(summarizeUnread).mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
const render=async(key='one')=>act(async()=>root.render(<UnreadSummary username="owner" slug="news" readIds={[]} contentKey={key}/>));
const click=async(selector:string)=>act(async()=>host.querySelector<HTMLButtonElement>(selector)!.click());
it('only requests on demand and reopens its result without another request',async()=>{
 vi.mocked(summarizeUnread).mockResolvedValue({status:'ready',summary:'The proposal still needs approval.'});await render();expect(summarizeUnread).not.toHaveBeenCalled();await click('.unread-summary-button');expect(host.textContent).toContain('still needs approval');await click('.unread-summary-close');await click('.unread-summary-button');expect(summarizeUnread).toHaveBeenCalledOnce();
});
it('ignores a late result after the unread selection changes',async()=>{
 let resolve!:(value:{status:'ready';summary:string})=>void;vi.mocked(summarizeUnread).mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();await click('.unread-summary-button');await render('two');await act(async()=>resolve({status:'ready',summary:'Stale text'}));expect(host.textContent).not.toContain('Stale text');expect(host.querySelector('.unread-summary-card')).toBeNull();
});
it('shows a useful failure and permits an explicit retry',async()=>{
 vi.mocked(summarizeUnread).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue({status:'empty'});await render();await click('.unread-summary-button');expect(host.querySelector('[role="alert"]')?.textContent).toBe('Unavailable');await click('.unread-summary-button');expect(host.textContent).toContain('No recent unread briefings');expect(summarizeUnread).toHaveBeenCalledTimes(2);
});
