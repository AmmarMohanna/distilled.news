import { readFile,readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { afterEach,describe,expect,it } from "vitest";
import { provisionAuthenticatedProfile } from "./authenticated-profile-provisioning";
import type { Env } from "./types";

describe("authenticated profile account ownership",()=>{
  let mf:Miniflare|undefined;
  afterEach(async()=>{await mf?.dispose();mf=undefined;});
  it("accepts only an active account acting as its own tenant",async()=>{
    mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"],r2Buckets:["AUTHENTICATED_SECRETS"]});
    const db=await mf.getD1Database("DB");for(const name of (await readdir(new URL("../migrations/",import.meta.url))).filter(name=>name.endsWith(".sql")).sort())await apply(db,await readFile(new URL(`../migrations/${name}`,import.meta.url),"utf8"));
    await db.prepare(`INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('account-a','a@example.invalid','a@example.invalid','a','admin','hash','2026-01-01','2026-01-01','2026-01-01')`).run();
    const bucket=await mf.getR2Bucket("AUTHENTICATED_SECRETS");const env={DB:db,AUTHENTICATED_SECRETS:bucket,WEB_OPERATOR_RUNTIME_TOKEN:"runtime",AUTH_PROFILE_ACTIVE_KEY_ID:"v1",AUTH_PROFILE_ENCRYPTION_KEYS:JSON.stringify({v1:Buffer.alloc(32,9).toString("base64")})} as unknown as Env;
    const call=(tenantId:string,ownerId:string)=>provisionAuthenticatedProfile(new Request("https://worker.test/v1/authenticated-profiles",{method:"POST",headers:{authorization:"Bearer runtime","content-type":"application/json"},body:JSON.stringify({tenantId,ownerId,site:"x",username:"secret-user",password:"secret-password"})}),env);
    expect(await call("account-a","other")).toMatchObject({status:403});
    expect(await call("missing","missing")).toMatchObject({status:404});
    expect(await call("live-smoke","live-smoke")).toMatchObject({status:404});
    const accepted=await call("account-a","account-a");expect(accepted.status).toBe(201);expect(JSON.stringify(await accepted.json())).not.toMatch(/secret-user|secret-password|credential\.v1/);
    await db.prepare("UPDATE accounts SET disabled_at='2026-01-02' WHERE id='account-a'").run();expect(await call("account-a","account-a")).toMatchObject({status:403});
    expect((await db.prepare("SELECT COUNT(*) count FROM authenticated_site_profiles").first<{count:number}>())?.count).toBe(1);
  },30_000);
});
async function apply(db:D1Database,sql:string){
  if (/CREATE TRIGGER/.test(sql)) {
    for (const statement of sql.match(/CREATE TRIGGER[\s\S]*?^END;/gm) ?? []) await db.prepare(statement).run();
    return;
  }
  const withoutComments=sql.split(/\r?\n/).filter(line=>!line.trimStart().startsWith("--")).join("\n");
  for(const statement of withoutComments.split(/;\s*(?:\r?\n|$)/).map(value=>value.trim()).filter(Boolean))await db.prepare(statement).run();
}
