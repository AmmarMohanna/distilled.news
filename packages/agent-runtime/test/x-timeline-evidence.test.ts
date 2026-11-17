import { describe,expect,it } from "vitest";
import { extractXTimelinePosts,type XTimelineDomNode } from "../src/x-timeline-evidence";

function node(index:number,parent:number,name:string,value="",attributes:Record<string,string>={}):XTimelineDomNode{return{index,parent,name,value,attributes:new Map(Object.entries(attributes)),children:[]}}
function fixture(){
  const nodes=new Map<number,XTimelineDomNode>();
  const add=(value:XTimelineDomNode)=>{nodes.set(value.index,value);nodes.get(value.parent)?.children.push(value.index)};
  add(node(0,-1,"body"));
  add(node(1,0,"article","",{"data-testid":"tweet"}));
  add(node(2,1,"a","",{href:"/source/status/1234567890"}));
  add(node(3,1,"time","",{datetime:"2026-09-27T10:00:00Z"}));
  add(node(4,1,"div","",{"data-testid":"tweetText"}));
  add(node(5,4,"#text","Trusted post body"));
  add(node(6,0,"article","",{"data-testid":"tweet"}));
  add(node(7,6,"a","",{href:"/source/status/1234567889"}));
  add(node(8,6,"time","",{datetime:"2026-09-26T10:00:00Z"}));
  add(node(9,6,"div","",{"data-testid":"tweetText"}));
  add(node(10,9,"#text","Earlier trusted post"));
  return nodes;
}
describe("trusted X timeline DOM extraction",()=>{
  it("extracts bounded canonical IDs, absolute timestamps and text from source-account articles",()=>{
    expect(extractXTimelinePosts(fixture(),"https://x.com/source")).toEqual([
      {sourceItemId:"1234567890",canonicalItemUrl:"https://x.com/source/status/1234567890",publishedAt:"2026-09-27T10:00:00.000Z",text:"Trusted post body"},
      {sourceItemId:"1234567889",canonicalItemUrl:"https://x.com/source/status/1234567889",publishedAt:"2026-09-26T10:00:00.000Z",text:"Earlier trusted post"}
    ]);
  });
  it("rejects unrelated accounts, foreign origins, and absent timestamp evidence",()=>{
    const nodes=fixture();nodes.get(2)!.attributes.set("href","https://evil.example/source/status/1234567890");nodes.get(8)!.attributes.delete("datetime");
    expect(extractXTimelinePosts(nodes,"https://x.com/source")).toEqual([]);
    expect(extractXTimelinePosts(fixture(),"https://evil.example/source")).toEqual([]);
  });
});
