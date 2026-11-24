import {
  defineKeyTemplate,
  KeyTemplate,
  KeyTemplateDefinition,
  presets,
  TemplateValues,
} from '../lib/template';

/** Name of the environment variable that holds the signing secret. */
export const SECRET_ENV = 'BASE32_KEY_SECRET';

export class TemplateUsageError extends Error {}

export interface TemplateArgs {
  readonly template?: string;
  readonly preset?: string;
  readonly prefix?: string;
}

/** Loads `--template file.json` or `--preset name`, with `--prefix`. */
export async function loadTemplate(
  args: TemplateArgs,
  readFile: (path: string) => Promise<Uint8Array>
): Promise<KeyTemplate> {
  let definition: KeyTemplateDefinition;
  if (args.template !== undefined && args.preset !== undefined) {
    throw new TemplateUsageError('Use --template or --preset, not both');
  }
  if (args.template !== undefined) {
    const text = new TextDecoder().decode(await readFile(args.template));
    definition = JSON.parse(text) as KeyTemplateDefinition;
  } else if (args.preset !== undefined) {
    const preset = presets[args.preset as keyof typeof presets];
    if (preset === undefined) {
      throw new TemplateUsageError(
        `--preset must be ${Object.keys(presets).join(', ')}`
      );
    }
    definition = preset();
  } else {
    throw new TemplateUsageError('sign and verify need --template or --preset');
  }
  if (args.prefix !== undefined) {
    definition = { ...definition, prefix: args.prefix };
  }
  return defineKeyTemplate(definition);
}

export function readSecret(
  env: Readonly<Record<string, string | undefined>> = {}
) {
  const secret = env[SECRET_ENV];
  if (!secret) {
    throw new TemplateUsageError(
      `Set the signing secret in the ${SECRET_ENV} environment variable`
    );
  }
  return secret;
}

/** Turns `--set name=value` into typed values for the template's fields. */
export function parseValues(
  template: KeyTemplate,
  assignments: readonly string[]
): Record<string, number | string | boolean> {
  const values: Record<string, number | string | boolean> = {};
  for (const assignment of assignments) {
    const eq = assignment.indexOf('=');
    if (eq < 1) {
      throw new TemplateUsageError(`--set takes name=value, got ${assignment}`);
    }
    const name = assignment.slice(0, eq);
    const raw = assignment.slice(eq + 1);
    const field = template.definition.fields.find((f) => f.name === name);
    if (field === undefined) {
      throw new TemplateUsageError(`Unknown field ${name}`);
    }
    values[name] =
      field.type === 'uint'
        ? Number(raw)
        : field.type === 'bool'
          ? raw === 'true'
            ? true
            : raw === 'false'
              ? false
              : raw
          : raw;
  }
  return values;
}

/** Quotes a CSV cell when needed. */
export function csvCell(value: unknown): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The values of each key to sign: `count` keys with `serialField` counting
 * up from `serialFrom`, or one key.
 */
export function* batch(
  values: TemplateValues,
  count: number,
  serialField: string,
  serialFrom: number | undefined
): Generator<TemplateValues> {
  if (count > 1 && serialFrom === undefined) {
    throw new TemplateUsageError(
      '--count needs --serial-from, so that every key is different'
    );
  }
  for (let i = 0; i < count; ++i) {
    yield serialFrom === undefined
      ? values
      : { ...values, [serialField]: serialFrom + i };
  }
}
