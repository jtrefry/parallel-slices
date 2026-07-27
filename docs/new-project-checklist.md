# `nextjs-gcp-postgres` project readiness checklist

This is the acceptance contract for the human-directed, AI-built project initializer. The
bootstrap supplies the generic control layer, then the selected controller's
initialization command collects consequential decisions and creates the application-specific
architecture, configuration, tests, infrastructure definitions, and
documentation.

The developer does not complete this checklist or write its artifacts. AI
performs every implementation item. The developer supplies product intent, answers
security, privacy, legal, cost, and operational questions, approves the plan,
chooses the exact repository publication profile, and authorizes production
actions separately.

## Quality-foundation milestone acceptance

These requirements are delivered by the approved foundation slices. The
contract-only plan commit is protected by a narrow initialization gate while
these executable checks are being created. Product and feature slices remain
blocked until the project stage is `foundation-ready`.

- [ ] Initialize Git and create a convention-compliant, non-protected branch.
- [ ] Adopt `<type>/<short-kebab-description>` branch names and forbid commits
      or direct pushes to `main`.
- [ ] Choose `local-only` or configure `.parallel-slices/repository.json` with the
      exact GitHub `OWNER/NAME`, visibility, remote, base branch, and
      create-if-missing permission.
- [ ] In GitHub mode, verify the intended account with `gh auth status --active
--hostname github.com` and `gh api user --jq .login`.
- [ ] In GitHub mode, establish or verify the remote base branch before the
      first project commit. A newly created repository uses a GitHub-initialized
      README as its minimal base; never make the goal branch the first remote
      push.
- [ ] Require one branch and one pull request per approved goal, with one
      logical commit per accepted slice. Never require a PR per slice.
- [ ] Approve and commit the complete human-readable Product Plan first. Then
      AI-compile version 2 manifests, a goal-level planning scope, version 5
      JSON run state, an acyclic dependency graph, and Ready Slices using the
      committed slice-sizing strategy in a separate commit. Require configured
      independent AI reviewers to approve that map and commit their generated
      fingerprinted ledger separately before application code.
- [ ] Give parallel writers fresh contexts and separate slice worktrees. Keep
      aggregate state and review artifacts root-owned, and integrate candidate
      commits serially on the goal branch.
- [ ] Keep in-flight recovery ledgers under ignored runtime state, append one
      attempt per retry, and expose one read-only aggregate status command.
      Never commit or push partial pipeline or worktree tracking.
- [ ] Pin Node.js 24 LTS with `.nvmrc`, `.node-version`, or the team's
      equivalent. Node.js 22 LTS remains supported for existing repositories.
- [ ] Declare the package manager and version in the root `package.json`.
- [ ] Enable TypeScript strict mode for application and shared-package code.
- [ ] Preserve the generated Mantine provider, color-scheme script, HTML props,
      core stylesheet, and PostCSS setup in every App Router application.
- [ ] Use Mantine as the default component system. Keep product-specific CSS in
      CSS Modules or ordinary CSS and do not introduce Tailwind.
- [ ] Configure ESLint and check-only Prettier formatting.
- [ ] Provide real root scripts for formatting, lint, type checking, SQL
      security, production build, unit tests, integration tests, E2E tests, and
      Trivy.
- [ ] Review `.parallel-slices/config.json`; accept the architecture's
      slice-sizing default or select `isolation-first` or
      `throughput-balanced` before Product Plan approval. Keep the fixed
      entry-point capability floors intact, with pre-commit mapped to core and
      pre-push and CI mapped to full unless an approved stricter pipeline
      replaces a mapping.
- [ ] Review `.parallel-slices/review.json`; keep multi-agent review disabled or
      explicitly enable at least one independent AI reviewer before Product Plan
      approval. Enabled review records ordered reviewers, billing policy,
      bounded rounds, timeouts, and exact artifact paths without credentials.
- [ ] When selecting Cursor reviewers, require an explicit model ID, omit
      `effort`, and authenticate with `cursor-agent login` for
      `subscription-only`. No project SDK or `CURSOR_API_KEY` is required.
      Cursor may remain the `/loop` controller because each turn is a separate
      CLI session.
- [ ] Configure Turbo inputs, outputs, environment variables, dependencies, and
      cache behavior for those scripts.
- [ ] Add at least one meaningful unit, integration, and browser smoke test so a
      green command proves more than an empty test suite.
- [ ] Reject placeholder, assertion-free, trivially true, skipped, focused, and
      filler-snapshot tests in project instructions and independent review.
- [ ] Install and start Docker Desktop when integration, E2E, emulator, or
      container-smoke tests use local containers.
- [ ] If using the free Rancher Desktop alternative, select `dockerd (moby)` and
      accept that compatibility is best effort rather than part of the Google
      Cloud-aligned support guarantee.
- [ ] Replace the bootstrap root `AGENTS.md` with repository-specific
      instructions. Add agent-specific scoped rules only when they materially
      improve enforcement without duplicating root policy.
- [ ] Make every required quality command pass from a clean checkout.
- [ ] Confirm the Husky pre-commit, pre-push, and GitHub Quality gates are
      installed and active.

The `nextjs-gcp-postgres` generator installs
[`architectures/nextjs-gcp-postgres/templates/root-AGENTS.md`](../architectures/nextjs-gcp-postgres/templates/root-AGENTS.md)
only
as a temporary safety policy. The initialization skill must replace it with
project-specific instructions before application implementation begins. The
installer preserves an existing root `AGENTS.md` and all native adapter files so
AI can reconcile them without silently overwriting repository policy.

## Repository foundations

- [ ] Document the workspace map: deployable applications, shared packages,
      ownership, and permitted dependency directions.
- [ ] Add `.editorconfig`, `.gitattributes`, a root `tsconfig`, and shared ESLint
      and Prettier configuration where packages should inherit common behavior.
- [ ] Decide naming, module boundaries, import conventions, error handling, and
      logging before agents reproduce inconsistent patterns.
- [ ] Document how to install dependencies, run development servers, seed local
      services, and reset disposable test data.
- [ ] Record important architecture decisions in short decision records rather
      than relying on chat history.

## Environment and security

- [ ] Commit a redacted `.env.example` that names required variables without
      containing credentials.
- [ ] Validate environment variables at startup and keep server-only variables
      out of client bundles. Only intentionally public values should use the
      `NEXT_PUBLIC_` prefix.
- [ ] Define authentication, authorization, tenant isolation, input validation,
      upload limits, rate limits, and sensitive-data logging rules when they
      apply.
- [ ] Document which commands can affect shared development, staging, or
      production systems. Deny deployments and migrations by default in agent
      instructions unless the workflow explicitly authorizes them.
- [ ] Enable automated dependency updates and dependency or supply-chain review.
- [ ] Establish a secret-scanning policy for commits and CI.
- [ ] Run the default Trivy vulnerability, misconfiguration, and secret scan at
      the exact version recorded in `.trivy-version`.
- [ ] Run the deterministic SQL security scanner in the core pipeline and treat
      suppressions as reviewed exceptions with a written rationale.

Next.js ignores local environment files by default. A committed `.env.example`
is documentation only; it must never contain live secrets. Test defaults may be
kept in `.env.test`, while `.env.test.local` remains untracked.

## Test design

- [ ] Define what belongs in unit, component, integration, and E2E suites.
- [ ] Make tests deterministic: isolate data, control time, avoid shared mutable
      accounts, and give network waits explicit bounds.
- [ ] Test Server and Client Component boundaries, Route Handlers, Server
      Actions, middleware or proxy behavior, loading and error states, and
      hydration when applicable.
- [ ] Include a browser assertion that the Mantine color scheme hydrates without
      console warnings or a light/dark flash when theme behavior is user-visible.
- [ ] Prefer E2E coverage for user-critical paths and async Server Components
      that are not reliably exercised by the chosen unit runner.
- [ ] Set a coverage policy based on risk and changed behavior. Do not optimize
      only for a repository-wide percentage.
- [ ] Map formal requirement IDs to acceptance scenarios and concrete automated
      or manual evidence. Require regression tests for fixed defects.
- [ ] Keep fixtures, browser startup, and teardown inside repository scripts.
      For `postgres`, also keep schema reset and equivalent PostgreSQL
      dependencies local and in CI. For `external-api-only`, use deterministic
      API doubles or explicitly approved non-production contract endpoints.
- [ ] For `postgres`, preserve timestamped, forward-only migration history
      under `apps/backend/migrations/`; test checksum drift, concurrent runners,
      failure rollback, and pending migration status. For
      `external-api-only`, verify that migration and database tooling is absent.
- [ ] For `postgres`, align the Quality workflow's PostgreSQL service version,
      schema setup, and `DATABASE_URL` conventions with the application. For
      `external-api-only`, verify the workflow has no PostgreSQL service.
- [ ] Keep pure unit tests independent of Docker, PostgreSQL, networks, and
      Google Cloud emulators. Classify container-backed tests as integration or
      E2E tests.
- [ ] Generate only the official emulators required by the selected services,
      and cover unsupported production behavior with isolated GCP contract
      tests.

Follow [`local-development.md`](local-development.md) for the supported Docker
Desktop path, Rancher Desktop alternative, and local service mapping.

## Continuous integration and delivery

- [ ] Run the configured `ci` entry point on pull requests so branch policy and
      every required root quality and security command are enforced together.
- [ ] Require those checks and human review before merging protected branches.
- [ ] Use lockfile-frozen installs and pin action or tool versions according to
      the project's update policy.
- [ ] Pin production base images and CI service containers by digest, then
      update those digests through reviewed dependency automation.
- [ ] Configure CI concurrency so superseded runs are cancelled without
      cancelling protected-branch work.
- [ ] Keep deployment, publication, database migration, and production access in
      separately authorized workflows. The implementation loop should not own
      them.
- [ ] Define versioning, rollback, compatibility, and migration policies before
      the first production release.
- [ ] Protect `main` with a GitHub ruleset requiring pull requests, human
      review, and the `quality` status check.
- [ ] Require human review on the goal-level PR after the agent has pushed all
      slice commits and monitored CI to green. The agent must not approve or
      merge its own PR.
- [ ] Configure Workload Identity Federation and a protected GitHub production
      environment before enabling GCP deployment.
- [ ] Deploy services to Cloud Run, use Cloud SQL for PostgreSQL, and keep
      database credentials in Secret Manager.
- [ ] Implement cron and finite background work as Cloud Run Jobs invoked by
      Cloud Scheduler. Do not deploy Cloud Functions.

The installed Quality workflow supports npm, pnpm, Yarn, and Bun. Review
[`github-repository-settings.md`](github-repository-settings.md) and
[`gcp-delivery.md`](gcp-delivery.md) before enabling merge or deployment rules.

## Collaboration and maintenance

- [ ] Add `CONTRIBUTING.md` with the local workflow and review expectations.
- [ ] Add a pull-request template that asks for scope, tests, screenshots or
      traces when relevant, release notes, rollout, and rollback.
- [ ] Add `CODEOWNERS` or another explicit ownership map for sensitive paths.
- [ ] Choose and document a license before distributing the project.
- [ ] Define how developer release fragments become a changelog or release
      summary and when fragments are archived.
- [ ] Document how to update or remove the Parallel Slices control layer. Never use installer
      `--force` without reviewing the overlay diff.

## Production readiness when applicable

- [ ] Add structured logs, error reporting, health checks, and actionable
      metrics without recording secrets or unnecessary personal data.
- [ ] Establish accessibility, responsive-design, SEO, and performance budgets
      appropriate to the product.
- [ ] Test backup, restore, rollback, and migration recovery paths.
- [ ] Document incident ownership and the safest way to disable risky features.

These items belong to the repository because their correct answers depend on the
application. AI creates and maintains them after the developer approves the
consequential decisions. The implementation loop stops instead of inventing a
missing decision.
