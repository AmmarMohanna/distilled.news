import {request} from "node:http";
import type {AddressInfo} from "node:net";
import {describe,expect,it} from "vitest";
import {createBridgeHttpServer} from "../src/server";

describe("browser bridge HTTP authority",()=>{
 it("never trusts a user-controlled Host header for service request origin",async()=>{
  const seen:string[]=[];
  const server=createBridgeHttpServer({handle:async incoming=>{
   seen.push(incoming.url);
   return new Response("ok",{status:200});
  }});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
   const port=(server.address() as AddressInfo).port;
   const code=await new Promise<number>((resolve,reject)=>{
    const req=request({hostname:"127.0.0.1",port,method:"GET",path:"/health",headers:{host:"untrusted.example"}},response=>{
     response.resume();
     response.on("end",()=>resolve(response.statusCode??0));
    });
    req.once("error",reject);
    req.end();
   });
   expect(code).toBe(200);
   expect(seen).toHaveLength(1);
   expect(new URL(seen[0]!).origin).toBe("http://127.0.0.1");
   expect(new URL(seen[0]!).pathname).toBe("/health");
  }finally{
   await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
 });
});
