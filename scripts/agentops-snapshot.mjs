import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {projectSnapshots,prometheus} from '../ops/observability/snapshot-projector.mjs';
export {projectSnapshots,prometheus} from '../ops/observability/snapshot-projector.mjs';
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const files=process.argv.slice(2);if(!files.length)throw Error('Provide complete private trace JSON files; no network is performed');
 for(const f of files)if(readFileSync(f).byteLength>20_000_000)throw Error('INPUT_TOO_LARGE');
 const snapshot=projectSnapshots(files.map(f=>JSON.parse(readFileSync(f,'utf8'))));process.stdout.write(prometheus(snapshot));
}
