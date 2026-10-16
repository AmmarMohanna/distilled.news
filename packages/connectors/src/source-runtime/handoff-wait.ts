/** Local runtime admission, not a provider failure or a changed wire contract.
 * Retrying preserves the exact saved batch/run and any paid operation identity. */
export class SourceHandoffWait extends Error {
 readonly code='INTAKE_BUSY';
 constructor(){super('INTAKE_BUSY')}
}
