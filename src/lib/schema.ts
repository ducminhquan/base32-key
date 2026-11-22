import { formatInput, validate } from './decode';
import { DecodeOptions } from './options';

/**
 * The parts of the Standard Schema v1 interface (https://standardschema.dev)
 * that {@link keySchema} implements.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown
    ) =>
      | { readonly value: Output; readonly issues?: undefined }
      | { readonly issues: ReadonlyArray<{ readonly message: string }> };
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

const REASONS = {
  INVALID_CHARACTER: 'a character that is not allowed',
  INVALID_LENGTH: 'the wrong length',
  CHECKSUM_MISMATCH: 'a typo',
} as const;

// cspell: disable
/**
 * A [Standard Schema](https://standardschema.dev) that accepts a valid key
 * and outputs it formatted (`formatInput`). Works with any library that
 * takes Standard Schemas, such as TanStack Form, tRPC or Hono, without an
 * extra dependency. Input is normalized like {@link validate}.
 *
 * ### Example
 * ```js
 * const schema = keySchema({ groups: 4 });
 * schema['~standard'].validate('222et 3zzgn')
 * // => { issues: [{ message: 'Enter all 4 groups of the key' }] }
 * ```
 */
// cspell: enable
export function keySchema(
  options: DecodeOptions = {}
): StandardSchemaV1<string, string> {
  const issue = (message: string) => ({ issues: [{ message }] });
  return {
    '~standard': {
      version: 1,
      vendor: 'base32-key',
      validate(value) {
        if (typeof value !== 'string') {
          return issue('Expected a string');
        }
        const { case: keyCase = 'upper', ...rest } = options;
        const resolvedCase =
          keyCase !== 'auto' ||
          validate(value, { ...options, case: 'upper' }).valid
            ? keyCase === 'lower'
              ? 'lower'
              : 'upper'
            : 'lower';
        const result = validate(value, options);
        if (result.valid) {
          return { value: formatInput(value, { ...rest, case: resolvedCase }) };
        }
        if (result.code === 'INVALID_PREFIX') {
          return issue(`The key must start with ${options.prefix}`);
        }
        if (options.groups !== undefined && result.code === 'INVALID_LENGTH') {
          const typed =
            formatInput(value, {
              ...rest,
              case: resolvedCase,
              groups: undefined,
            }).split('-').length - (options.prefix ? 1 : 0);
          if (typed < options.groups) {
            return issue(`Enter all ${options.groups} groups of the key`);
          }
          if (typed > options.groups) {
            return issue(`The key has more than ${options.groups} groups`);
          }
        }
        const groups = result.invalidGroups.map((i) => i + 1).join(', ');
        const where =
          result.invalidGroups.length === 1
            ? `Group ${groups} has`
            : `Groups ${groups} have`;
        return issue(
          `${where} ${REASONS[result.code as keyof typeof REASONS]}`
        );
      },
    },
  };
}
