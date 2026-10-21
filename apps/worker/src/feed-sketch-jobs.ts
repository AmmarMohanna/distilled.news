import type { BriefingConfig } from "@distilled/core";
import type { Env } from "./types";
import { generateSketch, sketchKey } from "./sketches";

export type FeedSketchMessage = { type: "generate_feed_sketch"; feedId: string };
type Subject = Pick<BriefingConfig, "id" | "title" | "interestProfile">;
const LEASE_MS = 120_000;

export async function queueInitialFeedSketch(env: Env, feed: Subject): Promise<void> {
  if (!env.DB) return;
  if (env.RAW_ARCHIVE && await env.RAW_ARCHIVE.head(sketchKey(feed))) return;
  const now = new Date();
  const inserted = await env.DB.prepare(
    `INSERT INTO feed_sketch_jobs (feed_id,title,interest_profile,state,attempts,next_attempt_at,dispatch_until,updated_at)
     VALUES (?, ?, ?, 'pending', 0, ?, ?, ?) ON CONFLICT(feed_id) DO NOTHING RETURNING feed_id`
  ).bind(feed.id, feed.title, feed.interestProfile, now.toISOString(),
    new Date(now.getTime() + LEASE_MS).toISOString(), now.toISOString()).first<{feed_id:string}>();
  const queue=env.IMAGE_QUEUE??env.PROCESSING_QUEUE;
  if (!inserted || !queue) return;
  try { await queue.send({type:"generate_feed_sketch",feedId:feed.id}); }
  catch { console.warn("Feed illustration will be redispatched",{feedId:feed.id}); }
}

export async function dispatchDueFeedSketches(env: Env, now = new Date()): Promise<number> {
  const queue=env.IMAGE_QUEUE??env.PROCESSING_QUEUE;
  if (!env.DB || !queue) return 0;
  const current = now.toISOString(), until = new Date(now.getTime()+LEASE_MS).toISOString();
  const rows = await env.DB.prepare(
    `UPDATE feed_sketch_jobs SET dispatch_until=?
     WHERE feed_id IN (SELECT feed_id FROM feed_sketch_jobs
       WHERE dispatch_until<=? AND
       ((state='pending' AND next_attempt_at<=?) OR (state='running' AND lease_until<=?))
       ORDER BY next_attempt_at,feed_id LIMIT 20)
     RETURNING feed_id`
  ).bind(until,current,current,current).all<{feed_id:string}>();
  for (const row of rows.results) try {
    await queue.send({type:"generate_feed_sketch",feedId:row.feed_id});
  } catch { console.warn("Feed illustration redispatch deferred",{feedId:row.feed_id}); }
  return rows.results.length;
}

export async function processFeedSketchJob(env: Env, feedId: string, now = new Date()): Promise<void> {
  if (!env.DB || !env.RAW_ARCHIVE) throw new Error("FEED_SKETCH_DEPENDENCY_MISSING");
  const current=now.toISOString(),token=crypto.randomUUID(),lease=new Date(now.getTime()+LEASE_MS).toISOString();
  const job=await env.DB.prepare(
    `UPDATE feed_sketch_jobs SET state='running', attempts=attempts+1, lease_token=?,lease_until=?,updated_at=?
     WHERE feed_id=? AND ((state='pending' AND next_attempt_at<=?) OR (state='running' AND lease_until<=?))
     RETURNING title,interest_profile,attempts`
  ).bind(token,lease,current,feedId,current,current).first<{title:string;interest_profile:string;attempts:number}>();
  if(!job)return;
  const subject={id:feedId,title:job.title,interestProfile:job.interest_profile};
  try {
    if(!await env.RAW_ARCHIVE.head(sketchKey(subject))){
      const saved=await generateSketch(env,subject,async()=>
        Boolean(await env.DB.prepare(
          "SELECT feed_id FROM feed_sketch_jobs WHERE feed_id=? AND state='running' AND lease_token=? AND lease_until>?"
        ).bind(feedId,token,new Date().toISOString()).first()));
      if(!saved)return;
    }
    await env.DB.prepare("UPDATE feed_sketch_jobs SET state='ready',lease_token=NULL,lease_until=NULL,last_error=NULL,updated_at=? WHERE feed_id=? AND lease_token=?")
      .bind(new Date().toISOString(),feedId,token).run();
  }catch(error){
    const seconds=Math.min(3600,30*2**Math.min(7,job.attempts-1));
    const retryAt=new Date(Date.now()+seconds*1000).toISOString();
    await env.DB.prepare("UPDATE feed_sketch_jobs SET state='pending',lease_token=NULL,lease_until=NULL,next_attempt_at=?,dispatch_until=?,last_error=?,updated_at=? WHERE feed_id=? AND lease_token=?")
      .bind(retryAt,retryAt,error instanceof Error && 'code' in error && typeof error.code==='string'?error.code:'GENERATION_FAILED',new Date().toISOString(),feedId,token).run();
    console.warn("Feed illustration retry scheduled",{feedId,attempts:job.attempts});
  }
}
