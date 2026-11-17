import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertStagingTarget} from './upload-staging-assets.mjs';
const config='name = "distilled-news-staging"\naccount_id = "e32b564514d4f9b9e383b7dd30dbb026"\nbucket_name = "distilled-news-staging-raw"\n';
test('immutable staging upload rejects another worker, bucket or account before upload',()=>{
 assert.doesNotThrow(()=>assertStagingTarget(config));
 for(const [before,after] of [['name = "distilled-news-staging"','name = "distilled-news"'],['bucket_name = "distilled-news-staging-raw"','bucket_name = "distilled-news-sources-qa-raw"'],['e32b564514d4f9b9e383b7dd30dbb026','another-account']])assert.throws(()=>assertStagingTarget(config.replace(before,after)),/UNEXPECTED_STAGING_TARGET/);
});
