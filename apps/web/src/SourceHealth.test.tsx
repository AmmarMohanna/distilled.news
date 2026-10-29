import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {SourceHealth} from './SourceHealth';
import type {FeedPayload} from './types';
const source={sourceId:'source',title:'Publisher',state:'AVAILABLE' as const,providers:['website_http'],acquisition:{completed:50,pending:0,failed:4,issues:[{reason:'LISTING_PAGE',count:2},{reason:'PAID_OUTCOME_UNKNOWN',count:2}]},warning:'ARTICLE_ACQUISITION_FAILED'};
async function render(sources:FeedPayload['sourceAvailability'],check:(host:HTMLDivElement)=>void){
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div'),root=createRoot(host);
 try{await act(async()=>root.render(<SourceHealth sources={sources} language="en" t={s=>s}/>));check(host)}finally{await act(async()=>root.unmount());vi.unstubAllGlobals()}
}
it('keeps saved item failures accessible but collapsed without a current outage banner',async()=>{
 await render([source],host=>{expect(host.querySelector('[role="status"]')).toBeNull();expect(host.querySelector('[role="alert"]')).toBeNull();expect(host.querySelector('details')?.open).toBe(false);expect(host.querySelector('summary')?.textContent).toBe('Source details');expect(host.textContent).toContain('earlier failed attempts');expect(host.textContent).toContain('waiting for confirmation of an earlier paid request');expect(host.textContent).toContain('indexes or section listings');});
});
it('still warns for an actual collection block, including unresolved paid collection',async()=>{
 await render([{...source,state:'UNAVAILABLE',reason:'PAID_OPERATION_UNCERTAIN'}],host=>{expect(host.querySelector('[role="status"]')).not.toBeNull();expect(host.textContent).toContain('Source collection needs attention');expect(host.textContent).toContain('needs reconciliation before collection can continue');expect(host.querySelector('details')?.open).toBe(false);});
});
it('shows automatic recovery waits in details without an outage warning',async()=>{
 await render([{...source,collectionError:'BACKPRESSURE'}],host=>{expect(host.querySelector('[role="status"]')).toBeNull();expect(host.textContent).toContain('waiting for processing capacity');});
});
it('renders nothing when sources have no collection problems or saved failures',async()=>{
 await render([{...source,acquisition:{completed:50,pending:1,failed:0,issues:[]},warning:undefined}],host=>expect(host.children).toHaveLength(0));
});
