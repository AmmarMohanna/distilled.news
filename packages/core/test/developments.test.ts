import {expect,it} from 'vitest';
import {processMessages,personalNewsBriefing,type NormalizedMessage} from '../src';

it('keeps a concrete cancellation development from a publisher feed without requiring a casualty or a number',()=>{
  const now=new Date('2026-09-28T12:00:00Z');
  const raw:NormalizedMessage={id:'cancellation',messageId:'cancellation',source:{id:'publisher',title:'Publisher',type:'channel',provider:'rss',kind:'rss_feed'},text:'Plan for controversial Sydney data centre scrapped after push-back. The developer withdrew the proposal after changes to planning regulations.',links:[],media:[],postedAt:now.toISOString(),receivedAt:now.toISOString(),expiresAt:'2026-10-01T12:00:00Z'};
  const result=processMessages({briefing:{...personalNewsBriefing,interestProfile:'',intensity:'low'},messages:[raw],now});
  expect(result.publishedItems).toHaveLength(1);expect(result.publishedItems[0].evidence[0].messageId).toBe(raw.id);
});
