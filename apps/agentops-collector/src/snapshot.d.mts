export const SQL: {feed:string;request:string;run:string;edition:string;sources:string;jobs:string;operations:string};
export function collectSnapshot(db:D1Database,feedId:string,now:number):Promise<{values:Record<string,number>;work:{queries:number;rowsRead:number;sqlMs:number|null}}>;
