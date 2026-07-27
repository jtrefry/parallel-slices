# Compatibility and portability

## Supported agent controllers

Parallel Slices keeps lifecycle control native to each supported agent while using
one canonical slice procedure and one neutral runtime.

| Controller  | Plan command            | Short alias    | Native control | Project instructions                        | Native skills     |
| ----------- | ----------------------- | -------------- | -------------- | ------------------------------------------- | ----------------- |
| Cursor      | `/parallel-slices-plan` | `/slices-plan` | `/loop`        | `AGENTS.md` and `.cursor/rules/`            | `.cursor/skills/` |
| Codex       | `$parallel-slices-plan` | `$slices-plan` | `/goal`        | `AGENTS.md`                                 | `.agents/skills/` |
| Claude Code | `/parallel-slices-plan` | `/slices-plan` | `/goal`        | `AGENTS.md` imported by `.claude/CLAUDE.md` | `.claude/skills/` |

All supported controllers are enabled in `.parallel-slices/agent.json`, which
records the default controller as a convenience. Adapter entry points validate
enablement. Each JSON run state and ignored local lease names its one actual
controller. All controllers follow
`docs/parallel-slices/run-sliced-plan.md`, so scope, tests, terminal markers, release
evidence, and stop conditions do not drift between products.

All project-owned public commands use the `parallel-slices-` namespace and have
matching `slices-` aliases. `/loop` and `/goal` are platform-owned controls, not
Parallel Slices commands.

Only one native controller may own a particular run. Workers receive fresh
contexts and separate detached worktrees, so ready slices can build in parallel
without sharing a checkout. The root alone integrates serially on the goal
branch. Run handoff requires a clean boundary with no active workers.

## Portable design

Parallel Slices applies these repository-independent principles:

- a human-readable plan approved before its optimized manifest DAG;
- committed scope manifests and stop-before-expansion rules;
- one local commit per accepted slice and one branch and pull request per goal;
- durable slice state and required release-note classification;
- ignored per-attempt recovery ledgers and one shared read-only progress report;
- deterministic scope and quality gates;
- one leased root controller, fresh bounded workers, and serial integration; and
- native adapters that contain no product policy.

The core implementation is architecture-neutral:

| Responsibility        | Implementation                                                  |
| --------------------- | --------------------------------------------------------------- |
| Scope enforcement     | Dependency-light Node.js gate                                   |
| Quality orchestration | Architecture-declared floors and JSON-composed package scripts  |
| Local Git gates       | Husky pre-commit and pre-push hooks                             |
| GitHub automation     | Authenticated `gh` CLI for repository, PR, and CI lifecycle     |
| Branch safety         | Protected-branch rejection and convention validation            |
| Readiness             | Monotonic initialization, contract, and foundation stages       |
| Release notes         | Developer fragments validated per executable slice              |
| Agent review          | Optional Codex, Claude Code, Antigravity, or Cursor CLI workers |
| Architecture          | Immutable package identity, options, files, and verifier        |
| CI and delivery       | Supplied by the selected architecture package                   |

The selected package owns the generated repository shape, application
toolchain, package-manager requirements, CI runner and services, deployment
model, and platform-specific verification. See
[Architecture packages](architecture-packages.md).

## Bundled `nextjs-gcp-postgres` package

The currently bundled `nextjs-gcp-postgres` package uses the following concrete
implementation:

| Responsibility   | Implementation                                          |
| ---------------- | ------------------------------------------------------- |
| Quality checks   | Root scripts normally backed by Turbo tasks             |
| Package manager  | Exact npm, pnpm, Yarn, or Bun declaration               |
| CI               | Package-manager-aware GitHub Quality workflow           |
| Delivery         | Artifact Registry to Cloud Run; Cloud SQL in `postgres` |
| Scheduled work   | Cloud Run Jobs invoked by Cloud Scheduler               |
| Local containers | Docker Desktop; Rancher Desktop Moby is best effort     |

### Supported repository shape

The target must have a root `turbo.json` or `turbo.jsonc`, a root package that
declares Turbo, at least one package that declares Next.js, and root scripts for
Prettier, lint, type checking, build, unit tests, integration tests, E2E, and
Trivy. The `postgres` profile additionally requires SQL security plus `pg`,
`tsx`, and `@types/pg` at the repository root. The `external-api-only` profile
prohibits those database dependencies and package-owned database artifacts.

App Router, Pages Router, multiple Next.js apps, shared workspace packages, and
any test runner exposed by those root scripts are supported. Parallel Slices does
not prescribe Jest, Vitest, Playwright, or Cypress.

Fresh projects created by `npm run bootstrap --` have a narrower UI baseline:
one `apps/web/` App Router application, root repository documentation under
`docs/`, exact reviewed Next.js and React versions, Mantine Core and Hooks, and
no Tailwind. The generated
`.parallel-slices/scaffold-profile.json` makes that baseline verifiable. Installing
the controls into an existing Turborepo does not add Mantine, remove Tailwind,
or otherwise change its chosen UI system.

Installers and hooks support macOS and Linux. WSL2 can use the Linux path when
the repository is stored in its filesystem. Native PowerShell installation is
not supported. Node.js 22 LTS and 24 LTS are supported; Node.js 24 is the
generated-project and CI default.

pnpm and Yarn run through Corepack. Temporary staging-only Corepack shims make
the selected manager discoverable to the pinned upstream generator, and the
installed `corepack-runner.mjs` provides the same isolated environment to
Turbo and other child processes. Neither path requires or creates a global
shim. npm and Bun use the exact `packageManager` version. Conflicting lockfiles
are rejected.

In an already-installed repository on native Windows, the Node.js tooling uses
platform-correct containment checks and invokes `corepack.cmd` through
`cmd.exe` without shell mode. From the repository root, these commands must
succeed when their normal project prerequisites are present:

```powershell
node scripts/parallel-slices/corepack-runner.mjs pnpm --version
node scripts/parallel-slices/doctor.mjs --initialized
```

This native command support does not change the separate limitation above:
installation from PowerShell remains unsupported, and WSL2 remains the
documented Windows installation path.

This package does not adopt non-Turbo repositories or single-package
repositories without its required root contracts. Other package types can
provide different generators and verifiers without changing the core.

## Gate tiers

Three bounded planning stages are allowed before the full quality foundation
exists: a human-approved Product Plan commit, a separate AI-compiled execution
commit, and the generated independent AI planning-review pair. The
initialization gate validates project
documents, installed controls, staged secrets, whitespace, branch policy, the
plan/compiled boundary, and every already-available check. Neither stage can
include application paths in an adopted repository.

The selected architecture declares the minimum capabilities for pre-commit,
pre-push, CI, and each slice loop. Its `.parallel-slices/config.json` maps those
capabilities to deterministic package scripts. The bundled `nextjs-gcp-postgres`
pipeline runs formatting, lint, TypeScript, SQL security, a production build,
and unit tests before commit. Its full pipeline adds integration, E2E, and
Trivy; Turbo remains responsible for dependency graphs, caching, package
selection, and parallel execution.

## Limitations

- New compiled runs require version 5 JSON state with `planCommit`, a pinned
  slice-compilation input snapshot, sizing rationale, exact dependency
  rationale, and evidence that an all-serial graph survived the mandatory
  decomposition challenge. Existing version 3 and version 4 runs remain
  executable so an upgrade cannot discard accepted work, but they
  cannot be used for a newly compiled goal. Version 2 and earlier runs require
  re-planning; the installer never rewrites run history.
- Script names, pipeline membership, and lifecycle entry-point mappings must be
  declared in `.parallel-slices/config.json`.
- Integration and E2E environment setup must live in root scripts.
- Coverage policy is project-specific and can be added as a required check.
- Probabilistic review never replaces human review before merge.
- Review provider availability, subscription inclusion, model selection,
  quotas, and billing remain controlled by provider CLIs and their accounts.
- Interactive authentication can be resumed safely; non-interactive review
  refuses to wait. Antigravity is a review worker, not a lifecycle controller.
- A local `/loop` or `/goal` can end when its owning session closes or stops.
- Local hooks are bypassable; GitHub rulesets and required CI are mandatory.
- The Cloud Run workflow needs project-specific IAM, WIF, Artifact Registry,
  variables, and environment protection. The `postgres` profile additionally
  needs Cloud SQL and its Secret Manager configuration.
- Docker Desktop is the supported local container path. Rancher Desktop may
  work with `dockerd (moby)` but is best effort.

## Controller references

Upstream documentation for the supported controllers and skill formats:

- [Cursor project rules](https://docs.cursor.com/context/rules)
- [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript)
- [Codex long-running work and `/goal`](https://learn.chatgpt.com/docs/long-running-work)
- [Claude Code `/goal`](https://code.claude.com/docs/en/goal)
- [Antigravity CLI](https://antigravity.google/docs/cli-getting-started)
- [Agent Skills standard](https://agentskills.io/home)
- [Vercel agent skills](https://github.com/vercel-labs/agent-skills)
