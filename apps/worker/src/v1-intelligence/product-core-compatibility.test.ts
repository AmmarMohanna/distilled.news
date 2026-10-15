import {beforeAll,afterAll,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {synchronizeV1ProductSource} from './product';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeAll(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));});
afterAll(async()=>ctx?.dispose());
it('unbound core-only sources synchronize without requiring optional product tables',async()=>{
 expect(await ctx.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sources'").first()).toBeNull();
 await expect(synchronizeV1ProductSource(ctx.db,'feed-source-1','2026-10-03T12:00:00Z')).resolves.toBeUndefined();
 expect((await new V1IntakeStore(ctx.db).snapshot('feed-source-1')).scope.enabled).toBe(true);
});
