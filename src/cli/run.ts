import { parseArgs } from 'node:util';

import {
  Base32KeyError,
  DecodeOptions,
  EncodeOptions,
  fromBytes,
  fromHexString,
  generateKey,
  KeyCase,
  toBytes,
  toHexString,
  validate,
} from '../index';

export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  /** Reads all of standard input, or returns `undefined` for a terminal. */
  readonly readStdin: () => Promise<string | undefined>;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly writeFile: (path: string, data: Uint8Array) => Promise<void>;
  readonly version: string;
}

const COMMANDS = ['encode', 'decode', 'validate', 'generate', 'completion'];

export const USAGE = `Usage: base32-key <command> [options] [values...]

Commands:
  encode <hex...>       Encode hex strings as keys
  decode <key...>       Decode keys to hex strings
  validate <key...>     Check keys; exit code 1 if any is invalid
  generate              Generate random keys
  completion <shell>    Print a completion script for bash, zsh or fish

Values are read from standard input, one per line, when none are given.

Options:
  --case <case>         Alphabet: upper (default), lower, or auto when
                        decoding (tries both)
  --lower               Same as --case lower
  --ungrouped           Keys are not split into groups
  --unchecked           Keys have no check digits
  --groups <n>          generate: groups per key (default 4)
                        decode, validate: the key must have exactly n groups
  --normalize           decode: ignore whitespace, case and hyphen placement
  --strict              validate: check the key exactly as typed
  --upper-hex           decode: print uppercase hex
  --file <path>         encode: encode the bytes of a file, keeping its length
                        decode: write the bytes of one such key to a file
  --count <n>           generate: number of keys (default 1)
  --json                Print one JSON object per value
  -h, --help            Show this help
  -v, --version         Show the version`;

const OPTIONS = {
  case: { type: 'string' },
  lower: { type: 'boolean' },
  ungrouped: { type: 'boolean' },
  unchecked: { type: 'boolean' },
  groups: { type: 'string' },
  normalize: { type: 'boolean' },
  strict: { type: 'boolean' },
  'upper-hex': { type: 'boolean' },
  file: { type: 'string' },
  count: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

const FLAGS = Object.keys(OPTIONS).map((name) => `--${name}`);

// cspell: disable
/** Shell completion scripts, printed by `base32-key completion <shell>`. */
export const COMPLETIONS: { readonly [shell: string]: string } = {
  bash: `_base32_key() {
  local cur=\${COMP_WORDS[COMP_CWORD]}
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=($(compgen -W "${COMMANDS.join(' ')}" -- "$cur"))
  else
    COMPREPLY=($(compgen -W "${FLAGS.join(' ')}" -- "$cur"))
  fi
}
complete -o default -F _base32_key base32-key`,
  zsh: '', // filled below: zsh runs the bash script through bashcompinit
  fish: [
    `complete -c base32-key -f -n __fish_use_subcommand -a "${COMMANDS.join(' ')}"`,
    ...Object.keys(OPTIONS).map((name) => `complete -c base32-key -l ${name}`),
  ].join('\n'),
};
(COMPLETIONS as { [shell: string]: string }).zsh =
  `autoload -U +X bashcompinit && bashcompinit\n${COMPLETIONS.bash}`;

// cspell: enable

class UsageError extends Error {}

function positiveInteger(name: string, value: string): number;
function positiveInteger(
  name: string,
  value: string | undefined
): number | undefined;
function positiveInteger(name: string, value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new UsageError(`--${name} must be a positive integer`);
  }
  return number;
}

function resolveCase(value: string | undefined, lower: boolean | undefined) {
  const keyCase = value ?? (lower ? 'lower' : 'upper');
  if (!['upper', 'lower', 'auto'].includes(keyCase)) {
    throw new UsageError(`--case must be upper, lower or auto`);
  }
  return keyCase as KeyCase | 'auto';
}

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
      options: OPTIONS,
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
    const keyCase = resolveCase(values.case, values.lower);
    const groups = positiveInteger('groups', values.groups);
    const decodeOptions: DecodeOptions = {
      grouped: !values.ungrouped,
      checked: !values.unchecked,
      case: keyCase,
      groups,
    };
    const encodeOptions = (): EncodeOptions => {
      if (keyCase === 'auto') {
        throw new UsageError('--case auto only applies when decoding');
      }
      return {
        grouped: !values.ungrouped,
        checked: !values.unchecked,
        case: keyCase,
      };
    };
    const json = values.json === true;
    const print = (text: string, data: object) =>
      io.stdout(json ? JSON.stringify(data) : text);
    let failed = false;
    const each = async (
      fn: (value: string) => { text: string; data: object }
    ) => {
      for (const value of await readValues(rest, io)) {
        try {
          const { text, data } = fn(value);
          print(text, { input: value, ...data });
        } catch (error) {
          failed = true;
          const { message } = error as Error;
          if (json) {
            const code = error instanceof Base32KeyError ? error.code : null;
            io.stdout(JSON.stringify({ input: value, error: message, code }));
          } else {
            io.stderr(`${value}: ${message}`);
          }
        }
      }
    };

    switch (command) {
      case 'encode': {
        const options = encodeOptions();
        if (values.file !== undefined) {
          const bytes = await io.readFile(values.file);
          const key = fromBytes(bytes, { ...options, withLength: true });
          print(key, { file: values.file, bytes: bytes.length, key });
          break;
        }
        await each((hex) => {
          const key = fromHexString(hex, options);
          return { text: key, data: { key } };
        });
        break;
      }
      case 'decode': {
        const options = { ...decodeOptions, normalize: values.normalize };
        if (values.file !== undefined) {
          const [key, ...extra] = await readValues(rest, io);
          if (extra.length > 0) {
            throw new UsageError('--file takes exactly one key');
          }
          const bytes = toBytes(key, { ...options, withLength: true });
          await io.writeFile(values.file, bytes);
          print(`${bytes.length} bytes written to ${values.file}`, {
            input: key,
            file: values.file,
            bytes: bytes.length,
          });
          break;
        }
        await each((key) => {
          const hex = toHexString(key, options);
          const out = values['upper-hex'] ? hex.toUpperCase() : hex;
          return { text: out, data: { hex: out } };
        });
        break;
      }
      case 'validate':
        await each((key) => {
          const result = validate(key, {
            ...decodeOptions,
            normalize: !values.strict,
          });
          if (result.valid) {
            return { text: `${key}: valid`, data: result };
          }
          failed = true;
          const { invalidGroups } = result;
          const where = invalidGroups.map((i) => i + 1).join(', ');
          const noun = invalidGroups.length === 1 ? 'group' : 'groups';
          return {
            text: `${key}: invalid (${result.code}) in ${noun} ${where}`,
            data: result,
          };
        });
        break;
      case 'generate': {
        const options = encodeOptions();
        const count = positiveInteger('count', values.count ?? '1');
        for (let i = 0; i < count; ++i) {
          const key = generateKey({ ...options, groups: groups ?? 4 });
          print(key, { key });
        }
        break;
      }
      case 'completion': {
        const script = COMPLETIONS[rest[0]];
        if (rest.length !== 1 || script === undefined) {
          throw new UsageError('Usage: base32-key completion <bash|zsh|fish>');
        }
        io.stdout(script);
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
