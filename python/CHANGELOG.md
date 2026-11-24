# Changelog

## 1.2.1 (2026-11-24)

- `suggest` with `groups` no longer returns a key whose group count is still wrong (changing characters cannot add or remove a group).
- Property tests with Hypothesis (round trips, decoding arbitrary input, `format_input` and `suggest`).
- README: the signed-key example shows the right key.

## 1.2.0 (2026-11-23)

- `groups=` on `validate`, `to_hex` and `to_bytes`: the key must have exactly that many groups; missing or extra ones give `INVALID_LENGTH` and are listed in `invalid_groups`.
- `case="auto"` when decoding tries both alphabets and keeps the one whose check digits match.
- `format_input`: formats what the user typed (case, hyphens, prefix, at most `groups` groups).
- `suggest`: "Did you mean" corrections for swapped neighbours and look-alike characters, the same suggestions as the npm package.
- Command line: `python -m base32_key` or the `base32-key` script, with `encode`, `decode`, `validate` and `generate`.
- `__version__`, and type hints that pass `mypy --strict`.

## 1.1.0 (2026-11-23)

- `generate_key`: random keys from `secrets`, with `groups`, `filter` and `max_attempts`.
- `sign_key` / `verify_key`: HMAC-SHA256 signed keys, the same keys as `signKey` / `verifyKey` in the npm package. New error code `INVALID_SIGNATURE`.
- `prefix` on every function (e.g. `LC-222ET-3ZZGN`), with the error code `INVALID_PREFIX`.
- `normalize=True` on the decoding functions ignores spaces and hyphens and folds the case.

## 1.0.0 (2026-11-23)

First release on PyPI: `from_hex`, `to_hex`, `validate`, `from_bytes` and `to_bytes`, compatible with base32-key 3.0 on npm and tested against the shared test vectors.
