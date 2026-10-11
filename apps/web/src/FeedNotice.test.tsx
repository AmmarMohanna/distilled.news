import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {FeedNotice,FeedPublicationNotice,FeedProcessingProgress} from './FeedNotice';
async function render(node:React.ReactNode,check:(host:HTMLDivElement)=>void){
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div'),root=createRoot(host);
 try{await act(async()=>root.render(node));check(host)}finally{await act(async()=>root.unmount());vi.unstubAllGlobals()}
}
it.each(['en','ar','fr'] as const)('pending correction is a warning, preserves editions and does not claim withdrawal (%s)',async language=>{
 await render(<><FeedPublicationNotice publicationState="correction_pending" hasPublishedEditions language={language}/><article>Published story</article></>,host=>{
  expect(host.querySelector('[role="status"]')).not.toBeNull();expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector('h2')?.textContent).not.toBe('feed unavailable');expect(host.textContent).not.toContain('withdrawn');expect(host.querySelector('article')?.textContent).toBe('Published story');
 });
});
it('does not assert available editions when the API returned none',async()=>{
 await render(<FeedPublicationNotice publicationState="correction_pending" hasPublishedEditions={false} language="en"/>,host=>expect(host.textContent).toBe('Correction pendingA correction to an earlier briefing is pending.'));
});
it('failed window does not label readable Feed unavailable',async()=>{
 await render(<FeedPublicationNotice publicationState="failed" hasPublishedEditions language="en"/>,host=>{expect(host.querySelector('h2')?.textContent).toBe('Briefing delayed');expect(host.textContent).toContain('Published briefings remain available.')});
});
it('actual read error retains unavailable heading and alert severity',async()=>{
 await render(<FeedNotice message="Feed could not be loaded." language="en"/>,host=>{expect(host.querySelector('h2')?.textContent).toBe('feed unavailable');expect(host.querySelector('[role="alert"]')).not.toBeNull()});
});
it('normal publication has no warning',async()=>{
 await render(<FeedPublicationNotice publicationState="published" hasPublishedEditions language="en"/>,host=>expect(host.children).toHaveLength(0));
});

it('processing shows actual review counts and updates without pretending publication completed',async()=>{
 const progress={stage:'PROCESSING' as const,acquisition:{completed:410,total:410,failed:0},review:{completed:69,total:409,failed:0},pending:340};
 await render(<FeedProcessingProgress progress={progress} language="en"/>,host=>{expect(host.textContent).toContain('Reviewing collected items');expect(host.textContent).toContain('Items reviewed: 69 / 409');expect(host.textContent).toContain('Items still processing: 340');expect(host.textContent).not.toContain('Checking sources');});
 await render(<FeedProcessingProgress progress={{...progress,review:{...progress.review,completed:70},pending:339}} language="en"/>,host=>expect(host.textContent).toContain('70 / 409'));
});
it.each(['en','ar','fr'] as const)('publishing displays its stage without stale review counters (%s)',async language=>{await render(<FeedProcessingProgress progress={{stage:'PUBLISHING',acquisition:{completed:1,total:1,failed:0},review:{completed:1,total:1,failed:0},pending:0}} language={language}/>,host=>{expect(host.querySelector('[role="status"]')).not.toBeNull();expect(host.textContent).not.toContain('1 / 1');expect(host.textContent?.length).toBeGreaterThan(5);});});
