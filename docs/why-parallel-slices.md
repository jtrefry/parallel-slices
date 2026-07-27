# Why start with a bundled architecture

A normal application starter gives you source files. Parallel Slices creates a
separate repository with the operating system an AI coding agent needs to build
and maintain serious software: explicit product discovery, approved
slice-based plans, bounded implementation loops, configurable quality gates,
and safe Git rules. The bundled `nextjs-gcp-postgres` package adds a defined
path to Cloud Run plus either PostgreSQL migration contracts or an
external-API-only profile.

## What you gain

- **Move from idea to implementation without becoming the scaffolding team.**
  Your chosen controller interviews you, writes the project contract and plan,
  then creates every engineering artifact required by the approved work.
- **Make AI autonomy reviewable.** Every implementation loop works from a
  committed graph. Fresh workers complete bounded candidates in isolated
  worktrees; the root records durable state and creates traceable accepted
  commits on the goal branch.
- **Apply the same definition of quality everywhere.** The loop, Husky hooks,
  and GitHub Actions resolve the same JSON-configured pipelines instead of
  maintaining four drifting checklists.
- **Start with production concerns already represented.** The selected package
  owns its database safety, security checks, integration environment, delivery
  boundary, and platform prerequisites. The current `nextjs-gcp-postgres` package
  includes PostgreSQL migration safety, SQL scanning, Trivy, container-backed
  tests, Cloud Run delivery, Cloud SQL, jobs, scheduling, secrets, and Workload
  Identity.
- **Keep humans in control of consequential actions.** Agents cannot silently
  expand approved scope, work directly on `main`, merge their own PRs, deploy,
  run production migrations, or seize another controller's active run. A named
  GitHub repository profile grants only goal-branch publication and CI
  monitoring.
- **Choose the controller without choosing a different architecture.** Cursor,
  Codex, and Claude Code use native commands backed by the same shared planning,
  quality, security, and delivery contracts.

## What the bundled `nextjs-gcp-postgres` architecture provides on day one

| Foundation           | Included value                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Application          | Pinned Turborepo generation, a reviewed Next.js and React baseline, strict TypeScript, and App Router                           |
| UI                   | Mantine Core and Hooks, SSR-safe color schemes, a shared UI package, and no Tailwind                                            |
| AI development       | Human-first plans, optimized slice DAGs, durable state, crash-recoverable attempt ledgers, fresh workers, and bounded execution |
| Quality              | Configurable format, lint, type, SQL security, build, unit, integration, E2E, and Trivy pipeline contracts                      |
| Git and CI           | AI-managed Git initialization, one commit per slice, one PR per goal, Husky gates, CI monitoring, and protected main            |
| Data                 | PostgreSQL by default with ordered, forward-only, checksum-protected migrations                                                 |
| Google Cloud         | Cloud Run services and jobs, Cloud Scheduler, Cloud SQL, Artifact Registry, Secret Manager, and WIF guidance                    |
| Delivery evidence    | Developer release fragments, review evidence, scope enforcement, and explicit completion markers                                |
| Controller support   | Native Cursor, Codex, and Claude Code adapters installed together, with one leased controller per run                           |
| Dependency integrity | Exact framework baseline, pinned tools and curated skills, security overrides, and generated-profile validation                 |

Parallel Slices does not pretend that a generic scaffold is already your finished
production system. Initialization turns your answers into a project-specific
architecture and Product Plan. Human approval authorizes the Product Plan
commit; AI compilation creates the execution commit that authorizes later slice
work. A separately approved repository profile authorizes GitHub repository
creation, goal-branch push, one goal-level pull request, and CI monitoring.
Credentials, merging, cloud setup, deployment, and production migrations remain
separately controlled.

## How `nextjs-gcp-postgres` differs from a `create-next-app` scaffold

`create-next-app` is the official and fastest way to create a standalone
Next.js application. Parallel Slices addresses the larger problem of letting
an AI agent build and operate a complete application repository predictably.

| Capability          | `create-next-app`                   | Parallel Slices                                                      |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| Starting structure  | One Next.js application             | Separate Turborepo with apps, shared packages, and controls          |
| Framework baseline  | Resolved when the CLI runs          | Exact, reviewed, reproducible, and drift-checked                     |
| Component system    | Tailwind in recommended defaults    | Mantine by default; Tailwind removed and prohibited                  |
| AI operating model  | Not prescribed                      | Product interview, approved Product Plans, bounded slices, and state |
| Quality enforcement | Initial lint and TypeScript choices | Shared configurable loop, commit, push, and CI pipelines             |
| Tests               | Application decides later           | Unit, integration, E2E, and container-test contracts                 |
| Database            | Not included                        | PostgreSQL migration and SQL security framework                      |
| Cloud architecture  | Deployment-neutral                  | Google Cloud and Cloud Run operating boundaries                      |
| Git safety          | Initial repository setup            | Branch, scope, secret, release-note, push, and CI enforcement        |
| Controller choice   | Editor-independent source scaffold  | Native Cursor, Codex, and Claude Code controllers                    |
| Long-running work   | Not prescribed                      | Durable state, terminal markers, and clean stopping points           |

Use the official CLI when you only need a Next.js frontend scaffold. Use
Parallel Slices when the goal is to describe a product and have AI build the
repository under durable engineering rules.

## Everything the bundled `nextjs-gcp-postgres` architecture installs

- A fresh Turborepo created with an exact pinned `create-turbo` version.
- An exact, reviewed Next.js and React baseline applied after generation.
- Mantine Core and Hooks as the default component system, with SSR-safe color
  scheme setup and no Tailwind.
- Cursor Agent CLI support for independent subscription reviewers with explicit
  model IDs and no project SDK dependency.
- Native instructions and skills for Cursor, Codex, and Claude Code.
- Concise generated-project onboarding that attributes Parallel Slices and
  links directly to its public workflow diagrams and mechanism map.
- A human-approved Product Plan compiled with the Architecture Package into
  version 2 manifests, a dependency DAG, logical locks, Ready Slices, and
  durable version 5 JSON state with reproducible sizing inputs, dependency
  rationale, parallelism evidence, and sizing rationale.
- A root-only orchestration loop that gives every slice a fresh worker context
  and detached worktree, then integrates verified candidates serially.
- Ignored, filesystem-synchronized per-attempt worker and integration ledgers
  that retain pipeline steps, interruptions, failures, retries, and cleanup
  without committing in-flight runtime data.
- A read-only status command with total and per-slice progress bars, pipeline
  detail, and evidence-based recovery guidance.
- JSON-configurable pipelines for Prettier, ESLint, TypeScript, SQL security,
  build, unit, integration, E2E, Trivy, and project-specific checks.
- Husky pre-commit applies fixed commit policy and the default `core` pipeline.
- Husky pre-push and pull-request CI apply the same branch-range policy and
  default `full` pipeline, including integration, E2E, and Trivy checks.
- A durable repository profile lets the run controller initialize Git, create
  the goal branch, commit every accepted slice separately, create or verify the
  named GitHub repository with `gh`, push the goal branch, open one goal-level
  PR, and monitor CI.
- Package-owned GitHub Actions for quality checks and Cloud Run delivery.
- Cloud Run, Cloud Run Jobs, Cloud Scheduler, Cloud SQL for PostgreSQL, Secret
  Manager, Artifact Registry, and Workload Identity guidance.
- An ordered, checksum-protected PostgreSQL migration framework that runs
  separately from application startup and deployment.
- Developer release-note fragments created with implementation slices.
- Optional ordered multi-agent review with bounded provider processes,
  resumable authentication pauses, and permanent JSON and Markdown evidence.
- Curated, commit-pinned Vercel skills for React and composition quality.
- Checks for protected branches, symlink traversal, unsafe scope expansion,
  accidental secrets, and unmanaged skill replacement.

## Related pages

- [Architecture packages](architecture-packages.md): the package contract and
  extension boundary.
- [Generated application baseline](generated-application-baseline.md): the
  reproducible generation sequence and attestation.
- [Glossary](glossary.md): definitions of slice, controller, worker, and the
  other terms used above.
