import type {EventVersion} from '@distilled/contracts';
import type {LiveSchedule} from './schedule';
export interface FeedRecord {
 id:string;ownerId:string;title:string;interests:string[];geography:string[];outputLanguage:string;
 briefingFrequency:'30M'|'HOURLY'|'DAILY'|'WEEKLY';paused:boolean;revision:number;createdAt:string;updatedAt:string;deletedAt?:string;
 briefingSchedule?:LiveSchedule;
}
export type EvidenceRole='PRIMARY_DEVELOPMENT'|'REPORTED_DEVELOPMENT'|'OFFICIAL_STATEMENT'|'INVESTIGATIVE_REPORT'|'ANALYSIS'|'OPINION'|'PROMOTION'|'UNVERIFIED_LEAD'|'NOISE';
export interface RoleDecision {id:string;feedId:string;evidenceId:string;evidenceRevisionId:string;role:EvidenceRole;confidence:number;policyVersion:string;computedAt:string}
export interface DuplicateDecision {id:string;feedId:string;evidenceRevisionId:string;duplicateOfRevisionId?:string;kind:'UNIQUE'|'EXACT'|'NEAR';similarity:number;policyVersion:string;computedAt:string}
export interface EventRecord {id:string;feedId:string;currentVersionId:string;createdAt:string}
export interface StorylineRecord {id:string;feedId:string;currentVersionId:string;createdAt:string}
export interface SupportedFact {text:string;eventVersionId:string;evidenceRevisionIds:string[]}
export interface StorylineVersion {
 id:string;storylineId:string;feedId:string;version:number;eventVersionIds:string[];entities:string[];
 chronology:{eventVersionId:string;observedAt:string;title:string}[];supportedFacts:SupportedFact[];
 previousState?:string;currentState:string;turningPoints:SupportedFact[];confidence:number;algorithmVersion:string;createdAt:string;
}
export interface IntelligenceReceipt {id:string;feedId:string;observationId:string;decision:'PROCESSED'|'STALE'|'WITHDRAWN';eventVersionIds:string[];storylineVersionIds:string[];computedAt:string}
export interface EventSupport {version:EventVersion;revisionIds:string[]}
