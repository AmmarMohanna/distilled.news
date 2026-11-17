import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {attribution} from './attribute-legacy-x-operation.mjs';
const run={feed_id:'feed',feed_source_id:'source',source_id:'identity',run_id:'run'};
const operation={provider_id:'x_twitterapi_io',operation_id:createHash('sha256').update(JSON.stringify([{feedId:'feed',feedSourceId:'source',sourceId:'identity'},'run'])).digest('hex'),status:-1,payload_ref:null,feed_id:null,feed_source_id:null};
test('only exact unique immutable lineage restores attribution',()=>{assert.equal(attribution(operation,[run]),run);assert.throws(()=>attribution(operation,[]));assert.throws(()=>attribution(operation,[run,run]));assert.throws(()=>attribution(operation,[{...run,source_id:'wrong'}]));});
test('completed, attributed and other-provider operations cannot be reassigned',()=>{for(const patch of [{provider_id:'x_apify'},{payload_ref:'receipt'},{status:200},{feed_id:'other'},{feed_source_id:'other'}])assert.throws(()=>attribution({...operation,...patch},[run]));});
