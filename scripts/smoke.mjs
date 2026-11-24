// Checks the built package the way users load it: require(), import and the
// CLI. Runs on the oldest supported Node version in CI.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const cjs = require('../dist/index.cjs');
const esm = await import('../dist/index.js');

for (const [name, lib] of Object.entries({ cjs, esm })) {
  assert.equal(lib.fromHexString('c0ffee'), '222ET-3ZZGN', name);
  assert.equal(lib.toHexString('222ET-3ZZGN'), 'c0ffee', name);
  assert.deepEqual(
    lib.toBytes(lib.fromBytes(new Uint8Array([0, 1]), { withLength: true }), {
      withLength: true,
    }),
    new Uint8Array([0, 1]),
    name
  );
  assert.match(lib.generateKey(), /^([2-9A-Z]{5}-){3}[2-9A-Z]{5}$/, name);
  assert.ok(new lib.Base32KeyError('INVALID_HEX', 'x') instanceof Error, name);
}

for (const [name, lib] of Object.entries({
  cjs: require('../dist/template.cjs'),
  esm: await import('../dist/template.js'),
})) {
  const voucher = lib.defineKeyTemplate(lib.presets.voucher());
  const values = {
    campaign: 1,
    expires: '2099-01-01',
    amount: 1000,
    serial: 2,
  };
  const key = await voucher.sign(values, 's3cret');
  assert.deepEqual(await voucher.verify(key, 's3cret'), values, name);
}
// One error class across the ES module entry points.
const templateEsm = await import('../dist/template.js');
assert.equal(templateEsm.Base32KeyError, esm.Base32KeyError);

const vectors = require('base32-key/test-vectors.json');
assert.equal(
  cjs.fromHexString(vectors.valid[0].hex),
  vectors.valid[0].upper.grouped
);

const cli = (...args) =>
  execFileSync(process.execPath, ['dist/cli.js', ...args], {
    encoding: 'utf8',
  });
assert.equal(cli('encode', 'c0ffee'), '222ET-3ZZGN\n');
assert.match(
  execFileSync(
    process.execPath,
    [
      'dist/cli.js',
      'sign',
      '--preset',
      'member',
      '--set',
      'member=1',
      '--set',
      'tier=gold',
    ],
    { encoding: 'utf8', env: { ...process.env, BASE32_KEY_SECRET: 's3cret' } }
  ),
  /^([2-9A-Z]{5}-){4}[2-9A-Z]{5}\n$/
);
assert.equal(cli('--version'), `${require('../package.json').version}\n`);

console.log(`Smoke test passed on Node ${process.version}`);
