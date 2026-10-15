/** Classify internal failures without logging external text, SQL or payloads. */
export function intakeStorageCause(error:unknown){
 const message=String(error);
 return /too many subrequests|query limit/i.test(message)?'QUERY_LIMIT':
  /overloaded/i.test(message)?'OVERLOADED':
  /timeout|timed out/i.test(message)?'DATABASE_TIMEOUT':
  /constraint/i.test(message)?'DATABASE_CONSTRAINT':'INTAKE_STORAGE_FAILURE';
}
