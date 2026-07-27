# Initialize a Next.js GCP external-API project

Use this procedure only when `.parallel-slices/architecture.json` selects
`nextjs-gcp-postgres` with the `external-api-only` profile. This profile builds a
Next.js application that obtains product data from explicitly documented
external APIs. It intentionally installs no database driver, local database
service, SQL scanner, schema-migration framework, Cloud SQL configuration, or
database quality requirement.

The initialization controller owns discovery and planning. It must not write
application implementation before the developer approves the Product Plan.

## 1. Verify the selected contract

From the repository root, run:

```bash
node scripts/parallel-slices/doctor.mjs
node scripts/parallel-slices/architecture-profile.mjs show "$(pwd)"
node scripts/parallel-slices/architecture-profile.mjs profile "$(pwd)"
```

The profile command must print `external-api-only`. Also inspect:

- `.parallel-slices/architecture.json`;
- `.parallel-slices/config.json`;
- `.parallel-slices/review.json`;
- `.parallel-slices/repository.json`;
- `AGENTS.md`; and
- `docs/plans/AGENTS.md`.

Stop if the architecture profile is missing, names another profile, or if
installed architecture files do not match the recorded manifest hash.

## 2. Establish repository publication authority

The default repository mode is `local-only`. Keep it that way unless the
developer explicitly authorizes a named GitHub repository. If publication is
authorized, use the repository-profile procedure and verify the active `gh`
account before changing `.parallel-slices/repository.json`.

Authorization to create a goal pull request does not authorize merge,
deployment, package publication, secret changes, or other external actions.

## 3. Interview for product and integration requirements

Ask only consequential questions, but resolve each consequential ambiguity.
Record atomic requirements with stable IDs and observable acceptance evidence.
Cover at least:

- users, roles, permissions, and critical user journeys;
- information displayed or submitted by the application;
- external API owners, environments, base URLs, and versioning policy;
- authentication mechanism and server-only credential handling;
- request and response contracts, pagination, filtering, and rate limits;
- latency budgets, retry policy, timeouts, cancellation, and idempotency;
- partial outage, stale data, malformed response, and quota-exhaustion behavior;
- caching boundaries and whether cached data is sensitive;
- webhook or asynchronous callback behavior when applicable;
- audit, privacy, retention, and observability expectations;
- accessibility, responsive behavior, browser support, and localization;
- unit, integration, contract, E2E, and manual acceptance evidence;
- Cloud Run service and job requirements;
- non-goals and behavior that must remain unchanged; and
- whether optional multi-agent planning and slice review should be enabled.

Never request a real API key in chat or place one in a plan, fixture, example,
log, browser bundle, or repository file. Record only secret names and ownership
boundaries.

## 4. Define the external-API boundary

The Product Plan and `docs/project/architecture.md` must identify:

- the server-side module that owns each remote API;
- typed internal contracts that isolate the application from provider payloads;
- validation performed on untrusted remote responses;
- which requests may run in the browser and which must remain server-side;
- authentication, secret lookup, token refresh, and credential rotation;
- timeouts, retryable statuses, backoff, circuit breaking, and rate limiting;
- deterministic test doubles or contract fixtures;
- cache ownership, invalidation, and user-isolation rules; and
- behavior when an API is unavailable, slow, inconsistent, or returns an
  incompatible schema.

Do not introduce persistence merely as a convenience. Adding a database later
is an explicit architecture migration or reviewed profile migration, not a
normal implementation detail.

## 5. Write the project contracts

Create or complete every document named by
`.parallel-slices/architecture.json`, including:

- `docs/project/product-brief.md`;
- `docs/project/architecture.md`;
- `docs/project/security-and-privacy.md`;
- `docs/project/testing-strategy.md`;
- `docs/project/local-development.md`;
- `docs/project/gcp-operations.md`; and
- `docs/project/decision-log.md`.

These documents must describe the actual approved project. Examples and
placeholders are not sufficient acceptance evidence.

The testing strategy must distinguish:

- unit tests for pure transforms, validation, and policy;
- integration or contract tests for API adapters using deterministic local
  doubles or provider-approved non-production endpoints;
- E2E tests for critical user journeys; and
- manual tests for behavior that automation cannot establish safely.

## 6. Write and approve the Product Plan

Create `docs/plans/YYYY-MM-DD-<short-kebab-description>.md` using the installed
template and local instructions. The plan must include:

- atomic numbered requirements;
- locked decisions and remaining assumptions;
- external-API contracts and failure behavior;
- security and privacy boundaries;
- architecture and file ownership;
- project quality-foundation work;
- acceptance evidence for every requirement;
- preservation requirements;
- risks, recovery, and non-goals; and
- release-note expectations.

The developer must explicitly approve this human-readable Product Plan before
it is committed. Product Plan approval does not approve deployment or other
external actions.

## 7. Compile an optimized slice graph

After the plan-only commit, follow
`docs/parallel-slices/planning-and-optimized-slices.md`. Compilation must:

1. trace entry points, API contracts, consumers, tests, and operations;
2. make a mandatory dependency-minimal concurrency pass;
3. create the smallest coherent vertical slices supported by the plan;
4. declare only causal dependencies;
5. challenge any non-trivial all-serial graph;
6. record rationale for every dependency edge; and
7. generate complete scope manifests and durable run state.

Shared files, preferred order, or a common external provider do not by
themselves create dependencies. Use logical locks and serial integration where
coordination is needed without preventing independent worker execution.

If `.parallel-slices/review.json` has `"enabled": true`, complete independent
planning review and commit its evidence before implementation. When it is
disabled, do not require provider authentication or planning-review evidence.

## 8. Prepare and run the implementation loop

Use the selected controller's installed preparation and next-slice commands.
The continuing controller owns orchestration only. Every Ready Slice receives a
fresh worker context and isolated worktree, passes its declared quality
pipeline, receives any configured independent review, and is integrated
serially.

Foundation slices should establish the package scripts selected by
`.parallel-slices/config.json`: formatting, linting, types, builds, unit tests,
integration tests, E2E tests, and Trivy. This profile has no SQL-security step
or database service.

Stop safely on scope ambiguity, missing authorization, provider
authentication failure, incompatible external API behavior, or evidence that
the selected architecture profile no longer represents the product.
