import { describe, expect, test, vi } from 'vitest';

import { run, USAGE } from './run';

const cli = async (
  argv: string[],
  stdin?: string,
  files: Map<string, Uint8Array> = new Map()
) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, {
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    readStdin: async () => stdin,
    readFile: async (path) => {
      const data = files.get(path);
      if (!data) throw new Error(`ENOENT: ${path}`);
      return data;
    },
    writeFile: async (path, data) => {
      files.set(path, data);
    },
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

  test('--case and --groups', async () => {
    expect(
      (await cli(['decode', '--case', 'auto', 'nb99qj', '--ungrouped'])).out
    ).toEqual(['c0ffee']);
    expect((await cli(['encode', '--case', 'lower', 'c0ffee'])).out).toEqual([
      'aaan3-b99qw',
    ]);
    const missing = await cli(['validate', '--groups', '4', '222ET-3ZZGN']);
    expect(missing.code).toBe(1);
    expect(missing.out).toEqual([
      '222ET-3ZZGN: invalid (INVALID_LENGTH) in groups 3, 4',
    ]);
    expect((await cli(['decode', '--groups', '2', '222ET-3ZZGN'])).out).toEqual(
      ['c0ffee']
    );
    expect((await cli(['decode', '--upper-hex', '222ET-3ZZGN'])).out).toEqual([
      'C0FFEE',
    ]);
    for (const argv of [
      ['encode', '--case', 'auto', 'ff'],
      ['generate', '--case', 'auto'],
      ['decode', '--case', 'title', 'x'],
    ]) {
      expect((await cli(argv)).code).toBe(2);
    }
  });

  test('--json', async () => {
    expect(
      (await cli(['encode', '--json', 'c0ffee', 'xyz'])).out.map((l) =>
        JSON.parse(l)
      )
    ).toEqual([
      { input: 'c0ffee', key: '222ET-3ZZGN' },
      { input: 'xyz', error: 'Invalid hex string: "xyz"', code: 'INVALID_HEX' },
    ]);
    expect(
      JSON.parse((await cli(['decode', '--json', '222ET-3ZZGN'])).out[0])
    ).toEqual({ input: '222ET-3ZZGN', hex: 'c0ffee' });
    const result = await cli(
      ['validate', '--json'],
      '222ET-3ZZGN\n222ET-3ZZGX\n'
    );
    expect(result.code).toBe(1);
    expect(result.out.map((l) => JSON.parse(l))).toEqual([
      { input: '222ET-3ZZGN', valid: true, invalidGroups: [] },
      {
        input: '222ET-3ZZGX',
        valid: false,
        invalidGroups: [1],
        code: 'CHECKSUM_MISMATCH',
      },
    ]);
    expect(
      Object.keys(JSON.parse((await cli(['generate', '--json'])).out[0]))
    ).toEqual(['key']);
  });

  test('a non-library error in --json mode has no code', async () => {
    const result = await cli([
      'decode',
      '--json',
      '--ungrouped',
      '--groups',
      '2',
      'nb99qj',
    ]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out[0])).toEqual({
      input: 'nb99qj',
      error: 'The groups option requires grouped keys',
      code: null,
    });
  });

  test('--file round trip', async () => {
    const files = new Map([['in.bin', new Uint8Array([0, 0, 1, 255])]]);
    const encoded = await cli(['encode', '--file', 'in.bin'], undefined, files);
    expect(encoded.code).toBe(0);
    const [key] = encoded.out;
    const decoded = await cli(
      ['decode', '--file', 'out.bin', key],
      undefined,
      files
    );
    expect(decoded.out).toEqual(['4 bytes written to out.bin']);
    expect(files.get('out.bin')).toEqual(new Uint8Array([0, 0, 1, 255]));
    expect(
      JSON.parse(
        (await cli(['encode', '--json', '--file', 'in.bin'], undefined, files))
          .out[0]
      )
    ).toEqual({ file: 'in.bin', bytes: 4, key });
    expect(
      JSON.parse(
        (
          await cli(
            ['decode', '--json', '--file', 'o.bin', key],
            undefined,
            files
          )
        ).out[0]
      )
    ).toEqual({ input: key, file: 'o.bin', bytes: 4 });
    expect(
      (await cli(['decode', '--file', 'o.bin', key, key], undefined, files))
        .code
    ).toBe(2);
    expect(
      (
        await cli(
          ['decode', '--file', 'o.bin', '222ET-3ZZGN'],
          undefined,
          files
        )
      ).code
    ).toBe(1);
    expect(
      (await cli(['encode', '--file', 'missing.bin'], undefined, files)).code
    ).toBe(2);
  });

  test('completion', async () => {
    for (const shell of ['bash', 'zsh', 'fish']) {
      const result = await cli(['completion', shell]);
      expect(result.code).toBe(0);
      expect(result.out[0]).toContain('base32-key');
      expect(result.out[0]).toContain('validate');
    }
    expect((await cli(['completion'])).code).toBe(2);
    expect((await cli(['completion', 'powershell'])).code).toBe(2);
  });
});
