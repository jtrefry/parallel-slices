# Create an architecture package

Architecture packages let an organization define how it builds applications,
services, jobs, CLIs, mobile software, or other workloads without adding
private conventions to Parallel Slices. They are install-time packages, not
runtime plugins: each implements a validated generation, overlay,
initialization, quality, and verification contract.

No central registration is required. A package can remain in a private
repository or registry.

## Understand the artifacts

Use these terms consistently:

- **architecture package**: the versioned implementation containing the
  manifest, generator, overlays, verifier, instructions, and tests;
- **architecture profile**: a coherent package-owned variant such as
  `postgres` or `external-api-only`;
- **scaffold**: fresh-project files used by the package generator;
- **overlay**: files installed into both generated and adopted repositories;
  and
- **starter**: a repository materialized from one package profile and set of
  options.

The package contract is
[`schemas/architecture-package.schema.json`](../schemas/architecture-package.schema.json).
The lower-level contract and installation behavior are documented in
[Architecture packages](architecture-packages.md).

## 1. Describe the package

From the Parallel Slices repository root, copy the authoring example:

```bash
cp examples/architecture-packages/company-web-app.json \
  /tmp/company-web-app.architecture.json
```

Edit that copy. A complete starting configuration looks like:

```json
{
  "$schema": "https://parallelslices.com/schemas/architecture-package-authoring.schema.json",
  "version": 1,
  "id": "company-web-app",
  "packageName": "@example/parallel-slices-company-web-app",
  "packageVersion": "0.1.0",
  "displayName": "Company web application",
  "description": "A company-owned web application architecture.",
  "defaultProfile": "external-api-only",
  "components": [
    {
      "id": "web-application",
      "kind": "application",
      "technology": "Company web platform",
      "attributes": {
        "formFactor": "web"
      }
    }
  ],
  "capabilities": ["application:web", "data:external-api"]
}
```

Use synthetic public examples in a publishable package. Do not put internal
hosts, accounts, credentials, customer names, or secret identifiers in the
authoring configuration.

## 2. Create the package skeleton

Run the following from the Parallel Slices repository root:

```bash
npm run architecture-package -- create \
  --config /tmp/company-web-app.architecture.json \
  /absolute/path/to/company-web-app
```

Creation is atomic and refuses an existing target. It produces:

```text
company-web-app/
├── AGENTS.md
├── README.md
├── architecture.json
├── package.json
├── generator.mjs
├── scaffold/
├── repo-overlay/
│   ├── .parallel-slices/config.json
│   └── scripts/architecture/company-web-app/verify.mjs
├── tests/generator.test.mjs
└── templates/root-AGENTS.md
```

The generated scaffold and verifier are deliberately minimal, runnable
interfaces. They are not a production architecture. Replace them with the
organization's reviewed implementation and add behavior-focused tests before
publishing the package.

## 3. Implement the interfaces

### Manifest

`architecture.json` is the package source of truth. Keep these declarations
aligned:

- package identity and exact semantic version;
- components and namespaced capabilities;
- typed non-secret initialization options;
- profile definitions and the default profile;
- quality capability floors;
- generator and installed verifier paths;
- overlay directories and exact required-file inventories;
- root instructions and required project documents; and
- initialization commands for Cursor, Codex, and Claude Code.

Package names may use an organization scope such as
`@example/parallel-slices-company-web-app`; they do not need the
`@parallel-slices` namespace.

### Generator

`generator.mjs` must export:

```js
export function generateArchitecture(context) {
  // Generate only into context.target.
}
```

The context supplies:

- `target`: new staging target for the generated repository;
- `packageRoot`: resolved architecture package directory;
- `profile`: selected package profile;
- `options`: validated package options;
- `defaultController`: selected default controller;
- `runCommand`: deterministic command runner;
- `parent` and `stagingRoot`: bounded generation directories.

Validate inputs before writes. Do not deploy, publish, run a production
migration, mutate provider configuration, or write outside `context.target`.

### Overlay

The base overlay contains package files installed for every selected profile.
Its `requiredFiles` inventory must exactly match the physical overlay.

A profile may declaratively exclude base files and add a profile overlay. This
is appropriate when a coherent variant changes the quality configuration,
workflow, initialization guide, or architecture tooling. For example:

```json
{
  "profiles": {
    "default": "postgres",
    "definitions": {
      "postgres": {
        "description": "PostgreSQL data and migration contracts."
      },
      "external-api-only": {
        "description": "External APIs with no application database.",
        "capabilities": ["application:web", "data:external-api"],
        "overlay": {
          "excludeFiles": [
            ".parallel-slices/config.json",
            ".parallel-slices/sql-security.json"
          ],
          "directory": "profiles/external-api-only/repo-overlay",
          "requiredFiles": [".parallel-slices/config.json"]
        }
      }
    }
  }
}
```

The selected base and profile overlays must remain collision-free and together
install `.parallel-slices/config.json` plus the recorded verifier. Major
workload differences (such as a web application versus a Cloud Run job) usually
deserve separate architecture packages. Profiles should represent coherent
variants of one architecture, not unrelated products hidden behind switches.

### Verifier

The installed verifier must accept:

```text
inspect <absolute-target> [profile]
foundation <absolute-target> [profile]
```

`inspect` determines whether an existing repository is compatible before
installation. `foundation` enforces everything required for the package's
pre-push and CI boundary. A profile that excludes a capability should reject
residual package-owned artifacts for that capability.

### Tests

At minimum, test:

- valid and invalid manifests, options, and profiles;
- successful atomic generation;
- target-exists, unsafe-path, and symlink refusal;
- exact overlay inventories and collision refusal;
- each profile's selected and excluded files;
- adoption without unintended scaffold changes;
- generated README and root-instruction requirements;
- verifier success and important incompatibility failures;
- generated repository setup and quality execution; and
- npm, pnpm, Yarn, and Bun behavior unless the package documents a deliberate
  limitation.

## 4. Validate and inspect the package

Run these commands from the Parallel Slices repository root:

```bash
npm run architecture-package -- validate \
  /absolute/path/to/company-web-app

npm run architecture-package -- inspect \
  /absolute/path/to/company-web-app \
  external-api-only

npm run architecture-package -- test \
  /absolute/path/to/company-web-app
```

`validate` checks one resolved profile and its quality contract. `inspect`
prints the resolved components, capabilities, options, profiles, and installed
files. `test` validates every profile and verifies the generator interface.
These conformance checks supplement, rather than replace, the package's own
unit and isolated-generation tests.

## 5. Test local consumption

Place a creation configuration beside the package or in another controlled
working directory:

```json
{
  "$schema": "https://parallelslices.com/schemas/create-config.schema.json",
  "version": 1,
  "defaultController": "cursor",
  "architecture": {
    "source": {
      "type": "local",
      "path": "../company-web-app"
    },
    "profile": "external-api-only",
    "options": {
      "package-manager": "pnpm"
    }
  }
}
```

The local path must be relative to the creation configuration, keeping that
configuration portable. Generate into a new absolute target:

```bash
npm run bootstrap -- \
  --config /absolute/path/to/parallel-slices.create.json \
  /absolute/path/to/generated-project
```

The installed `.parallel-slices/architecture.json` records `source.type` as
`local`, the exact package version, manifest hash, profile, resolved options,
capabilities, quality floors, installed files, and a hash of the complete
package source excluding `.git` and `node_modules`. It intentionally does not
record the author's machine-specific package path. Use a published immutable
package for reproducible team generation.

## 6. Consume an npm package

Publish an exact version to the organization's npm registry and export
`./architecture.json` from its `package.json`:

```json
{
  "exports": {
    "./architecture.json": "./architecture.json"
  }
}
```

The generated skeleton is `"private": true` as a safe default. Remove that
field only through the organization's reviewed package-release change, and add
the intended registry, license, repository, files, and access policy before
publication.

Install the reviewed version with lifecycle scripts disabled in the directory
containing the creation configuration:

```bash
npm install --no-save --ignore-scripts \
  @example/parallel-slices-company-web-app@2.3.1
```

Then select it:

```json
{
  "$schema": "https://parallelslices.com/schemas/create-config.schema.json",
  "version": 1,
  "architecture": {
    "source": {
      "type": "npm",
      "package": "@example/parallel-slices-company-web-app",
      "version": "2.3.1"
    },
    "profile": "external-api-only",
    "options": {
      "package-manager": "pnpm"
    }
  }
}
```

Parallel Slices resolves the installed package, requires the manifest identity
to match the requested exact version, and records that npm source in the
generated repository. Registry authentication remains the package consumer's
responsibility and must not appear in either configuration.

## 7. Release safely

Before releasing:

1. Run the package's unit and isolated-generation tests.
2. Run `architecture-package validate`, `inspect`, and `test`.
3. Generate disposable repositories for every profile and supported package
   manager.
4. Run each generated repository's verifier and declared quality entry points.
5. Inspect the generated tree for credentials, private identifiers, absolute
   paths, undeclared files, and build output.
6. Publish an immutable exact version through the organization's reviewed
   release process.

An architecture package contains executable generator and verifier code. Treat
it as trusted build tooling: review changes, pin exact versions, install with
lifecycle scripts disabled, and grant registry access only where needed.
