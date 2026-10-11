import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {FeedArt} from './FeedArt';
it('preserves pencil artwork when no generated sketch is saved',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const fetcher=vi.fn().mockResolvedValue({ok:false,status:404});vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(<FeedArt feed={{id:'feed',title:'Science',ownerUsername:'owner',slug:'science'}}/>));
 expect(host.querySelectorAll('svg')).toHaveLength(2);expect(host.querySelector('button')).toBeNull();expect(fetcher).toHaveBeenCalledWith('/api/feed/owner/science/sketch',expect.objectContaining({cache:'no-store'}));
 await act(async()=>root.unmount());vi.unstubAllGlobals();
});
