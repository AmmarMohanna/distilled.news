import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';

test('CI mirror setup replaces blocked Ubuntu endpoints, preserves other repositories, and is idempotent',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'distilled-ci-apt-'));
 try{
  await mkdir(join(directory,'sources.list.d'));
  const ubuntu=join(directory,'sources.list.d','ubuntu.sources');
  await writeFile(ubuntu,'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates noble-security\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n');
  await writeFile(join(directory,'apt-mirrors.txt'),'http://azure.archive.ubuntu.com/ubuntu/\nhttps://archive.ubuntu.com/ubuntu/\n');
  const thirdParty=join(directory,'sources.list.d','microsoft.list'),thirdPartyText='deb https://packages.microsoft.com/ubuntu/24.04/prod noble main\n';await writeFile(thirdParty,thirdPartyText);
  const run=()=>spawnSync(process.platform==='win32'?'python':'python3',['scripts/configure-ci-apt.py','--apt-dir',directory],{encoding:'utf8',env:{...process.env,GITHUB_ACTIONS:'false'}});
  let result=run();assert.equal(result.status,0,result.stderr);
  const configured=await readFile(ubuntu,'utf8');assert.match(configured,/URIs: https:\/\/archive\.ubuntu\.com\/ubuntu/);assert.match(configured,/Suites: noble noble-updates noble-security/);assert.match(configured,/Signed-By:/);
  assert.doesNotMatch(await readFile(join(directory,'apt-mirrors.txt'),'utf8'),/azure|http:\/\//);
  assert.equal(await readFile(thirdParty,'utf8'),thirdPartyText);
  assert.match(await readFile(join(directory,'apt.conf.d','99distilled-ci-network'),'utf8'),/Timeout "30"/);
  result=run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/0 files updated/);assert.equal(await readFile(ubuntu,'utf8'),configured);
 }finally{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true});}
});

test('system APT configuration is refused outside a GitHub Actions runner',()=>{
 const result=spawnSync(process.platform==='win32'?'python':'python3',['scripts/configure-ci-apt.py'],{encoding:'utf8',env:{...process.env,GITHUB_ACTIONS:'false'}});
 assert.notEqual(result.status,0);assert.match(result.stderr,/restricted to GitHub Actions/);
});
