import {expect,it} from "vitest";
import {MIN_TRUSTED_PUBLIC_ARTICLE_BODY_CHARS} from "@distilled/agent-runtime";
import {createApp} from "./app";
import {InMemoryRepository} from "./repository";
import type {Env} from "./types";

it("uses substantive dated fixture articles and keeps all fixture routes disabled by default",async()=>{
  const app=createApp({repository:new InMemoryRepository()});
  const enabled={DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE:"true"} as Env;
  for(const id of ["a","b"]){
    const path=`https://fixture.example/v1/live-smoke/browser-use-fixture/article/${id}`;
    expect((await app.request(path,{},{} as Env)).status).toBe(404);
    const response=await app.request(path,{},enabled);
    const html=await response.text();
    const metadata=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
    expect(metadata.articleBody.length).toBeGreaterThanOrEqual(MIN_TRUSTED_PUBLIC_ARTICLE_BODY_CHARS);
    expect(metadata.mainEntityOfPage).toBe(path);
    expect(Number.isFinite(Date.parse(metadata.datePublished))).toBe(true);
  }
  expect((await app.request("/v1/live-smoke/browser-use-fixture/listing/evaluation",{},{} as Env)).status).toBe(404);
});
