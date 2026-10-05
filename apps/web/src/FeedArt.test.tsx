import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {FeedArt} from './FeedArt';
it('preserves pencil artwork without issuing requests to unavailable image endpoints',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(<FeedArt canGenerate feed={{id:'feed',title:'Science',ownerUsername:'owner',slug:'science'}}/>));
 expect(host.querySelectorAll('svg')).toHaveLength(2);expect(host.querySelector('button')).toBeNull();expect(fetcher).not.toHaveBeenCalled();
 await act(async()=>root.unmount());vi.unstubAllGlobals();
});
