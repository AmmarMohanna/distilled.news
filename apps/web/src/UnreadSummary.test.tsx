import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {UnreadSummary} from './UnreadSummary';
import {summarizeUnread} from './api';
vi.mock('./api',()=>({summarizeUnread:vi.fn()}));
vi.mock('./LanguageControl',()=>({useLanguage:()=>({t:(value:string)=>value})}));
let root:Root,host:HTMLDivElement;
beforeEach(()=>{(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.mocked(summarizeUnread).mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
const render=async(key='one')=>act(async()=>root.render(<UnreadSummary readerId="reader" username="owner" slug="news" readIds={[]} contentKey={key}/>));
const click=async(selector:string)=>act(async()=>host.querySelector<HTMLButtonElement>(selector)!.click());
it('only requests on demand and refreshes when explicitly pressed again',async()=>{
 vi.mocked(summarizeUnread).mockResolvedValue({status:'ready',summary:'The proposal still needs approval.'});await render();expect(summarizeUnread).not.toHaveBeenCalled();await click('.unread-summary-button');expect(host.textContent).toContain('still needs approval');await click('.unread-summary-close');await click('.unread-summary-button');expect(summarizeUnread).toHaveBeenCalledTimes(2);
});
it('ignores a late result after the unread selection changes',async()=>{
 let resolve!:(value:{status:'ready';summary:string})=>void;vi.mocked(summarizeUnread).mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();await click('.unread-summary-button');await render('two');await act(async()=>resolve({status:'ready',summary:'Stale text'}));expect(host.textContent).not.toContain('Stale text');expect(host.querySelector('.unread-summary-card')).toBeNull();
});
it('shows a useful failure and permits an explicit retry',async()=>{
 vi.mocked(summarizeUnread).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue({status:'empty'});await render();await click('.unread-summary-button');expect(host.querySelector('[role="alert"]')?.textContent).toBe('Unavailable');await click('.unread-summary-button');expect(host.textContent).toContain('No recent unread briefings');expect(summarizeUnread).toHaveBeenCalledTimes(2);
});

it('restores a saved result after leaving and returning without a request',async()=>{
 vi.mocked(summarizeUnread).mockResolvedValue({status:'ready',summary:'The proposal still needs approval.'});await render();await click('.unread-summary-button');await act(async()=>root.render(null));await render();expect(host.textContent).toContain('still needs approval');expect(summarizeUnread).toHaveBeenCalledOnce();expect(host.querySelector('h2')?.textContent).toBe('Summary');
});
it('invalidates saved text when new briefing evidence arrives',async()=>{
 vi.mocked(summarizeUnread).mockResolvedValue({status:'ready',summary:'Old summary'});await render();await click('.unread-summary-button');await render('new-edition');expect(host.textContent).not.toContain('Old summary');expect(host.querySelector('.unread-summary-card')).toBeNull();
});
it('does not expose a different reader’s saved summary',async()=>{
 vi.mocked(summarizeUnread).mockResolvedValue({status:'ready',summary:'Private catch-up'});await render();await click('.unread-summary-button');await act(async()=>root.render(<UnreadSummary readerId="other-reader" username="owner" slug="news" readIds={[]} contentKey="one"/>));expect(host.textContent).not.toContain('Private catch-up');
});

it('keeps the visible summary when covered briefings are marked read',async()=>{
 vi.mocked(summarizeUnread).mockResolvedValue({status:'ready',summary:'Saved catch-up'});await render();await click('.unread-summary-button');await act(async()=>root.render(<UnreadSummary readerId="reader" username="owner" slug="news" readIds={['edition']} contentKey="one" hasUnread={false}/>));expect(host.textContent).toContain('Saved catch-up');expect(host.querySelector<HTMLButtonElement>('.unread-summary-button')?.disabled).toBe(true);expect(summarizeUnread).toHaveBeenCalledOnce();
});
it('keeps the button in its toolbar and renders the generated summary in the timeline target',async()=>{
 const target=document.createElement('div');document.body.append(target);
 try{
  vi.mocked(summarizeUnread).mockResolvedValue({status:'ready',summary:'Timeline-aligned catch-up'});
  await act(async()=>root.render(<UnreadSummary readerId="reader" username="owner" slug="news" readIds={[]} contentKey="one" summaryTarget={target}/>));
  await click('.unread-summary-button');
  expect(host.querySelector('.unread-summary-section')).toBeNull();expect(target.textContent).toContain('Timeline-aligned catch-up');
  await act(async()=>target.querySelector<HTMLButtonElement>('.unread-summary-close')!.click());expect(target.children).toHaveLength(0);
 }finally{target.remove();}
});
