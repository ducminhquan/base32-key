import { decodeToPaddedHex } from './decode';
import { fromHexString } from './encode';
import { Base32KeyError } from './errors';
import { KeyCase, resolveOptions } from './options';
import {
  equalBytes,
  hmac,
  hmacKey,
  resolveTagBytes,
  SigningSecret,
} from './sign';

/** An unsigned integer, stored in `bits` bits as `value / unit`. */
export interface UintField {
  readonly name: string;
  readonly type: 'uint';
  /** 1 to 48. */
  readonly bits: number;
  /**
   * Values must be multiples of `unit`, which saves bits: an amount in
   * dong with `unit: 1000` stores 50000 as 50. Default `1`.
   */
  readonly unit?: number;
}

/**
 * A calendar date (`'YYYY-MM-DD'`), stored as days since 2020-01-01. The
 * default 16 bits reach 2199-06-06.
 */
export interface DateField {
  readonly name: string;
  readonly type: 'date';
  /** 8 to 24. Default `16`. */
  readonly bits?: number;
}

/** One of a fixed list of strings, stored as its index. */
export interface EnumField {
  readonly name: string;
  readonly type: 'enum';
  /** 2 to 256 distinct strings. Append new values at the end only. */
  readonly values: readonly string[];
}

/** `true` or `false`, in one bit. */
export interface BoolField {
  readonly name: string;
  readonly type: 'bool';
}

/** A field of a {@link KeyTemplateDefinition}. */
export type TemplateField = UintField | DateField | EnumField | BoolField;

/**
 * What a key carries and how it looks. Plain JSON, so the same definition
 * works in the Python and Go ports.
 */
export interface KeyTemplateDefinition {
  /**
   * 0 to 255, stored in the first byte of every key. Give each kind of key,
   * and each new version of a layout, its own id.
   */
  readonly id: number;
  /** The fields, in the order they are stored. At least one. */
  readonly fields: readonly TemplateField[];
  /** Name of a `date` field after which `verify` rejects the key (`EXPIRED`). */
  readonly expires?: string;
  /**
   * Bytes of HMAC-SHA256 tag, 4 to 32, or `0` for no tag (only with
   * `encrypt`). Default `5` (40 bits).
   */
  readonly tagBytes?: number;
  /**
   * Encrypt the field values with the secret (a Feistel cipher keyed by
   * HMAC-SHA256), so the key reveals nothing about them: consecutive order
   * numbers give unrelated keys. Encryption is a one-to-one mapping, so
   * different values always give different keys. With `tagBytes: 0` keys
   * are as short as the fields allow, but every well-formed key decodes to
   * some values: use it to hide ids, not to prove you issued a key.
   * Default `false`.
   */
  readonly encrypt?: boolean;
  /** Letters or digits in front of the key, e.g. `'LC'`. */
  readonly prefix?: string;
  /** Alphabet of the keys made. Default `'upper'`. */
  readonly case?: KeyCase;
}

/**
 * Field values: numbers, dates (`'YYYY-MM-DD'` or a `Date`, read in UTC),
 * enum strings and booleans.
 */
export type TemplateValues = Readonly<
  Record<string, number | string | boolean | Date>
>;

/** Options for {@link KeyTemplate.verify}. */
export interface TemplateVerifyOptions {
  /**
   * Today's date (`'YYYY-MM-DD'`, or a `Date` read in UTC) for the
   * `expires` check. Default: the current UTC date. Pass the local date
   * where the key is redeemed, e.g. in Vietnam (UTC+7).
   */
  readonly today?: string | Date;
  /**
   * Ignore whitespace, letter case and hyphen placement. Default `true`,
   * since keys are typed by people.
   */
  readonly normalize?: boolean;
}

/** A signed key layout made by {@link defineKeyTemplate}. */
export interface KeyTemplate {
  readonly definition: KeyTemplateDefinition;
  /** Number of groups in every key of this template. */
  readonly groups: number;
  /** Make a key that carries `values`, signed with `secret`. */
  sign(values: TemplateValues, secret: SigningSecret): Promise<string>;
  /**
   * Check a key and return its values.
   *
   * @throws {@link Base32KeyError}: the usual codes for a mistyped key,
   * `UNKNOWN_TEMPLATE` for a key of another template, `INVALID_SIGNATURE`
   * for a key not signed with `secret`, `EXPIRED` after the `expires` date.
   */
  verify(
    keyString: string,
    secret: SigningSecret,
    options?: TemplateVerifyOptions
  ): Promise<Record<string, number | string | boolean>>;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EPOCH = Date.UTC(2020, 0, 1);
const DAY = 86_400_000;
const MAX_FIELD_BITS = 256;

interface Packed {
  readonly name: string;
  readonly bits: number;
  readonly encode: (value: unknown) => bigint;
  readonly decode: (stored: bigint) => number | string | boolean | undefined;
}

function checkInteger(name: string, value: unknown, min: number, max: number) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new RangeError(
      `${name} must be an integer from ${min} to ${max}, got ${String(value)}`
    );
  }
  return value;
}

/** Days since 2020-01-01 of a `'YYYY-MM-DD'` string or a `Date` (UTC). */
export function dateToDays(name: string, value: unknown): number {
  let time: number;
  if (value instanceof Date) {
    time = Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate()
    );
  } else {
    const match = typeof value === 'string' ? DATE.exec(value) : null;
    time = match
      ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : NaN;
    if (match && daysToDate((time - EPOCH) / DAY) !== value) {
      time = NaN; // e.g. 2026-02-30
    }
  }
  if (Number.isNaN(time)) {
    throw new RangeError(
      `${name} must be a date "YYYY-MM-DD", got ${String(value)}`
    );
  }
  return (time - EPOCH) / DAY;
}

function daysToDate(days: number): string {
  return new Date(EPOCH + days * DAY).toISOString().slice(0, 10);
}

function packField(field: TemplateField, index: number): Packed {
  const where = `fields[${index}]`;
  if (typeof field !== 'object' || field === null) {
    throw new TypeError(`${where} must be an object`);
  }
  const { name } = field;
  if (typeof name !== 'string' || !NAME.test(name)) {
    throw new TypeError(`${where}.name must be an identifier, got ${name}`);
  }
  switch (field.type) {
    case 'uint': {
      const bits = checkInteger(`${name}.bits`, field.bits, 1, 48);
      const unit = checkInteger(
        `${name}.unit`,
        field.unit ?? 1,
        1,
        Number.MAX_SAFE_INTEGER
      );
      const max = (2 ** bits - 1) * unit;
      return {
        name,
        bits,
        encode: (value) => {
          checkInteger(name, value, 0, Math.min(max, Number.MAX_SAFE_INTEGER));
          if ((value as number) % unit !== 0) {
            throw new RangeError(
              `${name} must be a multiple of ${unit}, got ${String(value)}`
            );
          }
          return BigInt((value as number) / unit);
        },
        decode: (stored) => Number(stored) * unit,
      };
    }
    case 'date': {
      const bits = checkInteger(`${name}.bits`, field.bits ?? 16, 8, 24);
      return {
        name,
        bits,
        encode: (value) => {
          const days = dateToDays(name, value);
          if (days < 0 || days >= 2 ** bits) {
            throw new RangeError(
              `${name} must be from 2020-01-01 to ${daysToDate(2 ** bits - 1)}, got ${String(value)}`
            );
          }
          return BigInt(days);
        },
        decode: (stored) => daysToDate(Number(stored)),
      };
    }
    case 'enum': {
      const { values } = field;
      if (
        !Array.isArray(values) ||
        values.length < 2 ||
        values.length > 256 ||
        new Set(values).size !== values.length ||
        values.some((v) => typeof v !== 'string' || v === '')
      ) {
        throw new TypeError(
          `${name}.values must be 2 to 256 distinct non-empty strings`
        );
      }
      return {
        name,
        bits: Math.ceil(Math.log2(values.length)),
        encode: (value) => {
          const i = values.indexOf(value as string);
          if (i < 0) {
            throw new RangeError(
              `${name} must be one of ${values.join(', ')}, got ${String(value)}`
            );
          }
          return BigInt(i);
        },
        decode: (stored) => values[Number(stored)],
      };
    }
    case 'bool':
      return {
        name,
        bits: 1,
        encode: (value) => {
          if (typeof value !== 'boolean') {
            throw new TypeError(
              `${name} must be true or false, got ${String(value)}`
            );
          }
          return value ? BigInt(1) : BigInt(0);
        },
        decode: (stored) => stored === BigInt(1),
      };
    default:
      throw new TypeError(
        `${where}.type must be uint, date, enum or bool, got ${String(
          (field as { type: unknown }).type
        )}`
      );
  }
}

function toBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = length - 1; i >= 0; --i) {
    bytes[i] = Number(value & BigInt(255));
    value >>= BigInt(8);
  }
  return bytes;
}

function fromBytes(bytes: Uint8Array): bigint {
  let value = BigInt(0);
  for (const byte of bytes) {
    value = (value << BigInt(8)) | BigInt(byte);
  }
  return value;
}

const ROUNDS = 10;
const FEISTEL_LABEL = [0x42, 0x33, 0x32, 0x4b]; // "B32K"

const mask = (bits: number) => (BigInt(1) << BigInt(bits)) - BigInt(1);

/** Round function: HMAC-SHA256(key, "B32K" | round | x), cut to `width` bits. */
async function roundValue(
  key: CryptoKey,
  round: number,
  x: bigint,
  xBits: number,
  width: number
): Promise<bigint> {
  const xBytes = Math.ceil(xBits / 8);
  const input = new Uint8Array(5 + xBytes);
  input.set(FEISTEL_LABEL);
  input[4] = round;
  input.set(toBytes(x, xBytes), 5);
  const mac = await hmac(key, input);
  return fromBytes(mac.subarray(0, Math.ceil(width / 8))) & mask(width);
}

/**
 * A 10-round Feistel network on `bits` bits: the left part has the
 * ceil(bits / 2) high bits; even rounds XOR the left part with a function
 * of the right part, odd rounds the other way round.
 */
async function feistel(
  key: CryptoKey,
  value: bigint,
  bits: number,
  decrypt: boolean
): Promise<bigint> {
  const rightBits = Math.floor(bits / 2);
  const leftBits = bits - rightBits;
  let left = value >> BigInt(rightBits);
  let right = value & mask(rightBits);
  for (let step = 0; step < ROUNDS; ++step) {
    const round = decrypt ? ROUNDS - 1 - step : step;
    if (round % 2 === 0) {
      left ^= await roundValue(key, round, right, rightBits, leftBits);
    } else {
      right ^= await roundValue(key, round, left, leftBits, rightBits);
    }
  }
  return (left << BigInt(rightBits)) | right;
}

const unknownTemplate = (detail: string) =>
  new Base32KeyError('UNKNOWN_TEMPLATE', `Invalid key: ${detail}`);

const today = (value: string | Date | undefined) =>
  value === undefined
    ? Math.floor((Date.now() - EPOCH) / DAY)
    : dateToDays('today', value);

// cspell: disable
/**
 * Define a kind of key whose payload is a set of typed fields: vouchers,
 * activation codes, member cards, order numbers. A key carries the template
 * `id`, the field values packed into bits and, by default, an HMAC-SHA256
 * tag, with a check digit per group like every key. Only holders of the
 * secret can make valid keys, and `verify` returns the values without a
 * database lookup. With `encrypt` the values are hidden too.
 *
 * ### Example
 * ```js
 * const voucher = defineKeyTemplate({
 *   id: 1,
 *   fields: [
 *     { name: 'campaign', type: 'uint', bits: 12 },
 *     { name: 'expires', type: 'date' },
 *     { name: 'amount', type: 'uint', bits: 16, unit: 1000 },
 *     { name: 'serial', type: 'uint', bits: 20 },
 *   ],
 *   expires: 'expires',
 *   prefix: 'LC',
 * });
 * const key = await voucher.sign(
 *   { campaign: 12, expires: '2026-12-31', amount: 50000, serial: 1 },
 *   secret
 * );
 * await voucher.verify(key, secret);
 * // => { campaign: 12, expires: '2026-12-31', amount: 50000, serial: 1 }
 * ```
 *
 * Stopping a key from being used twice still needs a record of used
 * serials: the signature only proves that you issued it.
 */
// cspell: enable
export function defineKeyTemplate(
  definition: KeyTemplateDefinition
): KeyTemplate {
  if (typeof definition !== 'object' || definition === null) {
    throw new TypeError('The template definition must be an object');
  }
  const id = checkInteger('id', definition.id, 0, 255);
  if (
    definition.encrypt !== undefined &&
    typeof definition.encrypt !== 'boolean'
  ) {
    throw new TypeError('encrypt must be true or false');
  }
  const encrypt = definition.encrypt === true;
  const tagBytes =
    definition.tagBytes === 0 && encrypt
      ? 0
      : resolveTagBytes(definition.tagBytes);
  const keyCase = definition.case ?? 'upper';
  // Validates prefix and case.
  resolveOptions({ prefix: definition.prefix, case: keyCase });
  if (!Array.isArray(definition.fields) || definition.fields.length === 0) {
    throw new TypeError('fields must be a non-empty array');
  }
  const fields = definition.fields.map(packField);
  const names = new Set(fields.map((f) => f.name));
  if (names.size !== fields.length) {
    throw new TypeError('Field names must be unique');
  }
  const { expires } = definition;
  if (
    expires !== undefined &&
    !definition.fields.some((f) => f.name === expires && f.type === 'date')
  ) {
    throw new TypeError(`expires must name a date field, got ${expires}`);
  }
  const fieldBits = fields.reduce((sum, f) => sum + f.bits, 0);
  if (fieldBits > MAX_FIELD_BITS) {
    throw new RangeError(
      `The fields need ${fieldBits} bits, more than ${MAX_FIELD_BITS}`
    );
  }
  // Key layout: body (id, fields, zero padding), then the tag.
  const tagBits = tagBytes * 8;
  const groups = Math.ceil((8 + fieldBits + tagBits) / 20);
  const bodyBits = groups * 20 - tagBits;
  const padBits = bodyBits - 8 - fieldBits;
  const bodyBytes = Math.ceil(bodyBits / 8);
  const encodeOptions = { prefix: definition.prefix, case: keyCase };

  const tagOf = async (key: CryptoKey, body: bigint) =>
    tagBytes === 0
      ? BigInt(0)
      : fromBytes(
          (await hmac(key, toBytes(body, bodyBytes))).subarray(0, tagBytes)
        );

  /** Checks the id and padding of a plain body and reads its fields. */
  const unpack = (body: bigint) => {
    const keyId = Number(body >> BigInt(bodyBits - 8));
    if (keyId !== id || (body & mask(padBits)) !== BigInt(0)) {
      throw unknownTemplate(`it was not made with template ${id}`);
    }
    let bits = body >> BigInt(padBits);
    const out: Record<string, number | string | boolean> = {};
    for (let i = fields.length - 1; i >= 0; --i) {
      const field = fields[i];
      const value = field.decode(bits & mask(field.bits));
      if (value === undefined) {
        throw unknownTemplate(`${field.name} is out of range`);
      }
      out[field.name] = value;
      bits >>= BigInt(field.bits);
    }
    // Keep the definition's field order.
    return Object.fromEntries(fields.map((f) => [f.name, out[f.name]]));
  };

  return {
    definition,
    groups,
    async sign(values, secret) {
      if (typeof values !== 'object' || values === null) {
        throw new TypeError('values must be an object');
      }
      for (const name of Object.keys(values)) {
        if (!names.has(name)) {
          throw new TypeError(`Unknown field ${name}`);
        }
      }
      let body = BigInt(id);
      for (const field of fields) {
        if (!(field.name in values)) {
          throw new TypeError(`Missing field ${field.name}`);
        }
        body = (body << BigInt(field.bits)) | field.encode(values[field.name]);
      }
      body <<= BigInt(padBits);
      const key = await hmacKey(secret);
      if (encrypt) {
        body = await feistel(key, body, bodyBits, false);
      }
      const value = (body << BigInt(tagBits)) | (await tagOf(key, body));
      const hex = value.toString(16).padStart(groups * 5, '0');
      return fromHexString(hex, encodeOptions);
    },
    async verify(keyString, secret, options = {}) {
      const hex = decodeToPaddedHex(
        keyString,
        resolveOptions(
          {
            prefix: definition.prefix,
            case: 'auto',
            normalize: options.normalize ?? true,
            groups,
          },
          true,
          true
        )
      );
      const value = BigInt(`0x${hex}`);
      let body = value >> BigInt(tagBits);
      if (!encrypt) {
        unpack(body); // a key of another template fails here, not below
      }
      const key = await hmacKey(secret);
      const tag = value & mask(tagBits);
      if (
        tagBytes > 0 &&
        !equalBytes(
          toBytes(tag, tagBytes),
          toBytes(await tagOf(key, body), tagBytes)
        )
      ) {
        throw new Base32KeyError(
          'INVALID_SIGNATURE',
          'Invalid key: the signature does not match'
        );
      }
      if (encrypt) {
        body = await feistel(key, body, bodyBits, true);
      }
      const values = unpack(body);
      if (
        expires !== undefined &&
        today(options.today) > dateToDays(expires, values[expires])
      ) {
        throw new Base32KeyError(
          'EXPIRED',
          `Invalid key: it expired on ${String(values[expires])}`
        );
      }
      return values;
    },
  };
}

/**
 * Verify a key against several templates, e.g. every voucher version still
 * in circulation, and return the matching template and its values.
 *
 * @throws {@link Base32KeyError}: the error of the template that fits;
 * `INVALID_SIGNATURE` when a template has the key's shape but none has a
 * matching signature; otherwise `UNKNOWN_TEMPLATE`.
 */
export async function verifyKeyTemplates(
  templates: readonly KeyTemplate[],
  keyString: string,
  secret: SigningSecret,
  options: TemplateVerifyOptions = {}
): Promise<{
  readonly template: KeyTemplate;
  readonly values: Record<string, number | string | boolean>;
}> {
  let signatureError: unknown;
  for (const template of templates) {
    try {
      const values = await template.verify(keyString, secret, options);
      return { template, values };
    } catch (error) {
      const { code, message } = error as Base32KeyError;
      if (code === 'INVALID_SIGNATURE') {
        signatureError = error;
      } else if (
        code !== 'UNKNOWN_TEMPLATE' &&
        code !== 'INVALID_PREFIX' &&
        !(code === 'INVALID_LENGTH' && message.includes(' groups, got '))
      ) {
        throw error;
      }
    }
  }
  throw signatureError ?? unknownTemplate('it matches none of the templates');
}

/**
 * Ready-made template definitions. Each takes overrides, e.g.
 * `defineKeyTemplate(presets.voucher({ prefix: 'LC' }))`.
 */
export const presets = {
  /**
   * Id 1: `campaign` (0 to 4095), `expires` (date), `amount` (multiples of
   * 1000 up to 65,535,000) and `serial` (0 to 1,048,575, to tell vouchers
   * apart). 6 groups.
   */
  voucher: (overrides: Partial<KeyTemplateDefinition> = {}) =>
    ({
      id: 1,
      fields: [
        { name: 'campaign', type: 'uint', bits: 12 },
        { name: 'expires', type: 'date' },
        { name: 'amount', type: 'uint', bits: 16, unit: 1000 },
        { name: 'serial', type: 'uint', bits: 20 },
      ],
      expires: 'expires',
      ...overrides,
    }) as KeyTemplateDefinition,
  /**
   * Id 2: `product` (0 to 65535), `expires` (date) and `serial` (0 to
   * 16,777,215). 6 groups.
   */
  activation: (overrides: Partial<KeyTemplateDefinition> = {}) =>
    ({
      id: 2,
      fields: [
        { name: 'product', type: 'uint', bits: 16 },
        { name: 'expires', type: 'date' },
        { name: 'serial', type: 'uint', bits: 24 },
      ],
      expires: 'expires',
      ...overrides,
    }) as KeyTemplateDefinition,
  /**
   * Id 3: `member` (a 32-bit number) and `tier` (standard, silver, gold or
   * platinum). 5 groups.
   */
  member: (overrides: Partial<KeyTemplateDefinition> = {}) =>
    ({
      id: 3,
      fields: [
        { name: 'member', type: 'uint', bits: 32 },
        {
          name: 'tier',
          type: 'enum',
          values: ['standard', 'silver', 'gold', 'platinum'],
        },
      ],
      ...overrides,
    }) as KeyTemplateDefinition,
};
