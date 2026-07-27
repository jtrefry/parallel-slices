# Operating guide for generated `nextjs-gcp-postgres` projects

The [README workflow](../README.md#understand-the-model) is the system overview. The
[mechanism map](mechanism-map.md) explains which instructions, adapters,
contracts, scripts, gates, and evidence implement that model. The
[pipeline walkthrough](pipeline-walkthrough.md) maps every diagram stage to its
owner and Git context. The
[new-project checklist](new-project-checklist.md) is an AI-managed acceptance
contract, not a form for the developer.

## 1. Choose a tool and initialize

New repositories use `npm run bootstrap --` from the Parallel Slices checkout
with a selected architecture. For an existing Next.js Turborepo, create a
convention-compliant feature branch and install the `nextjs-gcp-postgres` architecture
and controls. From the existing repository root:

```bash
git switch -c chore/install-development-controls
/path/to/parallel-slices/scripts/setup.sh \
  --architecture nextjs-gcp-postgres \
  --default-controller codex \
  /absolute/path/to/turborepo
```

All three adapters are installed. `.parallel-slices/agent.json` records a
default controller for convenience, not an exclusive controller. Choose any
enabled controller and use its native initialization command:

| Controller  | Initialize              | Short alias    |
| ----------- | ----------------------- | -------------- |
| Cursor      | `/parallel-slices-init` | `/slices-init` |
| Codex       | `$parallel-slices-init` | `$slices-init` |
| Claude Code | `/parallel-slices-init` | `/slices-init` |

Describe the product, answer consequential questions, and approve or revise the
AI-written Product Plan. The tool commits that human-readable source first. AI
then combines it with the Architecture Package and compiles version 2 manifests,
a dependency DAG, Ready Slices, and version 5 JSON run state using the sizing
strategy committed in `.parallel-slices/config.json`. The compiled files are
validated execution details, not a second human
approval surface. Do not authorize application implementation until compilation
is complete.

Choose `local-only` or GitHub publication during initialization. For GitHub
mode, authenticate the intended account before the interview:

```bash
gh auth login --hostname github.com --web
gh auth status --active --hostname github.com
gh api user --jq .login
```

If the wrong authenticated account is active, use `gh auth switch --hostname
github.com --user USERNAME`. The agent records the exact owner, repository,
visibility, remote, base branch, and create-if-missing permission in
`.parallel-slices/repository.json`.

Freshly generated repositories already contain the exact framework baseline in
`.parallel-slices/scaffold-profile.json`. Mantine is configured in each App Router
application, and Tailwind is prohibited. Existing repositories adopted with
`setup.sh` keep their current UI system and do not receive this profile.

## 2. Build the quality foundation

Initialization must make the root package expose non-watch, CI-safe roles for:

```text
format:check
lint
typecheck
build
test:unit
test:integration
test:e2e
security:trivy
```

Aliases, timeouts, step order, hook mappings, CI, and additional scanners are
configured in `.parallel-slices/config.json`. Application checks should delegate to
Turbo instead of enumerating workspace packages. Configure task dependencies,
inputs, outputs, environment variables, and caching in `turbo.json` or
`turbo.jsonc`. Prettier must run in check-only mode. Follow
[configurable-quality-pipelines.md](configurable-quality-pipelines.md) when
changing a gate.

The `postgres` profile also requires `security:sql`. Configure its installed
migration runner, timestamped files under `apps/backend/migrations/`, and
disposable local and CI PostgreSQL before foundation readiness. See
[postgresql-migrations.md](postgresql-migrations.md). The
`external-api-only` profile installs none of those database requirements;
instead, initialize deterministic API contract tests and remote-failure
behavior.

Use Docker Desktop when integration, E2E, emulator, or image tests need
containers. Rancher Desktop with `dockerd (moby)` is a free best-effort
alternative. See [local-development.md](local-development.md).

Verify the initialized contract and, later, the complete foundation. From the
generated repository root:

```bash
node scripts/parallel-slices/doctor.mjs --initialized
node scripts/parallel-slices/doctor.mjs --foundation-ready --require-containers
```

For the bundled GCP architecture, run `gcloud version` separately when selected
local tests require the Google Cloud CLI.
Configure GitHub protection using
[github-repository-settings.md](github-repository-settings.md).

Choose whether to enable ordered independent AI reviewers in
`.parallel-slices/review.json` before Product Plan approval. The installed
default is disabled and requires no planning-review target or provider
credential. When enabled, goal-level planning and integrated slice review use
the configured provider CLIs. Cursor subscription review requires explicit
model IDs and cached `cursor-agent login`, not a project SDK or
`CURSOR_API_KEY`; under `billingPolicy=subscription-only` the runner uses fresh
`cursor-agent --print` processes with the cached browser login and refuses
known API or cloud credential overrides. Provider plans still control model
access, quotas, rate limits, and billing, so the runner cannot guarantee that a
particular turn is included in a subscription. Configuration validation and the
project doctor do not contact providers. See the installed
`docs/parallel-slices/multi-agent-review.md` procedure.

## 3. Prepare one bounded milestone

AI creates:

- `docs/plans/YYYY-MM-DD-feature.md`;
- `docs/plans/loop-runs/feature-state.json`;
- one committed `docs/plans/scopes/feature/<slice>.scope` per slice; and
- one committed `docs/plans/scopes/feature/_planning.scope`;
- exact planning and slice JSON/Markdown review paths; and
- a manual test script when human UAT or environment evidence is required.

The Markdown plan defines stable requirements, preservation behavior,
non-goals, locked decisions, real acceptance scenarios, and the final
milestone boundary for people. Version 2 manifests distill it into small
coherent outcomes, dependencies, worker and coordinator paths, logical resource
locks, parallel policy, exact gates, and machine-validated impact coverage. The
compiler traces contracts and their producers, consumers, side effects, tests,
and operations before rehearsing whether a future worker can finish without an
out-of-scope write. Read the installed
`docs/parallel-slices/planning-and-optimized-slices.md` procedure.

The developer reviews and approves the Product Plan alone. AI commits it, then
compiles and validates the manifests, graph, Ready Slices, and initial state in
a separate commit. Configured AI reviewers then approve the compiled map and AI
commits their generated ledger separately. Application files must not change
before all three planning commits are complete.

The bounded initialization commit may use `minimum_stage=contract-ready` while
the quality foundation is being created. Product slices require
`minimum_stage=foundation-ready`.

For later milestones, use `/parallel-slices-plan` in Cursor or Claude Code and
`$parallel-slices-plan` in Codex. The short aliases are `/slices-plan` and
`$slices-plan`. Each is a thin adapter around the same installed
`docs/parallel-slices/plan-milestone.md` workflow.

## 4. Choose the gate per slice

Default to `gate=full`. Use `gate=core` only for an isolated slice whose outcome
is fully demonstrated by formatting, lint, types, SQL security, a production
build, and unit tests, with the reason recorded in the plan.

Use the full pipeline, or a project-specific pipeline that extends it, for
browser workflows, routing, Server Actions, Route
Handlers, middleware, proxy, auth, data access, external services, shared
contracts, cache behavior, rendering, hydration, or other outcomes needing
integration or E2E evidence.

## 5. Prepare and start one run controller

Use one convention-compliant goal branch. Pick the tool that will own this run
and run its preparation workflow:

| Controller  | Prepare                    | Short alias       | Start                                         |
| ----------- | -------------------------- | ----------------- | --------------------------------------------- |
| Cursor      | `/parallel-slices-prepare` | `/slices-prepare` | Review the invocation, then `/loop`           |
| Codex       | `$parallel-slices-prepare` | `$slices-prepare` | Review the completion condition, then `/goal` |
| Claude Code | `/parallel-slices-prepare` | `/slices-prepare` | Review the completion condition, then `/goal` |

Preparation derives the plan, state path, exact milestone, goal branch,
repository publication mode, and stop boundary from repository evidence. The
developer reviews the generated invocation instead of constructing file paths
manually.

Do not run another `/loop`, another `/goal`, or a write-mode formatter in the
same goal checkout. The JSON run state names its controller and the ignored
local lease refuses any competing controller. The profile default does not
transfer run ownership.

## 6. Streaming per-slice sequence

1. The continuing `/loop` or `/goal` thread acts only as the root orchestrator.
2. It validates committed state and computes the next Ready Slices.
3. It creates one detached slice worktree and fresh worker context for every
   ready slice. Workers in that result may run concurrently.
4. Each worker reads the repository, plan, state, and its one manifest directly
   from the worktree; it implements only worker-owned paths, runs the exact gate,
   and returns one clean candidate commit plus compact evidence.
5. As each worker finishes, the root verifies its tracked gate and candidate
   commit from Git. It does not wait for unfinished independent workers.
6. For each dependency-eligible candidate, the root uses the tracked `apply`
   command to atomically claim the clean goal checkout and apply exactly one
   candidate. It then updates only coordinator paths and reruns the integrated
   gate. An enabled configured review runner alone writes the permanent JSON
   ledger and Markdown view; when disabled, a fresh independent reviewer leaves
   durable evidence in slice state without placeholder artifacts.
7. `CHANGES_REQUESTED` returns the same slice to a fresh correction worker. The
   root never fixes application code.
8. After acceptance, the root records state, creates one logical
   accepted commit, proves worker-owned blobs were preserved, and removes the
   accepted worktree.
9. After each accepted slice, the root recalculates readiness instead of
   trusting a cached schedule. Newly unlocked workers may start while older
   independent workers continue.

Cursor continues the root context through repeated `/loop` iterations. Codex
and Claude Code use persisted `/goal` completion conditions. Persistence
continues the root context; fresh native workers provide per-slice context
isolation. For all three, the shared procedure is canonical at
`docs/parallel-slices/run-sliced-plan.md`; native skills are thin adapters.

### Runtime ledgers

Accepted progress is durable in the goal branch: every accepted slice has one
commit containing the aggregate JSON state and permanent review evidence.
In-flight work stays under Git-ignored `.parallel-slices/runtime/`. Acquiring
the run lease creates an ignored runtime `index.json` that references a
separate `worker.json` and `integration.json` ledger for every numbered slice
attempt. Workers record only their own lifecycle and candidate pipeline through
the shared tracking command; the serial root records verification, integrated
pipeline, review, retry, acceptance, and cleanup. A retry appends a new attempt
and worker ID instead of replacing the failed evidence. Candidate and
integrated pipeline runs append step-level results; starting a replacement run
marks an unfinished pipeline `interrupted` and reruns the complete gate.

### Status and recovery

Use the native `parallel-slices-status` command (or its `slices-status` alias),
or run this from the repository root for a read-only aggregate view:

```bash
node scripts/parallel-slices/run-status.mjs --state <state-path>
```

The report combines the Product Plan, committed run state, runtime index,
attempt ledgers, worktree condition, pipelines, and permanent reviews, with
total and per-slice progress bars plus pipeline and recovery details.

After a process or machine restart on the same disk, run status first and
inspect it before continuing. Clean candidate commits can be verified and
integrated, interrupted pipelines are rerun in full, dirty scoped worker
worktrees are preserved for an explicit recovery worker, interrupted worktree
setup resumes the same attempt and worker ID, and ambiguous root changes stop
rather than being cleaned. Retry allocation is idempotent, so restarting a
replacement returns the existing next attempt. Reacquiring the same controller
lease also repairs a master-index update that stopped after the complete
attempt directory was atomically installed. Never infer that a `running` phase
is stale or remove a lock without verifying the former process stopped.

Runtime files, leases, worktrees, and unaccepted candidates are never committed
or pushed. Cross-machine recovery therefore starts only at the last accepted
slice commit available on the authorized remote goal branch; any later
in-flight slice restarts. The complete contract is installed at
`docs/parallel-slices/robust-recovery.md`.

Pre-commit applies commit policy and the configured `core` pipeline. A goal has
one branch, and every accepted slice has its own commit. The final goal-branch
push checks the complete committed branch range against new scope manifests and
release notes, then reruns the configured `full` pipeline.
Pull-request CI performs the same branch-range policy and full quality checks.
This duplication is intentional: a push must not assume an earlier hook ran or
that the branch remained unchanged.

After every slice is accepted, the controller performs one final audit and
records its audited commit, accepted slice list, and evidence for requirements,
preservation, gates, reviews, release fragments, state, and non-goals. Terminal
run state is refused when that evidence or per-slice gate and review evidence
is missing. Multi-agent review artifacts must be a complete JSON/Markdown pair
when present.

In `local-only` mode, the controller stops with the committed goal branch ready.
In `github` mode, initialization first uses the approved repository profile to
establish the exact remote and a real base branch before the first project
commit. After the goal audit, the controller pushes the goal branch, creates or
updates one PR for the complete goal, and watches CI with `gh pr checks --watch
--fail-fast`. It never creates a PR per slice, merges the PR, or deploys.

### Terminal states

The controller uses three successful terminal markers:

- `SLICE_ACCEPTED` means one slice was accepted; the milestone continues and
  readiness is recalculated immediately.
- `PULL_REQUEST_READY` means the complete GitHub-mode goal is pushed as one
  CI-green pull request and awaits human review.
- `MILESTONE_FINISHED` is the equivalent handoff for a local-only goal.

Every other terminal marker, including `BLOCKED` and `FAILED`, stops
continuation and preserves its evidence.

## 7. Stop conditions

Stop and preserve work when a path is outside the manifest, another writer owns
the checkout, the committed contract changed, an unanticipated product or
architecture decision appears, or a required check cannot pass within the
bounded fix cycle.

An interactive multi-agent review may pause for a signed-out provider. Complete
login or onboarding in a separate terminal, return, and press Enter. A
non-interactive run exits instead of waiting. Provider quota, timeout, malformed
output, and stale-source outcomes stop the slice; they are never approvals.

Never reset, restore, clean, checkout, or automatically stash partial work.

## 8. Hand off a run or change the default

To hand off, first reach a clean slice boundary with no active workers, release
the old controller's lease with `run-lock.mjs release --handoff`, and update the
committed JSON state through an approved coordination change.

Change only the default controller from a clean convention-compliant feature
branch. From the repository root:

```bash
node scripts/parallel-slices/switch-agent.mjs codex /absolute/path/to/repository
```

The command validates the branch and worktree, ensures curated skills for the
new default, then atomically changes `.parallel-slices/agent.json`. All
adapters remain enabled. Review and commit that change. It does not change or
transfer the approved plan, JSON state, run lease, ownership of an active run,
or shared procedure. Never change the default while `/loop` or `/goal` is
running.

## 9. Complete and publish the milestone

After the final slice, audit every requirement, preservation scenario, gate
result, release fragment, review finding, and Git boundary. Emit
`MILESTONE_FINISHED` only for a complete local-only goal. In GitHub mode, push
the one goal branch, create or update its one goal-level PR with a meaningful
title and evidence-rich description, watch required checks to green, and emit
`PULL_REQUEST_READY` for human review. Do not merge the PR or continue into a
later phase or adjacent refactor.
