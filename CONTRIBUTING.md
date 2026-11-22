# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Set up

You need Node.js 22 or later for the development tools. The published package supports Node.js 22 or later too.

```sh
npm install
npm test          # types, lint, format, spelling, unit tests (100% coverage), build, package checks
```

Other scripts:

| Script                 | What it does                                                          |
| ---------------------- | --------------------------------------------------------------------- |
| `npm run watch`        | Unit tests in watch mode                                              |
| `npm run format`       | Format every file with Prettier                                       |
| `npm run test:browser` | Check the `<base32-key-input>` element in Chromium (needs a Chromium) |
| `npm run bench`        | Benchmark the built package                                           |
| `npm run site`         | Build the demo page and API reference into `_site/`                   |

## Pull requests

- Keep one change per pull request, with tests. Coverage must stay at 100%.
- Write commit messages as [Conventional Commits](https://www.conventionalcommits.org/) (`fix: …`, `feat: …`). The changelog and the next version number come from them.
- A change to the key format must update [SPEC.md](SPEC.md) and [test-vectors.json](test-vectors.json).

## Releases

Maintainers release from GitHub Actions; see [RELEASING.md](.github/RELEASING.md).
