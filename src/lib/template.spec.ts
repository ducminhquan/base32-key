import { describe, expect, test } from 'vitest';

import { Base32KeyError } from './errors';
import {
  defineKeyTemplate,
  KeyTemplateDefinition,
  presets,
  TemplateField,
  verifyKeyTemplates,
} from './template';

const secret = 's3cret';
const voucher = defineKeyTemplate(presets.voucher({ prefix: 'LC' }));
const values = {
  campaign: 12,
  expires: '2026-12-31',
  amount: 50000,
  serial: 1,
};
const today = '2026-11-24';

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as Base32KeyError;
  }
  throw new Error('Expected a rejection');
}

describe('defineKeyTemplate', () => {
  test('signs and verifies values', async () => {
    const key = await voucher.sign(values, secret);
    expect(key).toMatch(/^LC(-[2-9A-HJ-NP-Z]{5}){6}$/);
    expect(voucher.groups).toBe(6);
    expect(await voucher.verify(key, secret, { today })).toEqual(values);
    // Typed by a person: lowercase, spaces, no hyphens.
    const typed = key.toLowerCase().replace(/-/g, ' ');
    expect(await voucher.verify(typed, secret, { today })).toEqual(values);
    expect(
      (await rejection(voucher.verify(typed, secret, { normalize: false })))
        .code
    ).toBe('INVALID_PREFIX');
  });

  test('every field type', async () => {
    const t = defineKeyTemplate({
      id: 200,
      fields: [
        { name: 'n', type: 'uint', bits: 48 },
        { name: 'day', type: 'date', bits: 8 },
        { name: 'tier', type: 'enum', values: ['a', 'b', 'c'] },
        { name: 'ok', type: 'bool' },
        { name: 'no', type: 'bool' },
      ],
      tagBytes: 4,
      case: 'lower',
    });
    const v = {
      n: 2 ** 48 - 1,
      day: '2020-09-12',
      tier: 'c',
      ok: true,
      no: false,
    };
    const key = await t.sign(v, new TextEncoder().encode(secret));
    expect(key).toMatch(/^[a-z2-9-]+$/);
    expect(await t.verify(key, secret)).toEqual(v);
    const date = await t.sign(
      { ...v, day: new Date('2020-01-01T23:00:00Z') },
      secret
    );
    expect((await t.verify(date, secret)).day).toBe('2020-01-01');
  });

  test('accepts a CryptoKey', async () => {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const key = await voucher.sign(values, cryptoKey);
    expect(await voucher.verify(key, secret, { today })).toEqual(values);
  });

  test('rejects keys that fail a check', async () => {
    const key = await voucher.sign(values, secret);
    expect(
      (await rejection(voucher.verify(key, 'wrong', { today }))).code
    ).toBe('INVALID_SIGNATURE');
    const expired = await rejection(
      voucher.verify(key, secret, { today: '2027-01-01' })
    );
    expect(expired.code).toBe('EXPIRED');
    expect(expired.message).toBe('Invalid key: it expired on 2026-12-31');
    expect(await voucher.verify(key, secret, { today: '2026-12-31' })).toEqual(
      values
    );
    expect(
      (
        await rejection(
          voucher.verify(key, secret, {
            today: new Date('2027-01-01T00:00:00Z'),
          })
        )
      ).code
    ).toBe('EXPIRED');
    // Default today: the current UTC date, long after 2020-01-02.
    const old = await voucher.sign(
      { ...values, expires: '2020-01-02' },
      secret
    );
    expect((await rejection(voucher.verify(old, secret))).code).toBe('EXPIRED');

    const typo = key.slice(0, -1) + (key.endsWith('2') ? '3' : '2');
    expect(
      (await rejection(voucher.verify(typo, secret, { today }))).code
    ).toBe('CHECKSUM_MISMATCH');
    const short = key.slice(0, key.lastIndexOf('-'));
    expect((await rejection(voucher.verify(short, secret))).code).toBe(
      'INVALID_LENGTH'
    );
  });

  test('tells keys of other templates apart', async () => {
    const member = defineKeyTemplate(
      presets.member({ prefix: 'LC', tagBytes: 8 })
    );
    const memberKey = await member.sign({ member: 1, tier: 'gold' }, secret);
    expect(member.groups).toBe(6);
    const error = await rejection(voucher.verify(memberKey, secret));
    expect(error.code).toBe('UNKNOWN_TEMPLATE');

    // Same id and shape, but the stored bits do not fit the fields.
    const wide = defineKeyTemplate({
      id: 5,
      fields: [{ name: 'x', type: 'uint', bits: 12 }],
    });
    const narrow = defineKeyTemplate({
      id: 5,
      fields: [{ name: 'x', type: 'uint', bits: 4 }],
    });
    const choice = defineKeyTemplate({
      id: 5,
      fields: [
        { name: 'x', type: 'enum', values: ['a', 'b', 'c'] },
        { name: 'y', type: 'uint', bits: 10 },
      ],
    });
    const wideKey = await wide.sign({ x: 0xfff }, secret);
    expect((await rejection(narrow.verify(wideKey, secret))).code).toBe(
      'UNKNOWN_TEMPLATE'
    );
    expect((await rejection(choice.verify(wideKey, secret))).code).toBe(
      'UNKNOWN_TEMPLATE'
    );
  });

  test('encrypt hides values and keeps keys unique', async () => {
    const order = defineKeyTemplate({
      id: 9,
      fields: [{ name: 'order', type: 'uint', bits: 40 }],
      encrypt: true,
      tagBytes: 0,
    });
    expect(order.groups).toBe(3);
    const keys = new Set<string>();
    for (let n = 1000; n < 1200; ++n) {
      const key = await order.sign({ order: n }, secret);
      keys.add(key);
      expect(await order.verify(key, secret)).toEqual({ order: n });
    }
    expect(keys.size).toBe(200);
    // Without a tag, a key for another secret decodes to garbage that the
    // id and padding checks catch (here: 20 check bits).
    const other = await order.sign({ order: 1000 }, 'another secret');
    expect((await rejection(order.verify(other, secret))).code).toBe(
      'UNKNOWN_TEMPLATE'
    );

    const sealed = defineKeyTemplate(presets.voucher({ encrypt: true }));
    const a = await sealed.sign(values, secret);
    const b = await sealed.sign({ ...values, serial: 2 }, secret);
    expect(a.slice(0, 5)).not.toBe(b.slice(0, 5));
    expect(await sealed.verify(a, secret, { today })).toEqual(values);
    expect((await rejection(sealed.verify(a, 'wrong', { today }))).code).toBe(
      'INVALID_SIGNATURE'
    );
  });

  test('checks values when signing', async () => {
    const cases: [object, string][] = [
      [null as unknown as object, 'values must be an object'],
      [{ ...values, extra: 1 }, 'Unknown field extra'],
      [{ campaign: 1 }, 'Missing field expires'],
      [
        { ...values, campaign: 4096 },
        'campaign must be an integer from 0 to 4095',
      ],
      [{ ...values, campaign: 1.5 }, 'campaign must be an integer'],
      [{ ...values, amount: 1500 }, 'amount must be a multiple of 1000'],
      [{ ...values, expires: '2026-02-30' }, 'expires must be a date'],
      [{ ...values, expires: 20261231 }, 'expires must be a date'],
      [
        { ...values, expires: '2019-12-31' },
        'expires must be from 2020-01-01 to 2199-06-06',
      ],
    ];
    for (const [v, message] of cases) {
      const error = await rejection(
        voucher.sign(v as Record<string, number>, secret)
      );
      expect(error.message).toContain(message);
    }
    const t = defineKeyTemplate({
      id: 1,
      fields: [
        { name: 'e', type: 'enum', values: ['a', 'b'] },
        { name: 'b', type: 'bool' },
      ],
    });
    expect((await rejection(t.sign({ e: 'c', b: true }, secret))).message).toBe(
      'e must be one of a, b, got c'
    );
    expect((await rejection(t.sign({ e: 'a', b: 1 }, secret))).message).toBe(
      'b must be true or false, got 1'
    );
    const key = await voucher.sign(values, secret);
    expect(
      (await rejection(voucher.verify(key, secret, { today: 'soon' }))).message
    ).toBe('today must be a date "YYYY-MM-DD", got soon');
  });

  test('checks the definition', () => {
    const field: TemplateField = { name: 'x', type: 'uint', bits: 8 };
    const bad: [unknown, string][] = [
      [null, 'must be an object'],
      [{ id: 256, fields: [field] }, 'id must be an integer from 0 to 255'],
      [
        { id: 1, fields: [field], encrypt: 'yes' },
        'encrypt must be true or false',
      ],
      [
        { id: 1, fields: [field], tagBytes: 0 },
        'tagBytes must be an integer from 4 to 32',
      ],
      [
        { id: 1, fields: [field], prefix: 'L-C' },
        'prefix must be letters and digits',
      ],
      [{ id: 1, fields: [field], case: 'title' }, 'Invalid case option'],
      [{ id: 1, fields: [] }, 'fields must be a non-empty array'],
      [{ id: 1, fields: [null] }, 'fields[0] must be an object'],
      [
        { id: 1, fields: [{ ...field, name: '1x' }] },
        'fields[0].name must be an identifier',
      ],
      [
        { id: 1, fields: [{ ...field, type: 'text' }] },
        'fields[0].type must be uint, date, enum or bool',
      ],
      [
        { id: 1, fields: [{ ...field, bits: 49 }] },
        'x.bits must be an integer from 1 to 48',
      ],
      [{ id: 1, fields: [{ ...field, unit: 0 }] }, 'x.unit must be an integer'],
      [
        { id: 1, fields: [{ name: 'd', type: 'date', bits: 30 }] },
        'd.bits must be an integer from 8 to 24',
      ],
      [
        { id: 1, fields: [{ name: 'e', type: 'enum', values: ['a'] }] },
        'e.values must be 2 to 256',
      ],
      [
        { id: 1, fields: [{ name: 'e', type: 'enum', values: ['a', 'a'] }] },
        'e.values must be 2 to 256',
      ],
      [
        { id: 1, fields: [{ name: 'e', type: 'enum', values: ['a', ''] }] },
        'e.values must be 2 to 256',
      ],
      [
        { id: 1, fields: [{ name: 'e', type: 'enum' }] },
        'e.values must be 2 to 256',
      ],
      [{ id: 1, fields: [field, field] }, 'Field names must be unique'],
      [
        { id: 1, fields: [field], expires: 'x' },
        'expires must name a date field',
      ],
      [
        {
          id: 1,
          fields: Array(6)
            .fill(0)
            .map((_, i) => ({ name: `f${i}`, type: 'uint', bits: 48 })),
        },
        'The fields need 288 bits, more than 256',
      ],
    ];
    for (const [definition, message] of bad) {
      expect(() =>
        defineKeyTemplate(definition as KeyTemplateDefinition)
      ).toThrow(message);
    }
  });
});

describe('verifyKeyTemplates', () => {
  const v1 = defineKeyTemplate(presets.voucher({ prefix: 'LC' }));
  const v2 = defineKeyTemplate(
    presets.voucher({ id: 4, prefix: 'LC', encrypt: true })
  );
  const member = defineKeyTemplate(presets.member());
  const all = [member, v1, v2];

  test('finds the template of a key', async () => {
    const key = await v2.sign(values, secret);
    const result = await verifyKeyTemplates(all, key, secret, { today });
    expect(result.template).toBe(v2);
    expect(result.values).toEqual(values);
    const memberKey = await member.sign({ member: 7, tier: 'silver' }, secret);
    expect((await verifyKeyTemplates(all, memberKey, secret)).template).toBe(
      member
    );
  });

  test('reports why no template fits', async () => {
    const key = await v1.sign(values, secret);
    expect((await rejection(verifyKeyTemplates(all, key, 'wrong'))).code).toBe(
      'INVALID_SIGNATURE'
    );
    expect(
      (await rejection(verifyKeyTemplates([member], key, secret))).code
    ).toBe('UNKNOWN_TEMPLATE');
    expect(
      (
        await rejection(
          verifyKeyTemplates(all, key, secret, { today: '2030-01-01' })
        )
      ).code
    ).toBe('EXPIRED');
    const typo = key.replace(/-(.)/, (_, c) => `-${c === '2' ? '3' : '2'}`);
    expect((await rejection(verifyKeyTemplates(all, typo, secret))).code).toBe(
      'CHECKSUM_MISMATCH'
    );
  });
});

describe('presets', () => {
  test('have the documented shapes', () => {
    expect(defineKeyTemplate(presets.voucher()).groups).toBe(6);
    expect(defineKeyTemplate(presets.activation()).groups).toBe(6);
    expect(defineKeyTemplate(presets.member()).groups).toBe(5);
    expect(presets.voucher({ prefix: 'LC' }).prefix).toBe('LC');
  });

  test('activation keys', async () => {
    const t = defineKeyTemplate(presets.activation());
    const v = { product: 65535, expires: '2027-06-30', serial: 16777215 };
    expect(await t.verify(await t.sign(v, secret), secret, { today })).toEqual(
      v
    );
  });
});
