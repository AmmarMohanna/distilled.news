import {it,expect,vi} from 'vitest';
import {createStagingAssets} from './staging-assets';
const prefix='staging-assets/'+'a'.repeat(40)+'/',hash='b'.repeat(32);
it('never interprets a URL or manifest entry as a raw archive capability',async()=>{
 const get=vi.fn(async(key:string)=>key.endsWith('manifest.json')?{size:100,json:async()=>({'/index.html':{hash:'../source-payloads/private',type:'text/html'}})}:null);
 const response=await createStagingAssets({get} as unknown as R2Bucket,prefix).fetch('https://staging.invalid/source-payloads/private');
 expect(response.status).toBe(503);expect(get).toHaveBeenCalledTimes(1);expect(get).toHaveBeenCalledWith(prefix+'manifest.json');
});
it('serves exact manifest assets and SPA fallback from the immutable prefix',async()=>{
 const get=vi.fn(async(key:string)=>key.endsWith('manifest.json')?{size:100,json:async()=>({'/index.html':{hash,type:'text/html'}})}:{body:'staging app'});
 const response=await createStagingAssets({get} as unknown as R2Bucket,prefix).fetch('https://staging.invalid/@owner/feed');
 expect(await response.text()).toBe('staging app');expect(get).toHaveBeenLastCalledWith(prefix+hash);
});
