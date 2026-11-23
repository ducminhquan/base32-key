# Releasing

Releases are automated by [`.github/workflows/release.yml`](workflows/release.yml). The workflow tags the version, runs the tests on Node 22, 24 and 26, uploads the package to npm as a [staged package](https://docs.npmjs.com/staged-publishing), and creates a GitHub release whose notes come from `CHANGELOG.md`.

A staged package is **not installable until a maintainer approves it** on the npm website with two-factor authentication. CI can never put a version live on its own.

The workflow authenticates with [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OpenID Connect). No npm token is stored in GitHub, and the package carries a [provenance statement](https://docs.npmjs.com/generating-provenance-statements).

## One-time setup on the npm website

1. Sign in, open the [base32-key package settings](https://www.npmjs.com/package/base32-key/access) and find **Trusted publishing**.
2. Click **Add trusted publisher**, choose **GitHub Actions** and fill in (fields are case sensitive):
   - Organization or user: `ducminhquan`
   - Repository: `base32-key`
   - Workflow filename: `release.yml`
   - Environment name: `npm`
   - Allowed actions: do not tick **npm publish** or **npm dist-tag**. `npm stage publish` is always allowed, and stage-only is what npm recommends.
3. Save. npm does not check the values when saving, so a typo only shows up as an `ENEEDAUTH` error when the workflow runs. An existing trusted publisher cannot be edited; delete it and add it again to change it.
4. Run the first release within 2 days. A new trusted publisher that has not completed a publish within 2 days expires and has to be added again.
5. After the first release is live, harden the package: under **Publishing access**, choose **Require two-factor authentication and disallow tokens**. Trusted publishing keeps working.
6. Delete any old `NPM_TOKEN` / `npm_token` secret from the GitHub repository settings and revoke that token on npm. It is no longer used.

Nothing needs to be configured in GitHub. The `npm` environment is created on the first run. The tag and the GitHub release are created with the built-in `GITHUB_TOKEN`.

## Cutting a release

1. Bump the version on `master`. `npm run bump` (commit-and-tag-version) updates `package.json`, `package-lock.json` and `CHANGELOG.md` from the commit messages and commits the result. Merge that commit to `master` (directly or through a pull request).
2. Start the release, either way:
   - **From GitHub:** _Actions → Release → Run workflow_, branch `master`, leave the tag empty. The workflow creates the tag `vX.Y.Z` from `package.json` on the latest `master` commit.
   - **From a terminal:** `npm run release` bumps, tags and pushes in one step; the tag push starts the workflow.
3. Approve the staged version: on the npm website open your account settings, **Staged Packages**, review `base32-key`, click **Approve** and confirm with 2FA. From a terminal the same is `npm stage list base32-key` then `npm stage approve <stage-id>` (npm 11.15.0 or later). To discard it instead, use **Reject** or `npm stage reject <stage-id>`.

To force a specific bump, use `npm run bump -- --release-as minor` (or `major`, `patch`, or an exact version).

## Safety checks

- Running the workflow on `master` fails if the tag for the `package.json` version already exists on another commit, so a forgotten version bump cannot overwrite a release.
- The workflow fails if the tag does not match the `version` in `package.json`.
- If that version is already live on npm, the staging step is skipped. Staging a version that is already waiting for approval fails; approve or reject the pending one first.
- If a GitHub release for the tag already exists, it is left untouched.
- To stage an existing tag again (for example after a rejected version or a trusted publisher fix), run the workflow and enter the tag.
- Staged publishing needs npm 11.15.0 or later and a GitHub-hosted runner. The publish job uses Node 24 and upgrades npm if it is older.

## Python and Go ports

[`.github/workflows/release-ports.yml`](workflows/release-ports.yml) releases the ports in `python/` and `go/`. Their versions are separate from the npm package.

### One-time setup on PyPI

1. Sign in to [pypi.org](https://pypi.org) (turn on two-factor authentication if it is not on yet).
2. Open [Your projects → Publishing](https://pypi.org/manage/account/publishing/) and fill in **Add a new pending publisher**, tab **GitHub**:
   - PyPI Project Name: `base32-key`
   - Owner: `ducminhquan`
   - Repository name: `base32-key`
   - Workflow name: `release-ports.yml`
   - Environment name: `pypi`
3. Click **Add**. The project `base32-key` is created on the first upload. A pending publisher does not reserve the name, so run the first release soon.
4. Recommended, so that every upload waits for you like a staged npm package: in GitHub, _Settings → Environments → pypi_ (it appears after the first run, or create it with **New environment**), tick **Required reviewers** and add yourself. You may also set **Deployment branches and tags** to `master` only.

Go needs no setup: a Go module is published by pushing a tag, and the Go module proxy picks it up.

### Cutting a release

1. Bump the version: `version` in `python/pyproject.toml` (with a line in `python/CHANGELOG.md`), and/or `Version` in `go/version.go` (with a line in `go/CHANGELOG.md`). Merge to `master`.
2. _Actions → Release ports → Run workflow_, branch `master`, target `both`, `python` or `go`.
3. Python: if the `pypi` environment has required reviewers, approve the **python-publish** job on the run page. The workflow tags `python/vX.Y.Z` and uploads to PyPI with attestations. A version that is already on PyPI is skipped.
4. Go: the workflow tags `go/vX.Y.Z` and asks proxy.golang.org to fetch it. It shows on [pkg.go.dev](https://pkg.go.dev/github.com/ducminhquan/base32-key/go) within a few minutes. Go module versions are permanent: a pushed tag cannot be replaced, only followed by a new version.

The Go module stays on major version 1. A breaking change would need the module path `github.com/ducminhquan/base32-key/go/v2`.
