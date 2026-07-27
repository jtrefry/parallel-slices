# `nextjs-gcp-postgres` architecture package

This is the bundled, versioned architecture for Next.js applications deployed
to Google Cloud. It owns every Next.js, Turborepo, Mantine, Trivy, and Google
Cloud assumption installed by Parallel Slices, plus the data-layer contracts
selected by its profile.

The package contains:

- `architecture.json`: public package identity, options, components,
  capabilities, quality floors, installed-file inventory, and controller entry
  points;
- `generator.mjs`: atomic fresh-project generation using the exact pinned
  `create-turbo` dependency;
- `configure-scaffold.mjs` and `scaffold/`: the exact generated Next.js and
  Mantine baseline, complete direct-dependency inventory, package-manager pins,
  Cursor Agent CLI review profile, and compatibility holds;
- `repo-overlay/`: the default package overlay, including initialization
  adapters, dependency-update policy, CI and delivery workflows, PostgreSQL
  migration and security tooling, and the installed architecture verifier;
- `profiles/external-api-only/`: profile replacements for quality, delivery,
  initialization, and root instructions without database features; and
- `templates/root-AGENTS.md`: bootstrap instructions for generated and adopted
  repositories.

## Supported use

Fresh generation supports npm, pnpm, Yarn, and Bun through the
`package-manager` option and provides two profiles:

- `postgres` is the default and includes PostgreSQL, ordered migrations, SQL
  security, a PostgreSQL CI service, and Cloud SQL delivery configuration.
- `external-api-only` uses external APIs and includes no application database,
  database dependency, SQL security step, migration tooling, PostgreSQL CI
  service, or Cloud SQL delivery configuration.

Adoption verifies an existing Next.js Turborepo against the selected profile
but does not apply the fresh-project UI scaffold, add Mantine, or remove
Tailwind.
For a fresh start, generate a project from a Parallel Slices checkout with
`npm run bootstrap --`, which selects the package manager, controller default,
profile, and local package revision.

Use the package's checked-in creation examples from the repository root:

```bash
npm run bootstrap -- \
  --config examples/create/nextjs-gcp-postgres.json \
  /absolute/path/to/postgres-project

npm run bootstrap -- \
  --config examples/create/nextjs-gcp-external-api-only.json \
  /absolute/path/to/external-api-project
```

The generated root README identifies Parallel Slices as its source, links to
the canonical public workflow and mechanism documentation, lists the actual
clone prerequisites, and keeps only version-matched controller operation links
local to the generated repository. Fresh generation retains `apps/web/` as the
only starter application, removes the upstream `apps/docs/` application, and
uses root `docs/` only for repository documentation.

The installed `.parallel-slices/config.json` defaults slice compilation to
`throughput-balanced` because the architecture's integrated pipeline includes
build, integration, E2E, and repository security work. A project may select
`isolation-first` before Product Plan approval without weakening any quality or
safety boundary. Both strategies begin with a dependency-minimal concurrency
pass; a non-trivial all-serial graph requires a second decomposition challenge
and an evidence-backed exception when no safe parallel pair exists.

The package's `inspect` verifier establishes compatibility before installation.
Its stricter `foundation` mode enforces the dependencies and repository
contracts required by pre-push and CI, including activation of routine weekly
dependency updates after initialization. The package owns its complete Quality
workflow, including the pinned PostgreSQL service and Trivy setup, so the core
orchestrator remains usable by architectures that need a different operating
system, toolchain, service set, or CI design.

See [Architecture packages](../../docs/architecture-packages.md) for the shared
contract and
[Create an architecture package](../../docs/creating-architecture-packages.md)
for the supported company-package authoring and conformance process.
