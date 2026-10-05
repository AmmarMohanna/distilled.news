import worker from './index';
import {createStagingAssets} from './staging-assets';
import type {Env} from './types';
/** Same application and ingestion handlers; no second collector Worker or public execution proxy. */
export default {...worker,fetch:((request:Request,env:Env,ctx:ExecutionContext)=>
 worker.fetch(request,env.ASSETS?env:{...env,ASSETS:createStagingAssets(env.RAW_ARCHIVE,env.STAGING_ASSETS_PREFIX??'')},ctx))};
