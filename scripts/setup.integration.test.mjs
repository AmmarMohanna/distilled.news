import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('self-host setup retains image configuration and existing VAPID identity across repeat runs', () => {
  const temporaryRoot = resolve(tmpdir());
  const dir = mkdtempSync(join(temporaryRoot, 'distilled-setup-integration-'));
  assert.ok(resolve(dir).startsWith(temporaryRoot + sep));
  try {
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'apps/worker'), { recursive: true });
    copyFileSync(fileURLToPath(new URL('./setup.mjs', import.meta.url)), join(dir, 'scripts/setup.mjs'));
    writeFileSync(join(dir, '.env.example'), '');
    writeFileSync(join(dir, '.env'), [
      'CLOUDFLARE_ACCOUNT_ID=00000000000000000000000000000000',
      'CLOUDFLARE_IMAGE_ACCOUNT_ID=fixture-image-account',
      'CLOUDFLARE_IMAGE_API_TOKEN=fixture-image-secret',
      'DISTILLED_D1_DATABASE_ID=fixture-database',
      'PUBLIC_API_BASE_URL=https://fixture.example.invalid',
      'PUBLIC_WEB_BASE_URL=https://fixture.example.invalid'
    ].join('\n') + '\n');
    const run = () => {
      const result = spawnSync(process.execPath, [join(dir, 'scripts/setup.mjs'), '--write-wrangler'], {
        cwd: dir, encoding: 'utf8', env: { ...process.env, NPM_CONFIG_OFFLINE: 'true' }, timeout: 30_000
      });
      assert.equal(result.status, 0, result.stderr);
    };
    run();
    const config = readFileSync(join(dir, 'apps/worker/wrangler.toml'), 'utf8');
    assert.match(config, /CLOUDFLARE_IMAGE_ACCOUNT_ID = "fixture-image-account"/);
    assert.ok(!config.includes('fixture-image-secret'));
    const first = readFileSync(join(dir, 'apps/worker/.dev.vars'), 'utf8');
    assert.match(first, /CLOUDFLARE_IMAGE_API_TOKEN=fixture-image-secret/);
    const keys = first.split('\n').filter(line => /^VAPID_/.test(line));
    assert.equal(keys.length, 3);
    const env = readFileSync(join(dir, '.env'), 'utf8').split('\n').filter(line => !/^VAPID_/.test(line)).join('\n');
    writeFileSync(join(dir, '.env'), env);
    run();
    const second = readFileSync(join(dir, 'apps/worker/.dev.vars'), 'utf8').split('\n').filter(line => /^VAPID_/.test(line));
    assert.deepEqual(second, keys);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
