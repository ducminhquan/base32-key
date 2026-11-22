import { parseArgs } from 'node:util';

import {
  Base32KeyError,
  DecodeOptions,
  EncodeOptions,
  fromHexString,
  generateKey,
  toHexString,
  validate,
} from '../index';

export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  /** Reads all of standard input, or returns `undefined` for a terminal. */
  readonly readStdin: () => Promise<string | undefined>;
  readonly version: string;
}

export const USAGE = `Usage: base32-key <command> [options] [values...]

Commands:
  encode <hex...>       Encode hex strings as keys
  decode <key...>       Decode keys to hex strings
  validate <key...>     Check keys; exit code 1 if any is invalid
  generate              Generate random keys

Values are read from standard input, one per line, when none are given.

Options:
  --lower               Use the lowercase alphabet
  --ungrouped           Keys are not split into groups
  --unchecked           Keys have no check digits
  --normalize           decode: ignore whitespace, case and hyphen placement
  --strict              validate: check the key exactly as typed
  --count <n>           generate: number of keys (default 1)
  --groups <n>          generate: groups per key (default 4)
  -h, --help            Show this help
  -v, --version         Show the version`;

function positiveInteger(
  name: string,
  value: string | undefined,
  fallback: number
) {
  if (value === undefined) {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new UsageError(`--${name} must be a positive integer`);
  }
  return number;
}

class UsageError extends Error {}

async function readValues(positionals: string[], io: CliIo) {
  if (positionals.length > 0) {
    return positionals;
  }
  const input = await io.readStdin();
  if (input === undefined) {
    throw new UsageError('No values given');
  }
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Runs the CLI and returns the process exit code. */
export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        lower: { type: 'boolean' },
        ungrouped: { type: 'boolean' },
        unchecked: { type: 'boolean' },
        normalize: { type: 'boolean' },
        strict: { type: 'boolean' },
        count: { type: 'string' },
        groups: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
    if (values.help) {
      io.stdout(USAGE);
      return 0;
    }
    if (values.version) {
      io.stdout(io.version);
      return 0;
    }
    const [command, ...rest] = positionals;
    const options: EncodeOptions = {
      grouped: !values.ungrouped,
      checked: !values.unchecked,
      case: values.lower ? 'lower' : 'upper',
    };
    let failed = false;
    const each = async (fn: (value: string) => string) => {
      for (const value of await readValues(rest, io)) {
        try {
          io.stdout(fn(value));
        } catch (error) {
          failed = true;
          io.stderr(`${value}: ${(error as Error).message}`);
        }
      }
    };

    switch (command) {
      case 'encode':
        await each((hex) => fromHexString(hex, options));
        break;
      case 'decode': {
        const decodeOptions: DecodeOptions = {
          ...options,
          normalize: values.normalize === true,
        };
        await each((key) => toHexString(key, decodeOptions));
        break;
      }
      case 'validate':
        await each((key) => {
          const result = validate(key, {
            ...options,
            normalize: !values.strict,
          });
          if (result.valid) {
            return `${key}: valid`;
          }
          failed = true;
          const { invalidGroups } = result;
          const groups = invalidGroups.map((i) => i + 1).join(', ');
          const noun = invalidGroups.length === 1 ? 'group' : 'groups';
          return `${key}: invalid (${result.code}) in ${noun} ${groups}`;
        });
        break;
      case 'generate': {
        const count = positiveInteger('count', values.count, 1);
        const groups = positiveInteger('groups', values.groups, 4);
        for (let i = 0; i < count; ++i) {
          io.stdout(generateKey({ ...options, groups }));
        }
        break;
      }
      default:
        throw new UsageError(
          command === undefined
            ? 'Missing command'
            : `Unknown command: ${command}`
        );
    }
    return failed ? 1 : 0;
  } catch (error) {
    if (error instanceof Base32KeyError) {
      io.stderr(error.message);
      return 1;
    }
    io.stderr(`${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }
}
