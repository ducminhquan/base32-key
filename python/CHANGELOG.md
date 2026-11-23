# Changelog

## 1.1.0 (2026-11-23)

- `generate_key`: random keys from `secrets`, with `groups`, `filter` and `max_attempts`.
- `sign_key` / `verify_key`: HMAC-SHA256 signed keys, the same keys as `signKey` / `verifyKey` in the npm package. New error code `INVALID_SIGNATURE`.
- `prefix` on every function (e.g. `LC-222ET-3ZZGN`), with the error code `INVALID_PREFIX`.
- `normalize=True` on the decoding functions ignores spaces and hyphens and folds the case.

## 1.0.0 (2026-11-23)

First release on PyPI: `from_hex`, `to_hex`, `validate`, `from_bytes` and `to_bytes`, compatible with base32-key 3.0 on npm and tested against the shared test vectors.
