# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [3.0.0](https://github.com/ducminhquan/base32-key/compare/v2.2.0...v3.0.0) (2026-11-22)

### ⚠ BREAKING CHANGES

* Node.js 22 or later is required, and the positional
  boolean arguments of fromHexString and toHexString are removed. Pass an
  options object instead, e.g. { grouped: false, checked: true, case: 'lower' }.

### Features

* signed keys, Python and Go ports; drop positional booleans and Node 20 ([#16](https://github.com/ducminhquan/base32-key/issues/16)) ([0fc2262](https://github.com/ducminhquan/base32-key/commit/0fc2262f154e94a92ff590cd34dbe0d989baab94))

## [2.2.0](https://github.com/ducminhquan/base32-key/compare/v2.1.0...v2.2.0) (2026-11-22)

### Features

* typo suggestions, key input helpers, Standard Schema, prefixes and a CDN build ([#13](https://github.com/ducminhquan/base32-key/issues/13)) ([7b56487](https://github.com/ducminhquan/base32-key/commit/7b564877a141dbd8b8dfee456eb87fbc14755ad4))

## [2.1.0](https://github.com/ducminhquan/base32-key/compare/v2.0.0...v2.1.0) (2026-11-22)

### Features

* required group count, auto alphabet, CLI JSON/file modes, shared test vectors ([#10](https://github.com/ducminhquan/base32-key/issues/10)) ([56c01b9](https://github.com/ducminhquan/base32-key/commit/56c01b93bb1bcf8362ea3bcbd9a7de0014e62882))

## [2.0.0](https://github.com/ducminhquan/base32-key/compare/v1.1.0...v2.0.0) (2026-11-22)

### ⚠ BREAKING CHANGES

* Node.js 20 or later is required. The build output moved from build/ to dist/ and the package has an exports map, so deep imports such as base32-key/build/main/... no longer resolve. The public API is unchanged.

### Features

* v2 toolchain, ESM/CJS exports, bytes API, CLI and demo page ([#6](https://github.com/ducminhquan/base32-key/issues/6)) ([546f0d4](https://github.com/ducminhquan/base32-key/commit/546f0d48d60086cfbdf64620c8cf2b4b843ee88f))

## [1.1.0](https://github.com/ducminhquan/base32-key/compare/v1.0.9...v1.1.0) (2026-11-22)


### Features

* options API, structured errors, validate, formatInput, generateKey and BigInt helpers ([7380edb](https://github.com/ducminhquan/base32-key/commit/7380edb42a442183a898d9785841ebf30cd1c876))

### [1.0.9](https://github.com/ducminhquan/base32-key/compare/v1.0.8...v1.0.9) (2026-11-22)


### Bug Fixes

* reject invalid hex input and handle zero/empty edge cases ([5ae92a7](https://github.com/ducminhquan/base32-key/commit/5ae92a73215cded9f9e92464e418692c886e43e3))

### [1.0.8](https://github.com/ducminhquan/base32-key/compare/v1.0.7...v1.0.8) (2020-09-28)

### [1.0.7](https://github.com/ducminhquan/base32-key/compare/v1.0.6...v1.0.7) (2020-09-28)

### [1.0.6](https://github.com/ducminhquan/base32-key/compare/v1.0.5...v1.0.6) (2020-09-28)


### Bug Fixes

* add type.d.ts ([a233f51](https://github.com/ducminhquan/base32-key/commit/a233f51525b0c8f99b9fede1a325f0d5c2d37c57))

### [1.0.5](https://github.com/ducminhquan/base32-key/compare/v1.0.4...v1.0.5) (2020-09-27)

### [1.0.4](https://github.com/ducminhquan/base32-key/compare/v1.0.3...v1.0.4) (2020-09-27)

### [1.0.3](https://github.com/ducminhquan/base32-key/compare/v1.0.2...v1.0.3) (2020-09-27)

### [1.0.2](https://github.com/YOUR_GITHUB_USER_NAME/base32-key/compare/v1.0.1...v1.0.2) (2020-09-27)

### 1.0.1 (2020-09-27)
