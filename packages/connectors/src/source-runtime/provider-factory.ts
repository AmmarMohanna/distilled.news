import type { FeedHttpPort, ImmutablePayloadStore } from './ports';
import type { CandidateIntakePort } from '@distilled/contracts';
import { FeedSourceProvider, TelegramSourceProvider, type SourceExecutionPort } from './platform-providers';
import { TwitterApiIoProvider, ApifySourceProvider, type SecretResolver } from './social-providers';
import { WebsiteSourceProvider } from './website-providers';
import type { ProviderHttpPort } from './provider-http';
import { D1ProviderSourceRepository } from './provider-storage';
import { FallbackSourceCollector } from './provider-collector';

/** Opt-in backend composition. Deployment supplies authorized HTTP, private runtime,
 * secrets, durable D1/R2 and the canonical intake binding. No polling switch implied. */
export function createSourceCollector(bindings:{
  repository:D1ProviderSourceRepository;payloads:ImmutablePayloadStore;intake:CandidateIntakePort;
  http:FeedHttpPort;paidHttp:ProviderHttpPort;execution:SourceExecutionPort;secrets:SecretResolver;
  enrichRssArticles?:boolean;
  ceilings:{twitterApiIo:number;apify:number;zyte:number};
}) {
  const {repository,payloads,intake,http,paidHttp,execution,secrets,ceilings,enrichRssArticles}=bindings;
  return new FallbackSourceCollector(repository,payloads,intake,[
    new FeedSourceProvider('rss_native',http,enrichRssArticles?execution:undefined),new FeedSourceProvider('rss_feedparser',http,execution),new FeedSourceProvider('google_rss',http),
    new TelegramSourceProvider('telegram_telethon',http,execution),new TelegramSourceProvider('telegram_public',http),
    new TwitterApiIoProvider(paidHttp,secrets,ceilings.twitterApiIo),
    new ApifySourceProvider('google_apify',['google_news'],paidHttp,secrets,ceilings.apify),
    new ApifySourceProvider('x_apify',['x_profile','x_search'],paidHttp,secrets,ceilings.apify),
    new ApifySourceProvider('linkedin_apify',['linkedin_company','linkedin_profile'],paidHttp,secrets,ceilings.apify),
    new ApifySourceProvider('apify_actor',['apify'],paidHttp,secrets,ceilings.apify),
    new WebsiteSourceProvider('website_http',http,execution),new WebsiteSourceProvider('website_playwright',http,execution),
    new WebsiteSourceProvider('website_zyte',http,execution,paidHttp,secrets,ceilings.zyte),
  ]);
}
