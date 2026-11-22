// Benchmarks the built package: `npm run bench` (builds first).
import { Bench } from 'tinybench';

import {
  fromBytes,
  fromHexString,
  toBytes,
  toHexString,
  validate,
} from '../dist/index.js';

const short = 'c0ffee12345abcdef0123';
const long = 'f8956c40a3a2d978dbc3'.repeat(50);
const shortKey = fromHexString(short);
const longKey = fromHexString(long);
const bytes = new Uint8Array(1024).map((_, i) => i);
const bytesKey = fromBytes(bytes, { withLength: true });

const bench = new Bench({ time: 500 });
bench
  .add('80-bit key: fromHexString', () => fromHexString(short))
  .add('80-bit key: toHexString', () => toHexString(shortKey))
  .add('80-bit key: validate, normalized', () =>
    validate(shortKey.toLowerCase())
  )
  .add('4000-bit key: fromHexString', () => fromHexString(long))
  .add('4000-bit key: toHexString', () => toHexString(longKey))
  .add('1 KiB: fromBytes', () => fromBytes(bytes, { withLength: true }))
  .add('1 KiB: toBytes', () => toBytes(bytesKey, { withLength: true }));

await bench.run();
console.table(bench.table());
