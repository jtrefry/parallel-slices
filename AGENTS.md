# Parallel Slices contributor instructions

These instructions govern Parallel Slices in this
repository. Nested `AGENTS.md` files add rules for their directories. Preserve
the architecture, conventions, and quality level already established here.

## Quality standard

Every change must leave Parallel Slices cohesive, portable, secure, documented, and
covered by behavior-focused tests. Prefer one shared implementation over
similar logic in several scripts. A change is incomplete when it updates one
enforcement layer but leaves setup, verification, documentation, examples, or
tests inconsistent.

Before finishing, ask:

- Does the result work in a newly created repository for the selected
  architecture rather than only in this checkout?
- Is there one predictable source of truth for the behavior?
- Does failure occur early, safely, and with an actionable message?
- Do tests prove both the successful path and the important refusal path?
- Would a new maintainer understand how to install, operate, and extend it?

## Repository structure

Keep each concern in its established location:

| Path                                               | Responsibility                                                 |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `repo-overlay/`                                    | Architecture-neutral files installed into every repository     |
| `repo-overlay/scripts/parallel-slices/`            | Dependency-light runtime, quality, and setup logic             |
| `architectures/`                                   | Versioned generators, overlays, verifiers, templates, and docs |
| `architectures/nextjs-gcp-postgres/`               | Bundled Next.js, Mantine, PostgreSQL, and GCP package          |
| `schemas/architecture-package.schema.json`         | Architecture package contract                                  |
| `repo-overlay/.parallel-slices/config.schema.json` | Shared quality-configuration contract                          |
| `repo-overlay/.parallel-slices/repository.json`    | Local-only or named GitHub publication authorization           |
| `repo-overlay/.agents/skills/`                     | Thin Codex-native adapters                                     |
| `repo-overlay/.claude/skills/`                     | Thin Claude Code-native adapters                               |
| `repo-overlay/.cursor/`                            | Thin Cursor-native commands, rules, and adapters               |
| `repo-overlay/docs/parallel-slices/`               | Canonical workflows shared by every agent                      |
| `repo-overlay/docs/plans/`                         | Slice-plan, state, and scope-manifest contracts                |
| `repo-overlay/docs/releases/`                      | Developer release-note rules and templates                     |
| `repo-overlay/docs/testing/manual/`                | Manual UAT and DEV/QA instructions and scripts                 |
| `scripts/`                                         | Parallel Slices installation and verification commands         |
| `tests/`                                           | Unit and isolated installation/integration coverage            |
| `docs/`                                            | Documentation for adopting and operating Parallel Slices       |
| `examples/`                                        | Optional starting points that are not installed automatically  |

Files required in every target belong in `repo-overlay/`. Files required only
by one architecture belong in that package's `repo-overlay/`. Do not put
installed files in `examples/` or the project's own `docs/` tree. If a
directory contains generated working documents, put its local instructions in
that directory so they apply at creation time.

## Before changing anything

1. Read this file and every more-specific `AGENTS.md` governing the paths.
2. Search the complete codebase for the behavior, configuration key, filename, and
   documentation before adding another implementation.
3. Identify the source of truth and every consumer that must remain aligned.
4. Inspect existing tests for the intended public behavior and refusal cases.
5. Keep the change narrowly scoped. Do not refactor adjacent code without a
   demonstrated need.

## Implementation rules

- Reuse the utilities in `project-quality.mjs`; do not reimplement package
  manager detection, branch validation, configuration validation, or command
  selection elsewhere.
- Keep the scope gate, quality runner, Husky hooks, and GitHub Quality workflow
  driven by the selected architecture's `.parallel-slices/config.json` wherever
  the same policy applies.
- Keep orchestration, state, review, scope, Git, and safety policy independent
  of application type, language, framework, operating system, backend, and
  deployment provider. Architecture packages own those assumptions.
- Never add framework or provider conditionals to the core installer. Extend
  the validated architecture contract and add a package instead.
- Treat `.parallel-slices/architecture.json` as the immutable installed selection.
  Refuse implicit architecture changes; require an explicit migration.
- Keep quality steps package-script based and pipeline composition declarative.
  Branch, scope, stage, secret, and release-note enforcement is not a
  configurable pipeline step and must not be weakened through project JSON.
- Keep installed scripts dependency-free when practical so preflight and setup
  can run before target dependencies are installed.
- Keep all supported controllers enabled in `.parallel-slices/agent.json`; its
  default is a convenience, not exclusive ownership. Native adapters must
  validate enablement and remain thin wrappers around shared workflows. Each
  sliced run has one controller in durable state and one ignored local lease.
- Preserve npm, pnpm, Yarn, and Bun support unless a file is explicitly and
  clearly labeled as package-manager-specific.
- In `nextjs-gcp-postgres`, treat Docker Desktop as the supported local container
  runtime. Document Rancher Desktop with `dockerd (moby)` only as a free,
  best-effort alternative; do not imply Google Cloud validation or guaranteed
  compatibility.
- Support macOS and Linux. Avoid GNU-only shell assumptions and resolve symlinks
  when entry-point identity matters.
- Use deterministic, non-interactive, CI-safe commands. Tests must not enter
  watch mode or rely on a developer's global state.
- Validate inputs before writing. Refuse unsafe, malformed, protected-branch,
  or overwrite operations before making partial changes.
- Make setup idempotent where possible. When safe idempotence is impossible,
  stop with an exact recovery instruction.
- Never weaken a gate merely to make a fixture or check pass. Fix the behavior,
  fixture, or documented prerequisite.
- Keep functions focused, names explicit, error messages actionable, and files
  small enough to review comfortably.

## Cross-cutting change checklist

When adding or changing an installed capability, review all of these surfaces:

1. The shared implementation in `repo-overlay/` or the selected package overlay.
2. The selected package's generator, scaffold, verifier, and root instructions
   when generated repositories differ from adopted repositories.
3. The architecture overlay's `.parallel-slices/config.json` when it is policy or
   check configuration.
4. `scripts/install.sh`, `scripts/setup.sh`, and `scripts/verify.sh`.
5. The installed plan, release, test, and agent instructions that consume it.
6. The README package inventory and relevant operating documentation.
7. Unit tests for pure behavior and invalid input.
8. Integration tests proving installation into an isolated temporary Git
   repository and enforcement from the target's perspective.
9. GitHub workflows and Husky hooks when the quality boundary changes.

Do not duplicate a copied-file allowlist in the installer. Core and architecture
overlays are the installation sources of truth; the core verifier list and each
architecture manifest's explicit `overlay.requiredFiles` list are the
installation completeness contracts.

## Testing and evidence

Every behavior change needs the smallest meaningful automated test at the
correct boundary:

- Unit tests for parsing, policy decisions, matching, and refusal logic.
- Integration tests for copying the overlay, activating Husky, detecting the
  package manager, executing gates, and rejecting unsafe Git operations.
- Syntax and static validation for shell scripts, JavaScript modules, JSON,
  workflow YAML, Markdown links, and Mermaid source when changed.
- A portability and secret scan over the whole codebase before handoff.

Tests must assert observable outcomes. Avoid snapshots or assertions that only
repeat implementation details. For every new success path, consider malformed
input, protected branches, missing dependencies, overwrite safety, partial
setup, and direct push bypass attempts.

Run at minimum after changing Parallel Slices:

```bash
npm run check
```

Also run `node --check` for every changed `.mjs` file, parse every changed
workflow as YAML, check local Markdown links, and scan for credentials, private
names, absolute machine paths, `.DS_Store`, build output, coverage output, and
other generated files. Report exactly what was and was not run.

## Documentation and templates

- Keep documentation procedural and copy-paste safe. Commands must state their
  working directory and must not imply that destructive or production actions
  are automatic.
- Keep the README's package tree synchronized with required overlay files.
- Keep examples generic and obviously placeholder-based. Do not include a
  private product's terminology, IDs, hosts, accounts, or architecture.
- Keep fresh-project UI defaults in the selected architecture's `scaffold/`,
  not an overlay, so adopting an existing repository never silently changes
  its design system.
- Links in installed files must resolve after installation, not only from this
  Parallel Slices checkout.
- When changing a template contract, update its local `AGENTS.md`, its example,
  the plan or workflow that references it, and the installation test.
- Manual testing supplements automated unit, integration, and E2E tests. It
  never replaces them.

## Security and delivery

- Never place credentials in examples, fixtures, output, or workflow files.
  Use secret references and short-lived Workload Identity Federation.
- Grant only the permissions needed by each workflow or job.
- Never expose server-only environment variables to Next.js client bundles.
- Use immutable image identifiers for releases and keep deployment separate
  from the implementation run controller.
- The bundled `nextjs-gcp-postgres` package's production baseline is Cloud Run services,
  Cloud SQL for PostgreSQL, Artifact Registry, Secret Manager, and Cloud Run
  Jobs invoked by Cloud Scheduler. Do not introduce Cloud Functions into that
  package. Other packages own and enforce their reviewed production boundary.
- Never execute a production deployment or database migration while developing
  or testing Parallel Slices.
- Never bulk-install third-party agent skills. Pin reviewed source commits,
  verify content hashes, exclude external-action skills, and preserve provenance.

## Portability and privacy

- Do not mention or depend on a particular company, product, customer, private
  repository, local username, or absolute machine path.
- The only exception is maintainer-approved repository ownership metadata in
  the Parallel Slices root `package.json` and `.github/CODEOWNERS`. Never copy that
  metadata into `repo-overlay/`, examples, generated applications, or logs.
- Do not assume a particular app name, workspace layout, test runner, cloud
  project ID, region, service name, or database name in the core. A package may
  enforce only the assumptions declared by its manifest and documentation.
- Use synthetic data and reserved example domains in tests and examples.
- Keep logs concise and free of environment secrets or repository contents not
  needed to diagnose the failure.

## Git policy

- Never commit, push, or merge directly to `main`, `master`, or another
  protected branch. Do not fast-forward a protected branch locally and do not
  invoke a GitHub merge through the CLI, API, or UI.
- Every change must reach a protected branch through a GitHub pull request from
  a non-protected branch. Required checks and repository review rules must pass;
  leave the final merge to an authorized maintainer. Treat a request to merge
  as a request to prepare or update the pull request, not as permission to merge
  the protected branch.
- Use GitHub-compatible `<type>/<short-kebab-description>` branch names that
  match the selected architecture's `.parallel-slices/config.json`. Use a
  lowercase allowed type such as `feature`, `feat`, `fix`, `bugfix`, `hotfix`,
  `chore`, `release`, `docs`, `test`, `refactor`, `perf`, `ci`, or `build`, then
  a short lowercase kebab-case description; for example,
  `docs/update-readme-review-images`. Reserved automation prefixes such as
  `dependabot/` and `renovate/` may be used only by their corresponding
  automation.
- Do not commit, push, open a pull request, deploy, or run a migration unless
  the user explicitly authorizes that specific action.
- Never force-push, bypass required checks, rewrite shared history, or discard
  unrelated work.
- Local hooks are a fast feedback layer, not the security boundary. GitHub
  branch protection and required CI checks remain mandatory.

## Definition of done

A Parallel Slices change is complete only when:

- the implementation follows the established source-of-truth pattern;
- installed files, setup, verification, docs, examples, and tests agree;
- npm, pnpm, Yarn, and Bun behavior remains intact or a limitation is explicit;
- safe and unsafe paths have automated coverage;
- all applicable checks pass with no ignored failures;
- no private, generated, temporary, or machine-specific files remain; and
- the handoff states the exact behavior changed, validation performed, and any
  known limitation without overstating confidence.
