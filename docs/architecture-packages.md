# Architecture packages

Parallel Slices separates its governed AI development loop from the software it
builds. The core owns planning, slices, Ready Slices, worktrees, quality execution,
review evidence, Git policy, and repository publication. A selected architecture
package owns the application and platform assumptions.

The first bundled package is `nextjs-gcp-postgres`. It preserves the existing Next.js
Turborepo, Mantine, PostgreSQL, and Google Cloud behavior while proving the
package boundary against a complete production-oriented architecture.

## Contract

Every package has an `architecture.json` validated against
[`schemas/architecture-package.schema.json`](../schemas/architecture-package.schema.json).
The contract supplies:

- an unconstrained component inventory with package-defined kinds,
  technologies, and attributes;
- namespaced capabilities;
- typed, non-secret generator options;
- architecture-specific quality capability floors;
- an architecture-appropriate slice-sizing default in the installed project
  configuration;
- one generator module;
- one collision-free base overlay, optional profile overlays, and explicit
  installed-file contracts;
- one verifier used from both the package source and installed repository;
- package-owned CI, dependency-update, security, and delivery files when those
  capabilities apply;
- optional public starter-repository and one-click template URLs;
- architecture-specific initialization commands and root instructions; and
- the complete project-document set required before implementation.

Core code does not interpret component kinds or technologies. A package can
therefore describe a React SPA with any service boundary, a .NET web system,
Android or iOS software with or without a backend, a desktop application, a
script, a CLI, or a future form without adding a special case to the installer.

All generated repositories currently include the Node-based Parallel Slices
control plane and express quality work through root package scripts. A
non-JavaScript package can use those scripts as deterministic adapters for
commands such as `dotnet`, Gradle, Xcode tooling, Cargo, Python, or native build
systems; the product implementation itself does not need to use Node.js.

## Selection and reproducibility

Create a project with a checked-in or reviewed creation configuration:

```json
{
  "$schema": "https://parallelslices.com/schemas/create-config.schema.json",
  "version": 1,
  "architecture": {
    "source": {
      "type": "bundled",
      "id": "nextjs-gcp-postgres"
    },
    "profile": "external-api-only",
    "options": {
      "package-manager": "pnpm"
    }
  }
}
```

```bash
npm run bootstrap -- \
  --config /absolute/path/to/parallel-slices.create.json \
  /absolute/path/to/project
```

The generated repository records the exact package identity, version, manifest
hash, source type, profile, components, capabilities, resolved options, quality
floors, verifier, controller commands, and required project documents in
`.parallel-slices/architecture.json`.

Creation sources may select a bundled package, a relative local package
directory, or an exact installed npm package. Packages maintained outside this
repository use the same manifest validation, path safety, overlays, installed
profile, and verifier contract as bundled packages. No central registration is
required.

The package overlay also installs `.parallel-slices/config.json`, whose
`sliceCompilation.sizingStrategy` is the default for newly generated or adopted
repositories. Projects may choose `isolation-first` or
`throughput-balanced` before Product Plan approval. This affects only semantic
partitioning; every architecture retains the same core safety and evidence
contracts.

Re-running setup is idempotent only for the same selection. Switching packages
or profiles is an architecture migration and is refused by normal
installation.

## Profiles

An architecture profile is a coherent variant of one package. A profile may
replace the resolved component and capability inventory, quality floors,
project documents, root instructions, and selected architecture overlay files.
The base and selected profile overlays are validated as one collision-free
installed file plan.

The bundled `nextjs-gcp-postgres` package demonstrates two profiles:

- `postgres`, the default, installs PostgreSQL, SQL security, migration, Cloud
  SQL, and PostgreSQL-backed CI contracts; and
- `external-api-only`, which installs no application database, SQL scanner,
  migration framework, PostgreSQL CI service, Cloud SQL configuration, or
  database quality floor.

Profiles should not disguise unrelated workload types. A company web
application and a company Cloud Run job generally belong in separate
architecture packages, while PostgreSQL and external-API-only variants of the
same web architecture can be profiles.

## Optional starter repositories

No bundled architecture publishes a starter repository. Every project is
generated from a checkout with `npm run bootstrap --`, which is the single
supported creation path and always produces the reviewed current package
output.

A package may still declare an optional `starter` object with a public
`repositoryUrl` and one-click `templateUrl` when its owner chooses to publish a
generated template repository. The field is optional in the package contract, so
a private or locally developed package needs no public repository. An owner who
publishes one must enable GitHub's **Template repository** setting for the
creation link to work, and must regenerate it whenever the package changes;
a stale template silently ships an old baseline.

## Adding a package

Use the supported creation and conformance workflow in
[Create an architecture package](creating-architecture-packages.md). It covers
company-owned packages, the authoring configuration, generated interfaces,
profiles, validation, local consumption, exact npm consumption, tests, and
release safety.

Create `architectures/<id>/` with:

```text
architecture.json
package.json
generator.mjs
repo-overlay/
templates/root-AGENTS.md
```

The generator must export `generateArchitecture(context)`. It receives a new
staging target, resolved package options, the selected default controller, and a
deterministic command runner. It must not write outside that staging target or
perform deployment, publication, production migration, or unrelated external
actions.

A fresh-project generator must also produce concise onboarding that identifies
Parallel Slices as the generator, links directly to the canonical public
[workflow](../README.md#understand-the-model) and
[mechanism map](mechanism-map.md), lists the package's real clone prerequisites,
and directs each enabled controller to its version-matched installed operating
adapter. Shared lifecycle explanations belong in the public documentation, not
in every generated README; exact agent execution contracts remain installed
with the project version they govern.

The verifier must accept these commands:

```text
inspect <absolute-target>
foundation <absolute-target>
```

`inspect` checks whether an existing repository is compatible before the
overlay is installed. `foundation` enforces every package prerequisite required
for pre-push and CI. Failures must explain the missing or unsafe condition.

Architecture overlays cannot replace core paths. The installer resolves every
source and target path, rejects symlinks and collisions before writing, then
copies the core, package base, and selected profile overlays as one plan.

CI is deliberately an architecture file rather than a core template. A package
can select Linux, macOS, Windows, mobile SDKs, service containers, scanners, and
deployment tooling without adding provider or platform branches to core code.
Its dependency-update configuration can likewise include the ecosystems used
by that package. Parallel Slices' own Dependabot configuration must monitor each
bundled package's scaffold manifest and embedded workflow directory; the
repository audit rejects missing architecture-source coverage.

Tests for a new package must cover at least:

- manifest and option validation;
- successful atomic generation;
- adoption without unintended scaffold replacement;
- installed-file completeness;
- framework or platform drift;
- missing generated-project attribution, canonical documentation, or clone
  prerequisites;
- unsafe paths and symlinks;
- overlay collisions; and
- missing foundation dependencies.

### Verify its generated output and documentation

Complete these steps in the architecture's pull request so implementation and
reader guidance cannot drift:

1. Generate a project from the reviewed package using its recommended defaults;
   do not hand-maintain a second scaffold implementation.
2. Verify `.parallel-slices/generated-baseline.json`, then run the package's
   declared `generatedBaseline` pipeline. This path accepts only the complete,
   byte-for-byte generated tree; any edit requires normal initialization.
3. Verify that the generated root README attributes Parallel Slices, links to
   the canonical public workflow and mechanism map, lists its real
   prerequisites, and retains version-matched local controller instructions.
4. Add one row to the bundled creation configurations table in the root
   `README.md` with the configuration path and its stack summary.
5. Link the package's operating documentation from the documentation index.
6. Run `npm run check`.
