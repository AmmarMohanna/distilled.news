import { readFile, appendFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
const path = new URL('../apps/worker/.dev.vars', import.meta.url);
const current = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
if (/^VAPID_(PUBLIC|PRIVATE)_KEY=/m.test(current)) {
  console.log('Push keys already exist. Existing keys were preserved.');
} else {
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = Buffer.from(await webcrypto.subtle.exportKey('raw', keys.publicKey)).toString('base64url');
  const privateKey = (await webcrypto.subtle.exportKey('jwk', keys.privateKey)).d;
  await appendFile(path, `\nVAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n${/^VAPID_SUBJECT=/m.test(current) ? '' : 'VAPID_SUBJECT=https://distilled.news\n'}`);
  console.log('Push keys saved privately in apps/worker/.dev.vars. Restart the local server.');
}
