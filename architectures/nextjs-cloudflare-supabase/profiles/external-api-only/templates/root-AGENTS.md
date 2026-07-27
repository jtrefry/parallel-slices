# Project instructions

Status: INITIALIZATION_REQUIRED

This repository selects the versioned `nextjs-cloudflare-supabase` architecture with
the `external-api-only` profile in `.parallel-slices/architecture.json`.
Changing the package or profile requires an explicit, reviewed architecture
migration.

## Operating model

- Use `docs/parallel-slices/` as the version-matched operating contract.
- Use the enabled controller adapters for planning, preparation, execution, and
  status. Do not bypass them with an unbounded implementation prompt.
- Write and obtain explicit developer approval for the human-readable Product
  Plan before application implementation.
- Compile the approved plan into dependency-minimal, parallel-ready slices in a
  separate commit.
- Keep one controller in durable run state and one ignored local lease. Each
  Ready Slice runs in a fresh worker context and isolated worktree.
- Integrate verified candidates serially. Do not allow workers to commit,
  merge, push, publish, deploy, or mutate external systems.
- Treat `.parallel-slices/review.json` as optional configuration. When
  `"enabled": false`, do not require provider authentication or configured
  multi-agent review evidence.

## Architecture boundary

- Keep `apps/web/` as the Next.js App Router application and `docs/` as
  repository documentation. Never create an application under `docs/`.
- Preserve Mantine as the component system and do not introduce Tailwind.
- Preserve the exact Node.js, package-manager, framework, UI, and security
  versions recorded by the generated scaffold.
- This profile obtains product data from documented external APIs. It includes
  no application database, schema-migration framework, SQL security scanner,
  PostgreSQL service, Supabase configuration, or database package dependency.
- Adding persistence is an explicit architecture or profile migration. Do not
  add a database as an incidental implementation choice.
- Keep remote API access behind typed server-owned adapters unless the approved
  architecture explicitly permits a browser request.
- Validate untrusted provider responses and define timeout, retry, rate-limit,
  cache, partial-failure, and incompatible-schema behavior.
- Never expose server-only credentials through a Next.js client bundle.

## Quality and tests

- `.parallel-slices/config.json` is the quality source of truth for the scope
  gate, Husky hooks, controller loop, and GitHub Quality workflow.
- Reuse the package-manager and pipeline utilities in
  `scripts/parallel-slices/project-quality.mjs`.
- Preserve npm, pnpm, Yarn, and Bun support unless an approved requirement
  explicitly narrows it.
- Add behavior-focused tests at the smallest meaningful boundary. Remote API
  integration tests must use deterministic local doubles, recorded synthetic
  fixtures, or an explicitly approved non-production provider environment.
- Cover success, invalid responses, authentication refusal, rate limits,
  timeouts, cancellation, partial outages, and recovery where applicable.
- Unit tests must not require Docker, a network, or cloud credentials.
- Run the exact pipeline declared by each slice. Never weaken a gate to make a
  change pass.

## Product and planning documents

- Product Plans live at
  `docs/plans/YYYY-MM-DD-<short-kebab-description>.md`.
- Compiled state, scope manifests, corrections, and review evidence use the
  paths and templates governed by `docs/plans/AGENTS.md`.
- Project architecture, security, testing, local-development, operations, and
  decision contracts live under `docs/project/`.
- Keep requirement IDs atomic and trace every slice and acceptance result back
  to them.
- Before compiling slices, trace entry points, API contracts, consumers, side
  effects, tests, and operations. Create only causal dependencies.
- A non-trivial serial-only graph requires an explicit second decomposition
  challenge and evidence-backed justification.

## Security and external systems

- Never write credentials, tokens, private endpoints, customer data, or
  provider payloads containing sensitive data into source, fixtures, plans,
  logs, or review evidence.
- Use server-side secret references and scoped, short-lived Cloudflare API token
  Federation for Cloudflare.
- Validate URLs, redirects, response sizes, media types, and schemas before
  trusting remote content.
- Bound retries and use idempotency controls for remote mutations.
- Do not silently cache one user's protected data for another user.
- Treat deployment, provider configuration, secret mutation, package
  publication, and other external actions as separately authorized work.

## Git and delivery

- Never work directly on `main`, `master`, or another protected branch.
- Use a convention-compliant goal branch and one commit for each accepted
  slice.
- Do not force-push, rewrite shared history, bypass hooks, merge the goal pull
  request, or weaken required checks.
- GitHub publication is allowed only when
  `.parallel-slices/repository.json` names the exact authorized account,
  repository, remote, and base branch.
- A publication profile authorizes the goal branch, pull request, and CI
  monitoring only. It does not authorize deployment.
- Cloudflare Workers delivery must use immutable images, least-privilege identities, and
  the reviewed workflow. Never deploy during initialization or implementation
  testing.

## Completion

A change is complete only when its approved requirements, scope manifest,
implementation, tests, quality evidence, review evidence when configured,
developer release note, and project documentation agree. Stop with an
actionable explanation when authorization, scope, architecture compatibility,
or evidence is missing.
