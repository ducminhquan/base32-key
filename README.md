# base32-key

Human-friendly keys such as `222ET-3ZZGN` for product keys, vouchers and codes people read and type: no look-alike characters, and a check digit in every group of five so a typo points at the exact group. The format is defined in [SPEC.md](SPEC.md).

[![CI](https://github.com/ducminhquan/base32-key/actions/workflows/ci.yml/badge.svg)](https://github.com/ducminhquan/base32-key/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/ducminhquan/base32-key/badge)](https://scorecard.dev/viewer/?uri=github.com/ducminhquan/base32-key)
[![GitHub license](https://img.shields.io/github/license/ducminhquan/base32-key.svg)](https://github.com/ducminhquan/base32-key/blob/master/LICENSE)
[![GitHub release](https://img.shields.io/github/release/ducminhquan/base32-key.svg)](https://github.com/ducminhquan/base32-key/releases/)
[![GitHub tag](https://img.shields.io/github/tag/ducminhquan/base32-key.svg)](https://GitHub.com/ducminhquan/base32-key/tags/)

[![npm](https://img.shields.io/npm/v/base32-key.svg)](https://www.npmjs.com/package/base32-key)
[![PyPI](https://img.shields.io/pypi/v/base32-key.svg)](https://pypi.org/project/base32-key/)
[![Go Reference](https://pkg.go.dev/badge/github.com/ducminhquan/base32-key/go.svg)](https://pkg.go.dev/github.com/ducminhquan/base32-key/go)

**[Try it in the browser](https://ducminhquan.github.io/base32-key/)** · [API reference](https://ducminhquan.github.io/base32-key/api/)

## Usage

### Install

    npm install base32-key

    # or

    yarn add base32-key

Node.js 22 or later, or any modern browser. The package ships ES module and CommonJS builds with TypeScript types.

<!-- cspell:disable -->

### Example (es module)

```js
import { fromHexString, toHexString } from 'base32-key';
console.log(fromHexString('c0ffee'));
// => '222ET-3ZZGN'
console.log(toHexString('222ET-3ZZGN'));
// => 'c0ffee'
```

### Example (commonjs)

```js
const { fromHexString, toHexString } = require('base32-key');
console.log(fromHexString('c0ffee'));
// => '222ET-3ZZGN'
console.log(toHexString('222ET-3ZZGN'));
// => 'c0ffee'
```

### Options

Every function takes an optional options object. The positional booleans of 1.x
were removed in 3.0 (see [Upgrading to 3.0](#upgrading-to-30)).

| Option      | Default   | Meaning                                                                      |
| ----------- | --------- | ---------------------------------------------------------------------------- |
| `grouped`   | `true`    | Split the key into hyphen-separated groups of 4 data digits.                 |
| `checked`   | `true`    | Add a CRC-5 check digit (one per group when grouped).                        |
| `case`      | `'upper'` | `'upper'` or `'lower'` alphabet.                                             |
| `normalize` | see below | Decoding only: ignore whitespace, letter case and where the hyphens are put. |
| `groups`    | any       | Decoding only: the key must have exactly this many groups.                   |

`normalize` defaults to `false` for `toHexString` and `toBigInt` and to `true` for `validate`.

When decoding, `case: 'auto'` accepts either alphabet and keeps the one whose check digits match.

```js
fromHexString('c0ffee', { grouped: false, case: 'lower' });
// => 'nb99qj'
toHexString(' 222et 3zzgn ', { normalize: true });
// => 'c0ffee'
```

### Checking a key while the user types

```js
import { formatInput, validate } from 'base32-key';

formatInput('222et3zz');
// => '222ET-3ZZ'  (put this back in the input field)

validate('222ET-3ZZGX');
// => { valid: false, invalidGroups: [1], code: 'CHECKSUM_MISMATCH' }
```

`invalidGroups` holds 0-based group indexes, so you can highlight exactly the group that was mistyped.

Keys of a fixed length, such as product keys, should pass `groups`. Otherwise a key that lost its last group still validates:

```js
validate('222ET', { groups: 4 });
// => { valid: false, invalidGroups: [1, 2, 3], code: 'INVALID_LENGTH' }

formatInput('222et3zzgn22', { groups: 2 });
// => '222ET-3ZZGN'  (extra input is dropped)
```

### Errors

Invalid input throws a `Base32KeyError` with a `code` and the `invalidGroups`:

```js
import { Base32KeyError, toHexString } from 'base32-key';

try {
  toHexString('222EX-3ZZGN');
} catch (error) {
  if (error instanceof Base32KeyError) {
    error.code; // 'CHECKSUM_MISMATCH'
    error.invalidGroups; // [0]
  }
}
```

| Code                | When                                                          |
| ------------------- | ------------------------------------------------------------- |
| `INVALID_HEX`       | The hex input is empty or has non-hex characters.             |
| `INVALID_CHARACTER` | A group has a character outside the alphabet (e.g. `0`, `O`). |
| `INVALID_LENGTH`    | The key or a group has the wrong length.                      |
| `CHECKSUM_MISMATCH` | A check digit does not match its group.                       |
| `INVALID_PREFIX`    | The key does not start with the `prefix` option.              |
| `GENERATION_FAILED` | `generateKey` found no key accepted by `filter`.              |
| `NO_RANDOM_SOURCE`  | No `crypto.getRandomValues`; pass the `random` option.        |

A non-string argument throws a `TypeError`.

### Generating keys

```js
import { generateKey } from 'base32-key';

generateKey();
// => e.g. 'K7RQX-2HMTD-9WCJA-PNE4F'  (4 groups, 80 random bits)

generateKey({ groups: 3, filter: (key) => !blocklist.has(key) });
```

`generateKey` uses `crypto.getRandomValues`. Pass `random: (n) => bytes` to use another source.

### Numbers

```js
import { fromBigInt, toBigInt } from 'base32-key';

fromBigInt(12648430n);
// => '222ET-3ZZGN'
toBigInt('222ET-3ZZGN');
// => 12648430n
```

### Suggesting a fix for a typo

```js
import { suggest } from 'base32-key';

suggest('222TE-3ZZGN');
// => ['222ET-3ZZGN']  (show "Did you mean 222ET-3ZZGN?")
```

`suggest` repairs only the groups that fail: it swaps two neighbouring characters or replaces a look-alike (2/Z, 5/S, 8/B, 6/G, U/V/Y, 0/O/D/Q, 1/I/L/J). Every suggestion is a valid key. A check digit has 32 values, so an unrelated key can also pass: show suggestions to the user, never apply them silently.

### Prefixes

```js
generateKey({ prefix: 'LC', groups: 3 });
// => e.g. 'LC-K7RQX-2HMTD-9WCJA'
toHexString('lc 222et 3zzgn', { prefix: 'LC', normalize: true });
// => 'c0ffee'
```

A key without the prefix fails with `INVALID_PREFIX`. The prefix is letters and digits; it is not covered by the check digits.

### Forms and inputs

`attachKeyInput` turns an `<input>` into a key field. As the user types or pastes, it formats the value and keeps the caret in place. It sets `aria-invalid` when a finished group is wrong and reports suggestions:

```js
import { attachKeyInput } from 'base32-key';

attachKeyInput(document.querySelector('#voucher'), {
  groups: 4,
  onChange: ({ valid, errorGroups, suggestions }) => {
    /* enable the submit button, highlight errorGroups, show suggestions[0] */
  },
});
```

Or use the ready-made custom element, which also takes part in forms:

```html
<script type="module">
  import { defineKeyInput } from 'base32-key/element';
  defineKeyInput();
</script>
<form>
  <base32-key-input name="voucher" groups="4" required></base32-key-input>
</form>
```

For validation libraries, `keySchema(options)` is a [Standard Schema](https://standardschema.dev). TanStack Form, tRPC, Hono and others accept it with no extra dependency. Its output is the formatted key:

```js
import { keySchema } from 'base32-key';

const voucher = keySchema({ groups: 4 });
voucher['~standard'].validate('222et 3zzgn');
// => { issues: [{ message: 'Enter all 4 groups of the key' }] }
```

With Zod, use `z.string().refine((key) => validate(key, { groups: 4 }).valid)`.

### In the browser without a bundler

```html
<script type="module">
  import {
    fromHexString,
    defineKeyInput,
  } from 'https://cdn.jsdelivr.net/npm/base32-key@2/dist/base32-key.min.js';
</script>
```

### Bytes

```js
import { fromBytes, toBytes } from 'base32-key';

fromBytes(new Uint8Array([0xc0, 0xff, 0xee]));
// => '222ET-3ZZGN'
toBytes('222ET-3ZZGN');
// => Uint8Array [0xc0, 0xff, 0xee]
```

A key stores a number, so leading zero bytes are lost. Two ways to keep them:

```js
// The length is fixed and known, e.g. 16-byte tokens:
toBytes(key, { length: 16 });

// The length varies: store it in an extra first group.
const key = fromBytes(new Uint8Array([0, 0xff]), { withLength: true });
// => '2224C-229ZN'
toBytes(key, { withLength: true });
// => Uint8Array [0x00, 0xff]
```

With `withLength`, a key that lost or gained groups fails with `INVALID_LENGTH` instead of decoding to the wrong bytes.

### Signed keys

When a key must not be guessable even though its contents are (a serial number, an order id), sign it. `signKey` appends a truncated HMAC-SHA256 tag to the payload, and `verifyKey` returns the payload only for keys made with the same secret. It uses WebCrypto, so it works in Node.js 22+ and in browsers, and both functions return a promise.

```js
import { signKey, verifyKey } from 'base32-key';

const secret = 's3cret'; // a string, bytes or an HMAC CryptoKey; keep it on the server
const key = await signKey(new Uint8Array([0, 0, 1, 42]), secret);
// => '222BA-22222-22BCC-8255N-DK73S'

await verifyKey(key, secret); // => Uint8Array [0, 0, 1, 42]
await verifyKey(key, 'another secret'); // throws Base32KeyError, code 'INVALID_SIGNATURE'
```

- `tagBytes` sets the tag length, from 4 to 32 bytes (default 5, which is 40 bits: one guess in about a trillion succeeds). Pass the same value to `verifyKey`.
- Typos are still caught first, by the check digits, with the usual `invalidGroups`.
- Signed keys are grouped and use the `withLength` layout from [Bytes](#bytes). `case`, `prefix` and the decode options such as `normalize` work as usual.
- A signature proves who made a key, not that it is unused: keep track of redeemed keys on the server.

### Command line

```sh
npx base32-key encode c0ffee            # 222ET-3ZZGN
npx base32-key decode 222ET-3ZZGN       # c0ffee
npx base32-key validate 222ET-3ZZGX     # invalid (CHECKSUM_MISMATCH) in group 2
npx base32-key generate --count 5 --groups 3
cat keys.txt | npx base32-key validate --groups 4 --json  # one key per line; exit code 1 if any is invalid
npx base32-key encode --file logo.png   # one key holding the file's bytes
npx base32-key decode --file copy.png <key>
```

Options include `--case upper|lower|auto`, `--ungrouped`, `--unchecked`, `--groups`, `--normalize`, `--strict`, `--upper-hex` and `--json`. Run `npx base32-key --help` for the full list, and `npx base32-key completion bash` (or `zsh`, `fish`) for shell completion.

<!-- cspell:enable -->

### Test vectors

The package ships [`test-vectors.json`](test-vectors.json) with valid keys in every format, invalid keys with their error codes, and `withLength` byte keys. Use it to check another implementation:

```js
import vectors from 'base32-key/test-vectors.json' with { type: 'json' };
```

### Other languages

The [python](python/) and [go](go/) folders hold ports with the same features except the browser helpers: hex and bytes encoding, per-group errors, `normalize`, `case: 'auto'`, `groups`, prefixes, input formatting, typo suggestions, random and signed keys, and a CLI. They pass the same [test-vectors.json](test-vectors.json), so a key made in one language decodes in the others.

    pip install base32-key                              # Python 3.9+
    go get github.com/ducminhquan/base32-key/go@latest  # Go 1.22+

## Specification

[SPEC.md](SPEC.md) describes the encoding, the alphabets, the check digit and the design choices behind them.

## Upgrading to 3.0

- Node.js 22 or later is required.
- The positional boolean arguments are removed. Replace `fromHexString(hex, false, true, false)` with `fromHexString(hex, { grouped: false, checked: true, case: 'lower' })`, and the same for `toHexString`. Passing booleans now throws a `TypeError` that says so.
- Nothing else changed: keys made by 2.x decode the same way.

## Upgrading to 2.0

- Node.js 22 or later is required.
- The package is built to `dist/` with an `exports` map. Import from `base32-key` only; deep imports such as `base32-key/build/main/...` no longer work.
- The API is unchanged from 1.1. The positional boolean arguments were deprecated (and removed in 3.0).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability and for how releases are protected.

## Releasing

Releases run from GitHub Actions and are staged on npm for approval. See [RELEASING.md](.github/RELEASING.md).
