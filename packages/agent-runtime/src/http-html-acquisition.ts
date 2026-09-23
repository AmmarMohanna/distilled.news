import type {AcquiredSourceItem,SourceAcquisitionAdapter,SourceAcquisitionPage,SourceAcquisitionRequest} from "./temporal-acquisition";

export interface HttpHtmlListingPage { articleUrls:string[]; nextUrl?:string; lowerBoundaryProven?:boolean; sourceExhausted?:boolean; paginationExhausted?:boolean; }
export interface HttpHtmlSourceWorkflow {
  listingUrl(request:SourceAcquisitionRequest,pageNumber:number):string;
  parseListing(html:string,url:string,request:SourceAcquisitionRequest,pageNumber:number):HttpHtmlListingPage;
  parseArticle(html:string,url:string,request:SourceAcquisitionRequest):AcquiredSourceItem|undefined;
}

/** Generic deterministic HTTP/HTML traversal. Site-specific recognition stays in the workflow. */
export class HttpHtmlSourceAcquisitionAdapter implements SourceAcquisitionAdapter {
  readonly authentication="PUBLIC" as const;
  private pageNumber=0; private nextListingUrl?:string; private seenUrls=new Set<string>(); private closed=false;
  constructor(private readonly workflow:HttpHtmlSourceWorkflow,private readonly fetcher:typeof fetch=fetch,private readonly maxArticlesPerPage=25){}
  async open(request:SourceAcquisitionRequest):Promise<void>{this.pageNumber=0;this.nextListingUrl=this.workflow.listingUrl(request,1);this.seenUrls.clear();this.closed=false;}
  async next(request:SourceAcquisitionRequest):Promise<SourceAcquisitionPage>{
    if(this.closed||!this.nextListingUrl)return{items:[],sourceExhausted:true};
    const listingUrl=this.nextListingUrl; const response=await this.fetcher(listingUrl,{headers:{accept:"text/html,application/xhtml+xml"}});
    if(!response.ok)throw new Error(`HTTP listing fetch failed: ${response.status}`);
    this.pageNumber++; const listing=this.workflow.parseListing(await response.text(),listingUrl,request,this.pageNumber);
    const urls=listing.articleUrls.map(value=>new URL(value,listingUrl).href).filter(value=>{if(this.seenUrls.has(value))return false;this.seenUrls.add(value);return true;}).slice(0,this.maxArticlesPerPage);
    const items:AcquiredSourceItem[]=[];
    for(const url of urls){const article=await this.fetcher(url,{headers:{accept:"text/html,application/xhtml+xml"}});if(!article.ok)continue;const item=this.workflow.parseArticle(await article.text(),url,request);if(item)items.push(item);}
    this.nextListingUrl=listing.nextUrl;
    return{items,lowerBoundaryReached:listing.lowerBoundaryProven,sourceExhausted:listing.sourceExhausted??(!listing.nextUrl&&!listing.paginationExhausted),paginationExhausted:listing.paginationExhausted};
  }
  async close():Promise<void>{this.closed=true;this.nextListingUrl=undefined;this.seenUrls.clear();}
}
