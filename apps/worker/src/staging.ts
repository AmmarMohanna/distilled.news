import worker from './index';
import {stagingMission} from './staging-mission';
import {createStagingAssets} from './staging-assets';
import type {Env} from './types';
/** Same application and ingestion handlers; no second collector Worker or public execution proxy. */
export default {
 fetch:((request:Request,env:Env,ctx:ExecutionContext)=>
  new URL(request.url).pathname.startsWith('/__staging/mission/')?stagingMission(request,env):worker.fetch(request,env.ASSETS?env:{...env,ASSETS:createStagingAssets(env.RAW_ARCHIVE,env.STAGING_ASSETS_PREFIX??'')},ctx)),
 scheduled: worker.scheduled,
 queue: worker.queue,
};
