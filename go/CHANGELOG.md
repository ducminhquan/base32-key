# Changelog

## v1.2.0 (2026-11-23)

- `Options.Groups`: the key must have exactly that many groups; missing or extra ones give `INVALID_LENGTH` and are listed in `InvalidGroups`.
- `Options.AutoCase` when decoding tries both alphabets and keeps the one whose check digits match.
- `FormatInput`: formats what the user typed (case, hyphens, prefix, at most `Groups` groups).
- `Suggest`: "Did you mean" corrections for swapped neighbours and look-alike characters, the same suggestions as the npm package.
- `ToBytesLength`: decode to a fixed number of bytes, like the npm `length` option.
- Command line: `go install github.com/ducminhquan/base32-key/go/cmd/base32key@latest`, with `encode`, `decode`, `validate` and `generate`.

## v1.1.0 (2026-11-23)

- `GenerateKey`: random keys from crypto/rand, with `Groups`, `Filter` and `MaxAttempts`.
- `SignKey` / `VerifyKey`: HMAC-SHA256 signed keys, the same keys as `signKey` / `verifyKey` in the npm package. New error code `INVALID_SIGNATURE`.
- `Options.Prefix` (e.g. `LC-222ET-3ZZGN`), with the error code `INVALID_PREFIX`.
- `Options.Normalize` for decoding ignores spaces and hyphens and folds the case.

## v1.0.0 (2026-11-23)

First tagged release (`go/v1.0.0`): `FromHex`, `ToHex`, `Validate`, `FromBytes` and `ToBytes`, compatible with base32-key 3.0 on npm and tested against the shared test vectors.
