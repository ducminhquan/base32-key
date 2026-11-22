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

const cli = (...args) =>
  execFileSync(process.execPath, ['dist/cli.js', ...args], {
    encoding: 'utf8',
  });
assert.equal(cli('encode', 'c0ffee'), '222ET-3ZZGN\n');
assert.equal(cli('--version'), `${require('../package.json').version}\n`);

console.log(`Smoke test passed on Node ${process.version}`);
