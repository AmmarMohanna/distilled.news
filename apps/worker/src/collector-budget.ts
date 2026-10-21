import {collectorBudgetDay} from '@distilled/connectors';
import type {Env} from './types';
export async function collectorBudgetStatus(env:Pick<Env,'DB'|'SOURCE_DAILY_BUDGET_USD'|'SOURCE_BUDGET_TIME_ZONE'>){
 const timeZone=env.SOURCE_BUDGET_TIME_ZONE??'UTC',day=collectorBudgetDay(new Date(),timeZone);
 if(env.SOURCE_DAILY_BUDGET_USD===undefined)return {configured:false,day,timeZone};
 const limitUsd=Number(env.SOURCE_DAILY_BUDGET_USD);
 if(!Number.isFinite(limitUsd)||limitUsd<0)throw Error('INVALID_DAILY_BUDGET');
 const row=await env.DB.prepare('SELECT limit_usd,reserved_usd FROM connector_daily_provider_budgets WHERE day=?').bind(day).first<{limit_usd:number;reserved_usd:number}>();
 const reservedUsd=row?.reserved_usd??0;
 return {configured:true,day,timeZone,limitUsd,reservedUsd,remainingUsd:Math.max(0,limitUsd-reservedUsd),accounting:'conservative_maximum_charge_reservations'};
}
