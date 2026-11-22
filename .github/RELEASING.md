# Releasing

Publishing to npm is automated by [`.github/workflows/release.yml`](workflows/release.yml). Pushing a version tag such as `v1.0.9` runs the tests on Node 18, 20 and 22, publishes the package to npm, and creates a GitHub release whose notes come from `CHANGELOG.md`.

The workflow authenticates with [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OpenID Connect). No npm token is stored in GitHub, and npm adds a [provenance statement](https://docs.npmjs.com/generating-provenance-statements) to every release automatically.

## One-time setup on the npm website

1. Sign in, open the [base32-key package settings](https://www.npmjs.com/package/base32-key/access) and find **Trusted publishing**.
2. Click **Add trusted publisher**, choose **GitHub Actions** and fill in (fields are case sensitive):
   - Organization or user: `ducminhquan`
   - Repository: `base32-key`
   - Workflow filename: `release.yml`
   - Environment name: `npm`
   - Allowed actions: tick **npm publish**.
3. Save. npm does not check the values when saving, so a typo only shows up as an `ENEEDAUTH` error when the workflow publishes.
4. Push the first release tag within 2 days. A new trusted publisher that has not completed a publish within 2 days expires and has to be added again.
5. After the first release succeeds, harden the package: under **Publishing access**, choose **Require two-factor authentication and disallow tokens**. Trusted publishing keeps working; leaked tokens no longer can publish.
6. Delete any old `NPM_TOKEN` / `npm_token` secret from the GitHub repository settings and revoke that token on npm. It is no longer used.

Nothing needs to be configured in GitHub. The `npm` environment is created on the first run; add a required reviewer there if you want to approve each publish by hand. The GitHub release is created with the built-in `GITHUB_TOKEN`.

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
- To publish an existing tag again (for example after fixing the trusted publisher settings), run the _Release_ workflow manually from the _Actions_ tab and enter the tag.
- Trusted publishing needs npm 11.5.1 or later and a GitHub-hosted runner. The publish job uses Node 24 and upgrades npm if it is older.
