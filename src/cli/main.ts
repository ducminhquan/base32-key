#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

import { version } from '../../package.json';
import { run } from './run';

run(process.argv.slice(2), {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
  readStdin: async () =>
    process.stdin.isTTY ? undefined : readFileSync(0, 'utf8'),
  readFile: async (path) => new Uint8Array(await readFile(path)),
  writeFile: (path, data) => writeFile(path, data),
  version,
}).then((code) => {
  process.exitCode = code;
});
