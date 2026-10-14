/** Queue operations are asynchronous. Leave persistence margin after each call;
 * yield between calls before the consumer's external execution boundary. */
export const ASYNC_MODEL_CALL_MS=180000;
export const ASYNC_JUDGMENT_CALL_MS=90000;
export const ASYNC_OPERATION_LEASE_MS=240000;
export const ASYNC_PROCESSING_SLICE_MS=360000;
