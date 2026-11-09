import {afterEach,expect,it,vi} from 'vitest';
import {apiError,apiErrorCopy,ApiError,toUiError,renderApiError} from './api-errors';
import {login} from './api';
afterEach(()=>{localStorage.clear();vi.unstubAllGlobals();});
// These are actual business-error strings returned by the Worker auth routes.
it.each([
 ['verify your email before logging in','AUTH_EMAIL_VERIFICATION_REQUIRED'],
 ['invalid email or password','AUTH_INVALID_CREDENTIALS'],['verification failed','AUTH_VERIFICATION_FAILED'],
 ['invalid or expired token','AUTH_TOKEN_INVALID'],['invalid current password','AUTH_INVALID_CURRENT_PASSWORD'],
 ['email is already registered','AUTH_EMAIL_REGISTERED'],['username is already taken','AUTH_USERNAME_TAKEN'],
 ['too many attempts','AUTH_TOO_MANY_ATTEMPTS'],['invalid setup token','AUTH_INVALID_SETUP_TOKEN'],
 ['setup is already complete','AUTH_SETUP_COMPLETE'],['could not send verification email','AUTH_EMAIL_SEND_FAILED'],
 ['unauthorized','AUTH_SIGN_IN_REQUIRED']
])('maps supported auth rejection %s to canonical %s', (detail,id)=>{
 const error=apiError(detail,new Response(null,{status:403}));expect(error).toBeInstanceOf(ApiError);expect(error.id).toBe(id);
 expect(error.uiMessage).toEqual({id,details:{status:403}});expect(error.message).toBe(id);
 for(const language of ['en','fr','ar'] as const){const text=renderApiError(error.uiMessage,language);expect(text).toBeTruthy();expect(text).not.toBe(id);if(language==='ar')expect(text).toMatch(/[\u0600-\u06ff]/);}
});
it.each([undefined,null,{},['invalid email or password'],'constructor','__proto__','private server trace','verify your email before logging in <script>'])('safely handles unknown or unsuitable detail %j',detail=>{
 const error=apiError(detail);expect(error.id).toBe('REQUEST_FAILED');expect(error.uiMessage).toEqual({id:'REQUEST_FAILED',details:{}});expect(error.cause).toBeUndefined();
});
it('retains only bounded safe details and never trusts arbitrary server fields',()=>{
 expect(apiError('too many attempts',new Response(null,{status:429,headers:{'retry-after':'120'}})).uiMessage).toEqual({id:'AUTH_TOO_MANY_ATTEMPTS',details:{status:429,retryAfterSeconds:120}});
 expect(apiError('too many attempts',new Response(null,{status:429,headers:{'retry-after':'99999999999'}})).uiMessage.details).toEqual({status:429});
 expect(new ApiError('REQUEST_FAILED',{status:-1,retryAfterSeconds:-1}).uiMessage.details).toEqual({});
 expect(Object.isFrozen(toUiError(new ApiError('REQUEST_FAILED')))).toBe(true);
});
it('preserves the actionable email-verification login instruction in the real API path without exposing server text',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'verify your email before logging in'},{status:403})));
 for(const language of ['en','ar','fr']){localStorage.setItem('dn_language',language);await expect(login('fixture@example.invalid','fixture-only')).rejects.toMatchObject({id:'AUTH_EMAIL_VERIFICATION_REQUIRED',uiMessage:{details:{status:403}}});}
});
it('provides every canonical message in all three supported locales',()=>{
 for(const [id,copy] of Object.entries(apiErrorCopy)){expect(copy).toHaveLength(3);expect(copy[0],id).toMatch(/[A-Za-z]/);expect(copy[1],id).not.toMatch(/\?{2}|\uFFFD/);expect(copy[2],id).toMatch(/[\u0600-\u06ff]/);}
});
