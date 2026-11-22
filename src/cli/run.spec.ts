import { describe, expect, test, vi } from 'vitest';

import { run, USAGE } from './run';

const cli = async (argv: string[], stdin?: string) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, {
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    readStdin: async () => stdin,
    version: '9.9.9',
  });
  return { code, out, err };
};

// cspell: disable
describe('base32-key CLI', () => {
  test('encode and decode', async () => {
    expect(await cli(['encode', 'c0ffee', '0xff'])).toEqual({
      code: 0,
      out: ['222ET-3ZZGN', '229ZN'],
      err: [],
    });
    expect(
      (await cli(['encode', '--lower', '--ungrouped', 'c0ffee'])).out
    ).toEqual(['nb99qj']);
    expect((await cli(['encode', '--unchecked', 'c0ffee'])).out).toEqual([
      '222E-3ZZG',
    ]);
    expect((await cli(['decode', '222ET-3ZZGN'])).out).toEqual(['c0ffee']);
    expect((await cli(['decode', '--normalize', '222et 3zzgn'])).out).toEqual([
      'c0ffee',
    ]);
  });

  test('reads values from stdin', async () => {
    expect(await cli(['encode'], 'c0ffee\r\n\n  ff  \n')).toEqual({
      code: 0,
      out: ['222ET-3ZZGN', '229ZN'],
      err: [],
    });
  });

  test('bad values exit with 1 and keep going', async () => {
    const result = await cli(['decode', '222ET-3ZZGX', '222ET-3ZZGN']);
    expect(result.code).toBe(1);
    expect(result.out).toEqual(['c0ffee']);
    expect(result.err).toEqual([
      '222ET-3ZZGX: Invalid key: group 2 has a check digit that does not match',
    ]);
  });

  test('validate', async () => {
    expect(await cli(['validate', '222et-3zzgn'])).toEqual({
      code: 0,
      out: ['222et-3zzgn: valid'],
      err: [],
    });
    const strict = await cli(['validate', '--strict', '222et-3zzgn']);
    expect(strict.code).toBe(1);
    expect(strict.out).toEqual([
      '222et-3zzgn: invalid (INVALID_CHARACTER) in groups 1, 2',
    ]);
    expect((await cli(['validate', '222ET-3ZZGX'])).out).toEqual([
      '222ET-3ZZGX: invalid (CHECKSUM_MISMATCH) in group 2',
    ]);
  });

  test('generate', async () => {
    const result = await cli(['generate', '--count', '3', '--groups', '2']);
    expect(result.code).toBe(0);
    expect(result.out).toHaveLength(3);
    for (const key of result.out) {
      expect(key).toMatch(/^[2-9A-Z]{5}-[2-9A-Z]{5}$/);
    }
    expect((await cli(['generate'])).out[0]).toMatch(/^([2-9A-Z]{5}-){3}/);
  });

  test('help and version', async () => {
    expect((await cli(['--help'])).out).toEqual([USAGE]);
    expect((await cli(['-h', 'encode'])).out).toEqual([USAGE]);
    expect((await cli(['-v'])).out).toEqual(['9.9.9']);
  });

  test('usage errors exit with 2', async () => {
    for (const argv of [
      [],
      ['frobnicate'],
      ['encode'],
      ['encode', '--bogus', 'ff'],
      ['generate', '--count', '0'],
      ['generate', '--groups', 'two'],
    ]) {
      const result = await cli(argv);
      expect(result.code).toBe(2);
      expect(result.err[0]).toContain(USAGE);
    }
    expect((await cli([])).err[0]).toMatch(/^Missing command/);
    expect((await cli(['frobnicate'])).err[0]).toMatch(
      /^Unknown command: frobnicate/
    );
    expect((await cli(['encode'])).err[0]).toMatch(/^No values given/);
  });

  test('library errors outside a value exit with 1', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      const result = await cli(['generate']);
      expect(result.code).toBe(1);
      expect(result.err[0]).toMatch(/random/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
