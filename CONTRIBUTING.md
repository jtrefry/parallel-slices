# Contributing

Thank you for improving Parallel Slices. Changes should
make the installed experience safer, clearer, more portable, or more capable
without weakening its scope controls.

## Before starting

1. Read [`AGENTS.md`](AGENTS.md) completely.
2. Create a convention-compliant branch such as
   `fix/resumable-setup` or `docs/clarify-local-testing`.
3. Search for the existing source of truth before adding new logic.
4. Keep one pull request focused on one coherent outcome.

Never commit or push directly to `main`. Do not include credentials, private
repository names, customer data, or machine-specific paths.

## Development

The installed runtime scripts remain dependency-light. This repository uses
locked development dependencies for ESLint, Prettier, and workflow parsing.
Use Node.js 22 or 24 LTS (24 recommended) and run, from the repository root:

```bash
npm ci --ignore-scripts
npm run check
```

`npm ci --ignore-scripts` is the same install command the Quality workflow
uses; the flag skips dependency lifecycle scripts, which this repository's
tooling does not need.

Changes to installed behavior normally require updates to all applicable
surfaces:

- the implementation under `repo-overlay/`;
- installation and verification scripts;
- unit and isolated installation tests;
- README package inventory and operating documentation;
- plan, release, manual-testing, Husky, and CI contracts that consume it.

## Pull requests

Describe the user-visible outcome, scope, security implications, validation,
compatibility, and rollback approach. Include exact commands and concise
results. A pull request is not ready when required tests are skipped without a
documented reason.

Maintainers may ask for a smaller change when a pull request combines unrelated
policy, infrastructure, and implementation work.

## Contributions and license

Unless explicitly stated otherwise, contributions submitted for inclusion in
this repository are licensed under the
[Apache License 2.0](LICENSE), consistent with the repository license.
