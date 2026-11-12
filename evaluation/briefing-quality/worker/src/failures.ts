/** Diagnose operational failures without logging SQL, source text or credentials. */
export function errorCode(error:unknown){return error instanceof Error&&/^[A-Z][A-Z0-9_]*$/.test(error.message)?error.message:'EVALUATION_FAILURE'}
function messages(error:unknown):string[]{return error instanceof Error?[error.message,...(error.cause instanceof Error?[error.cause.message]:[])]:[]}
export function failureDetails(error:unknown){const cause=error instanceof Error?error.cause:undefined;return {code:errorCode(error),type:error instanceof Error?'Error':'non_error',causeType:cause instanceof Error?'Error':null,providerCode:messages(cause??error).some(message=>/\b7429\b/.test(message))?'7429':null}}
/** Wrap only SOURCE_DB SELECT boundaries; never classify paid transport errors here. */
export async function sourceRead<T>(read:()=>Promise<T>):Promise<T>{try{return await read()}catch(error){if(messages(error).some(message=>/\bD1_ERROR\b/.test(message)&&(/\b7429\b/.test(message)||/database reset because its code was updated/i.test(message))))throw new Error('SOURCE_DB_TRANSIENT_FAILURE',{cause:error});throw error}}
