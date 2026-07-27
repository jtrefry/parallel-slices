# Architecture package instructions

Architecture packages extend Parallel Slices without changing its orchestration
or safety model. Each package is a reviewed, versioned implementation of
`schemas/architecture-package.schema.json`.

Each architecture overlay must install a valid `.parallel-slices/config.json`
with an appropriate `sliceCompilation.sizingStrategy` default. The repository
may override that value before Product Plan approval. Architecture defaults may
change partitioning economics, but never the shared scope, gate, review,
determinism, retry, or final-audit contracts.

An architecture package owns:

- a generator that creates its repository shape;
- package-defined, non-secret generation options;
- an overlay containing only architecture-specific installed files;
- an installed verifier that checks both adopted and generated repositories;
- exact required-file declarations;
- optional public starter repository and template metadata;
- architecture-specific controller initialization adapters;
- root bootstrap instructions and project-document requirements; and
- tests proving successful generation and important refusal paths.

Fresh-project onboarding must identify Parallel Slices as the generator, link
to the canonical public workflow and mechanism documentation instead of
copying their explanation, list real clone prerequisites, and retain links to
the version-matched installed controller procedures required for execution.

The contract must remain open to web, mobile, desktop, CLI, scripts, services,
and future forms. Do not enumerate supported languages, frameworks, platforms,
cloud providers, database types, UI systems, or backend shapes in core code or
the shared schema. A package may contain no backend or deployment component.

Package options are public, durable architecture choices. Never use them for
credentials. Validate every option before creating a staging directory or
writing the target. Keep generation atomic and verification deterministic.

Architecture profiles are coherent variants of one package. Keep shared files
in the base overlay and declare profile exclusions and replacement overlays in
the manifest. A selected profile must resolve a complete component,
capability, quality-floor, instruction, installed-file, and verifier contract.
Use separate packages when workload shape or operating boundaries differ
substantially.

External company-owned packages use the same contract and conformance tooling
as bundled packages. Do not require central registration or the
`@parallel-slices` npm scope. Package loading must preserve exact identity,
profile, source type, manifest and complete package-content hashes, and options
without recording local machine paths or credentials.

Every bundled package must publish a public starter and keep the manifest's
`starter` URLs and the root architecture starter catalog aligned. The starter
must be generated specifically from that architecture; its template action
creates independent product repositories and is not a fork workflow. Private
or locally developed packages may omit public starter metadata.

Architecture overlays may not override core overlay paths. A collision is a
contract error and must be rejected before target writes. Architecture changes
are migrations, not installer upgrades; never silently replace the selected
architecture in `.parallel-slices/architecture.json`.

When adding or changing a package, update its manifest, required-file list,
generator, verifier, package docs, root template, and behavior-focused tests
together. Run the complete repository check, not only package tests.
