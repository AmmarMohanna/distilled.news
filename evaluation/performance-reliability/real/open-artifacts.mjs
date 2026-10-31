import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {unseal} from './artifact-crypto.mjs';
const envelope=readFileSync(process.argv[2]);if(envelope.length>90_000_000)throw Error('ARTIFACT_SIZE_LIMIT');
const data=JSON.parse(unseal(JSON.parse(envelope),process.env.CAMPAIGN_ARTIFACT_KEY));
const root=resolve('.local-reports','restored-campaign-'+Date.now());mkdirSync(root,{recursive:true,mode:0o700});
for(const file of data.files){if(!/^[a-z0-9]{8,24}\/[a-z0-9_.-]+$/i.test(file.path)||file.path.includes('..'))throw Error('ARTIFACT_PATH_INVALID');const path=resolve(root,file.path);if(existsSync(path))throw Error('ARTIFACT_COLLISION');mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,Buffer.from(file.body,'base64'),{mode:0o600});}
console.log('Private evidence restored under .local-reports; no credentials printed.');
