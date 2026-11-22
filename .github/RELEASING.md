# Releasing

Publishing to npm is automated by [`.github/workflows/release.yml`](workflows/release.yml). Pushing a version tag such as `v1.0.9` runs the tests on Node 18, 20 and 22, publishes the package to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements), and creates a GitHub release whose notes come from `CHANGELOG.md`.

## One-time setup

1. On [the npm website](https://www.npmjs.com/settings/~/tokens), create a **granular access token**:
   - Permissions: _Read and write_, limited to the `base32-key` package.
   - Pick an expiry date and remember to rotate the token before it expires.
   - If the account requires two-factor authentication for publishing, enable the option that lets this token bypass it.
2. In the GitHub repository, open _Settings → Secrets and variables → Actions_ and add a repository secret named `NPM_TOKEN` with that token. (Secret names are not case sensitive, so an existing `npm_token` secret already works.)
3. Optional: under _Settings → Environments_, open the `npm` environment (created on the first run) to require a manual approval before each publish.

No other secret is needed. The GitHub release is created with the built-in `GITHUB_TOKEN`.

## Cutting a release

From an up-to-date `master` with a clean working tree:

```sh
npm run release
```

This runs `standard-version` (bumps the version from the commit messages, updates `CHANGELOG.md`, commits and tags `vX.Y.Z`) and pushes the commit and tag. The tag push starts the release workflow.

To force a specific bump, run `npx standard-version --release-as minor` (or `major`, `patch`, or an exact version), then `git push --follow-tags origin master`.

## Safety checks

- The workflow fails if the tag does not match the `version` in `package.json`.
- If that version is already on npm, the publish step is skipped, so re-running the workflow is safe.
- If a GitHub release for the tag already exists, it is left untouched.
- To publish an existing tag again (for example after fixing the `NPM_TOKEN` secret), run the _Release_ workflow manually from the _Actions_ tab and enter the tag.
