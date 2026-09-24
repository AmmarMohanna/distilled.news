import {createServer,type Server} from "node:http";
import type {AddressInfo} from "node:net";

/**
 * Synthetic sites for bridge tests and the production preflight. Everything here is deterministic, has no JavaScript except
 * the auto-submitting redirect scenario, and holds only synthetic markers. Nothing here can reach a real site.
 */
const page=(title:string,body:string)=>`<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`;
const listen=(server:Server,port:number,host:string)=>new Promise<void>(resolve=>server.listen(port,host,resolve));
const close=(server?:Server)=>new Promise<void>(resolve=>server?server.close(()=>resolve()):resolve());

/** The "disallowed" origin of the redirect scenarios: records every request and body it receives. */
export class ForeignSite{
  readonly hits:string[]=[];readonly bodies:string[]=[];server!:Server;origin!:string;
  async start(port=0,host="127.0.0.1"){
    this.server=createServer((req,res)=>{this.hits.push(`${req.method} ${req.url}`);const chunks:Buffer[]=[];req.on("data",chunk=>chunks.push(chunk));req.on("end",()=>{this.bodies.push(Buffer.concat(chunks).toString("utf8"));res.writeHead(200,{"content-type":"text/html"});res.end(page("Foreign","<h1>FOREIGN_PAGE</h1>"))})});
    await listen(this.server,port,host);this.origin=`http://${host}:${(this.server.address() as AddressInfo).port}`;return this;
  }
  reset(){this.hits.length=0;this.bodies.length=0}
  stop(){return close(this.server)}
}

export interface SyntheticSiteOptions{identifier:string;password:string;cookie:string;/** Marker carried by the auto-submitted POST in /form-307. */redirectMarker?:string;/** Public origin the redirect scenarios point at. Omitted: an internal ForeignSite is started. */foreignOrigin?:string}

/** A two-step login site plus CAPTCHA and redirect scenarios. It records what it received so a test can prove real injection. */
export class SyntheticSite{
  readonly received:Array<{path:string;body:string}>=[];server!:Server;origin!:string;
  private internalForeign?:ForeignSite;
  constructor(private readonly options:SyntheticSiteOptions){}
  get foreignOrigin(){return this.options.foreignOrigin??this.internalForeign!.origin}
  /** Requests received by the internal foreign site (tests); external foreign sites are inspected directly. */
  get otherHits(){return this.internalForeign?.hits.length??0}
  get otherOrigin(){return this.internalForeign?.origin}
  async start(port=0,host="127.0.0.1"){
    if(!this.options.foreignOrigin){this.internalForeign=await new ForeignSite().start()}
    const {identifier,password,cookie}=this.options;const marker=this.options.redirectMarker??"TEST_PASSWORD_SECRET_redirect_marker";
    this.server=createServer((req,res)=>{
      const url=new URL(req.url??"/","http://127.0.0.1");const chunks:Buffer[]=[];
      req.on("data",chunk=>chunks.push(chunk));
      req.on("end",()=>{
        const body=Buffer.concat(chunks).toString("utf8");if(req.method==="POST")this.received.push({path:url.pathname,body});
        const html=(status:number,title:string,content:string,headers:Record<string,string>={})=>{res.writeHead(status,{"content-type":"text/html",...headers});res.end(page(title,content))};
        const redirect=(status:number,location:string)=>{res.writeHead(status,{location});res.end()};
        if(url.pathname==="/structure"&&req.method==="GET")return html(200,"Structure fixture",`<button type="button">Continue</button><input aria-label="Username"><iframe src="/structure-frame" title="fixture"></iframe>`);
        if(url.pathname==="/link-listing"&&req.method==="GET")return html(200,"Listing fixture",`${Array.from({length:45},(_,index)=>`<a href="/navigation/${index}">Navigation ${index}</a>`).join("")}<article><a href="/article/one">First article</a><a href="/article/two">Second article</a></article>`);
        if(url.pathname==="/structure-frame"&&req.method==="GET")return html(200,"Structure frame","<p>Frame fixture</p>");
        if(url.pathname==="/login"&&req.method==="GET")return html(200,"Login step 1",`<form method="POST" action="/login/step1"><label>Username <input name="username" type="text" aria-label="Username"></label><button type="submit">Continue</button></form>`);
        if(url.pathname==="/login/step1"&&req.method==="POST"){
          if(new URLSearchParams(body).get("username")!==identifier)return html(200,"Login step 1",`<p>Unknown account</p><form method="POST" action="/login/step1"><input name="username" type="text" aria-label="Username"><button type="submit">Continue</button></form>`);
          return html(200,"Login step 2",`<form method="POST" action="/login/step2"><label>Password <input name="password" type="password" aria-label="Password"></label><button type="submit">Log in</button></form>`);
        }
        if(url.pathname==="/login/step2"&&req.method==="POST"){
          if(new URLSearchParams(body).get("password")!==password)return html(200,"Login step 2",`<p>Incorrect password</p>`);
          res.writeHead(302,{location:"/home","set-cookie":`auth_session=${cookie}; Path=/; HttpOnly; SameSite=Lax`});return void res.end();
        }
        if(url.pathname==="/home"&&req.method==="GET"){
          if((req.headers.cookie??"").includes(`auth_session=${cookie}`))return html(200,"Home / Synthetic","<main><h1>Welcome to the feed</h1></main>");
          return redirect(302,"/login");
        }
        if(url.pathname==="/captcha")return html(200,"Security challenge","<h2>Complete CAPTCHA</h2><div id=\"captcha-widget\">Please verify you are a human</div><button type=\"button\">Verify</button>");
        if(url.pathname==="/bounce"||url.pathname==="/to-foreign")return redirect(302,`${this.foreignOrigin}/from-get`);
        // A credential-bearing POST that the site answers with 307 to a disallowed origin: the browser must not re-send the body there.
        if(url.pathname==="/form-307")return html(200,"Form",`<form id="f" method="POST" action="/post-307"><input name="password" value="${marker}"></form><script>document.getElementById("f").submit()</script>`);
        if(url.pathname==="/post-307")return redirect(307,`${this.foreignOrigin}/from-post`);
        res.writeHead(404);res.end();
      });
    });
    await listen(this.server,port,host);this.origin=`http://${host}:${(this.server.address() as AddressInfo).port}`;
    return this;
  }
  async stop(){await Promise.all([close(this.server),this.internalForeign?.stop()])}
}
