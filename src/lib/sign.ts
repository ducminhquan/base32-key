import { BytesDecodeOptions, fromBytes, toBytes } from './bytes';
import { Base32KeyError } from './errors';
import { DecodeOptions, EncodeOptions } from './options';

/** Secret for {@link signKey} and {@link verifyKey}. */
export type SigningSecret = string | Uint8Array | CryptoKey;

/** Options for {@link signKey}. */
export interface SignOptions extends EncodeOptions {
  /**
   * Bytes of the HMAC-SHA256 tag to keep, from 4 to 32. Each byte adds 8
   * bits of forgery resistance and about 1.6 characters to the key.
   * Default `5` (40 bits).
   */
  readonly tagBytes?: number;
}

/** Options for {@link verifyKey}. Use the same `tagBytes` as when signing. */
export interface VerifyOptions extends DecodeOptions {
  /** Bytes of the tag in the key. Default `5`. */
  readonly tagBytes?: number;
}

const encoder = new TextEncoder();

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) {
    throw new TypeError('signKey and verifyKey need WebCrypto (crypto.subtle)');
  }
  return s;
}

export function resolveTagBytes(tagBytes = 5): number {
  if (!Number.isInteger(tagBytes) || tagBytes < 4 || tagBytes > 32) {
    throw new RangeError(
      `tagBytes must be an integer from 4 to 32, got ${tagBytes}`
    );
  }
  return tagBytes;
}

/** Imports a string or byte secret as an HMAC-SHA256 key, once per call site. */
export async function hmacKey(secret: SigningSecret): Promise<CryptoKey> {
  const s = subtle();
  let key: CryptoKey;
  if (typeof secret === 'string' || secret instanceof Uint8Array) {
    const raw = typeof secret === 'string' ? encoder.encode(secret) : secret;
    if (raw.length === 0) {
      throw new TypeError('The signing secret must not be empty');
    }
    key = await s.importKey(
      'raw',
      raw as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
  } else {
    key = secret;
  }
  return key;
}

export async function hmac(secret: SigningSecret, data: Uint8Array) {
  const key = await hmacKey(secret);
  return new Uint8Array(await subtle().sign('HMAC', key, data as BufferSource));
}

/** Compare two byte arrays in time that depends only on their length. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; ++i) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// cspell: disable
/**
 * Make a key that carries `payload` and an HMAC-SHA256 tag, so only someone
 * with the secret can create valid keys. Use it for vouchers or licence
 * keys that must not be guessable even when the payload is (a serial
 * number, an order id).
 *
 * The key is `fromBytes(payload + tag, { withLength: true })`, so every
 * group still has its check digit and typos are caught before the
 * signature is checked. Requires grouped keys and WebCrypto.
 *
 * ### Example
 * ```js
 * const key = await signKey(new Uint8Array([0, 42]), secret);
 * const payload = await verifyKey(key, secret);
 * // => Uint8Array [0, 42]
 * ```
 */
// cspell: enable
export async function signKey(
  payload: Uint8Array,
  secret: SigningSecret,
  options: SignOptions = {}
): Promise<string> {
  const { tagBytes: rawTagBytes, ...encodeOptions } = options;
  const tagBytes = resolveTagBytes(rawTagBytes);
  if (!(payload instanceof Uint8Array)) {
    throw new TypeError('Invalid: expected a Uint8Array');
  }
  const tag = (await hmac(secret, payload)).subarray(0, tagBytes);
  const signed = new Uint8Array(payload.length + tagBytes);
  signed.set(payload);
  signed.set(tag, payload.length);
  return fromBytes(signed, { ...encodeOptions, withLength: true });
}

/**
 * Check a key made by {@link signKey} and return its payload.
 *
 * @throws {@link Base32KeyError} like {@link toBytes} for a mistyped key,
 * or with code `INVALID_SIGNATURE` when the key is well formed but was not
 * signed with this secret.
 */
export async function verifyKey(
  keyString: string,
  secret: SigningSecret,
  options: VerifyOptions = {}
): Promise<Uint8Array> {
  const { tagBytes: rawTagBytes, ...decodeOptions } = options;
  const tagBytes = resolveTagBytes(rawTagBytes);
  const bytesOptions: BytesDecodeOptions = {
    ...decodeOptions,
    withLength: true,
  };
  const signed = toBytes(keyString, bytesOptions);
  if (signed.length < tagBytes) {
    throw new Base32KeyError(
      'INVALID_SIGNATURE',
      'Invalid key: too short to carry a signature'
    );
  }
  const payload = signed.slice(0, signed.length - tagBytes);
  const tag = signed.subarray(signed.length - tagBytes);
  const expected = (await hmac(secret, payload)).subarray(0, tagBytes);
  if (!equalBytes(tag, expected)) {
    throw new Base32KeyError(
      'INVALID_SIGNATURE',
      'Invalid key: the signature does not match'
    );
  }
  return payload;
}
