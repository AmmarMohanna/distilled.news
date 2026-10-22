import {it,expect} from 'vitest';
import {productPublicationState} from './product-feeds';
it.each(['ACCOUNT_AUTHORIZATION_REQUIRED','ACCOUNT_RECOVERY_SCOPE_DENIED','ACCOUNT_RESOURCE_WAIT'])('surfaces %s as blocked instead of active preparation',async reason=>{
 const env:any={DB:{prepare:(sql:string)=>({bind:()=>({first:async()=>sql.includes("correction_obligations")?null:sql.includes("MODEL_SETUP_REQUIRED")?null:{id:'window',state:'PENDING',reason,coverage:'COMPLETE'}})})}};
 expect(await productPublicationState(env,'feed')).toBe('service_blocked');
});
