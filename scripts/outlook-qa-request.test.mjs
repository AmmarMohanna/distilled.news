import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestMicrosoft} from './outlook-qa-request.mjs';

test('connection failure preserves the same authorization request until recovery', async () => {
  const requests=[], options={method:'POST',body:new URLSearchParams({device_code:'test-only'})};
  const result=await requestMicrosoft('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',options,{
    fetchImpl:async (url,input)=>{requests.push({url,body:input.body.toString()});if(requests.length<3)throw new TypeError('fetch failed');return Response.json({error:'authorization_pending'},{status:400});},
    sleep:async()=>{}
  });
  assert.equal(result.status,400);
  assert.equal(requests.length,3);
  assert.deepEqual(requests[0],requests[2]);
});

test('temporary service failure retries, but a permanent authentication rejection does not',async()=>{
  let calls=0;
  const result=await requestMicrosoft('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{}, {
    fetchImpl:async()=>{calls++;return calls===1?new Response('',{status:503}):Response.json({error:'invalid_client'},{status:401});},sleep:async()=>{}
  });
  assert.equal(calls,2);
  assert.equal(result.status,401);
});

test('persistent network failure is bounded rather than hiding authorization expiry',async()=>{
  let calls=0;
  await assert.rejects(requestMicrosoft('https://graph.microsoft.com/v1.0/me',{}, {
    fetchImpl:async()=>{calls++;throw new TypeError('fetch failed');},sleep:async()=>{}
  }),/fetch failed/);
  assert.equal(calls,4);
});
