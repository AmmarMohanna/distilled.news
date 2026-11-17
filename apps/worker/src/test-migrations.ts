import { unstable_splitSqlQuery } from 'wrangler';

/** Use the same SQLite statement boundaries as Wrangler migrations, including triggers. */
export function migrationStatements(sql: string): string[] {
  return unstable_splitSqlQuery(sql).filter(statement => statement.replace(/--[^\r\n]*/g, '').trim());
}
export async function applyTestMigration(db: Pick<D1Database, 'prepare' | 'batch'>, sql: string): Promise<void> {
  const statements = migrationStatements(sql);
  if (statements.length) await db.batch(statements.map(statement => db.prepare(statement)));
}
