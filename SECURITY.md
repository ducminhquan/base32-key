# Security policy

## Supported versions

Security fixes go into the latest major version of `base32-key` on npm.

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. You will get a reply within 7 days.

## How releases are protected

- Releases are built by GitHub Actions and published with [npm trusted publishing](https://docs.npmjs.com/trusted-publishers): no npm token is stored anywhere.
- Every version carries a [provenance statement](https://docs.npmjs.com/generating-provenance-statements) that links it to the commit and workflow run that built it. Check it with `npm audit signatures`.
- A new version is uploaded as a [staged package](https://docs.npmjs.com/staged-publishing) and goes live only after a maintainer approves it on npm with two-factor authentication.
- GitHub Actions are pinned to commit SHAs and kept up to date by Dependabot.
- The package has no runtime dependencies.
