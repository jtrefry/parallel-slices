# Parallel Slices pipeline walkthrough

This page presents the pipeline in two ways: a cake analogy for a quick mental
model, followed by the detailed engineering flow and the Git context used at
each boundary. The diagrams are overviews; the
[root-controller workflow](../repo-overlay/docs/parallel-slices/run-sliced-plan.md)
and [worker contract](../repo-overlay/docs/parallel-slices/run-slice-worker.md)
remain the normative operating procedures.

## Simplified cake metaphor

The cake is a mental model, not the literal execution process. Each cake slice
represents one subfeature built vertically through its required software
layers. A ready slice is baked independently and can enter serial quality and
assembly as soon as it finishes; it does not wait for other ready slices. A
failed slice receives a fresh isolated retry while accepted slices remain in
the product cake. After every planned slice is accepted, the complete product
receives one final goal audit.

![Parallel Slices shown as independent cake slices baked concurrently, checked and assembled serially, retried individually when needed, and audited as one finished cake](assets/parallel-slices-cake-generated.png)

## Detailed pipeline diagram

This is the literal process depiction used by the root README.

![Parallel Slices pipeline from product direction through parallel workers, serial integration, final audit, and goal completion](assets/parallel-slices-pipeline-overview.png)

## The workflow in seven stages

1. **Your requirements establish the goal.** The chosen initialization
   controller must take them seriously, ask product and technical questions,
   resolve important ambiguity, and record locked decisions instead of silently
   inventing requirements. It converts the approved conversation into atomic,
   numbered requirements such as `R1` and `R2`, preserving important
   constraints and tracing every slice and acceptance result back to those IDs.
2. **Planning must precede application code.** AI first writes a complete plan
   for people: requirements, decisions, architecture, preservation rules,
   acceptance evidence, risks, and non-goals. The human approves and commits
   that Product Plan alone. AI then combines it with the selected Architecture
   Package, applies the architecture-defaulted or project-selected slice-sizing
   strategy, and compiles version 2 manifests, version 5 JSON state, and a
   dependency DAG in a separate commit. See
   [planning and optimized slices](../repo-overlay/docs/parallel-slices/planning-and-optimized-slices.md).
3. **The compiled slice map turns the goal into executable work.** Every small,
   coherent slice declares its dependencies, worker-owned paths, root-owned
   evidence, logical resource locks, parallel policy, tests, quality pipeline,
   and exact commit subject. Compilation traces entry points, contracts,
   consumers, data side effects, tests, and operations, then records
   machine-validated `change`, `preserve`, or `not-applicable` scope coverage.
   When multi-agent review is enabled, fresh configured AI reviewers then audit
   the Product Plan, repository, and compiled map. Their fingerprinted approval
   is committed separately and is required before the scheduler can create a
   worker. When it is disabled, compilation omits that planning-review gate.
   This reuses the existing multi-agent system; it does not add another human
   approval.
4. **The continuing AI thread orchestrates implementation.** A Cursor `/loop`,
   Codex `/goal`, or Claude Code `/goal` thread acts only as the root. It creates
   one isolated worktree and fresh worker context for every ready slice. Ready
   Slices may build concurrently; the root verifies and serially integrates
   each eligible candidate as it arrives, then immediately starts newly
   unlocked work without waiting for unfinished independent workers. All
   application code and related engineering artifacts must be produced through
   this [bounded loop](../repo-overlay/docs/parallel-slices/run-sliced-plan.md),
   not through an unbounded coding prompt that bypasses it.
5. **Every slice crosses a quality boundary.** Formatting, linting, types,
   security scans, builds, tests, scope enforcement, secret protection, and
   release evidence are applied according to the slice's declared gate. A failed
   gate returns the same slice for correction instead of allowing incomplete
   work to accumulate.
6. **Configured reviewers leave permanent evidence.** Codex, Claude Code,
   Antigravity, and independent Cursor Agent CLI sessions can review one
   disposable snapshot in a configured order. They audit the compiled plan
   before workers start and may also review integrated slices. They reconcile
   findings for up to five rounds through one structured ledger; a blocking
   result returns the map or slice for bounded correction,
   while authentication or provider failure stops safely instead of being
   treated as approval.
7. **Slice commits assemble into one goal pull request.** One approved goal uses
   one branch. Its independently verifiable slices become separate commits, and
   the complete goal, usually one feature or fix, becomes one pull request. The
   agent pushes that branch, creates or updates the PR, and monitors CI when the
   approved GitHub profile enables publication. Human review happens once at
   the goal-level PR boundary, not after every slice.

The result is not merely faster code generation. It is a repeatable way to keep
AI implementation aligned with the product goal while continuously proving
that each unit of work meets its declared security, maintainability, and
acceptance standards before becoming part of the application.

## Git contexts and branch map

A run uses one named, non-protected **goal branch**. The root controller owns
its checkout. Workers do not receive their own named branches: each worker gets
a managed worktree at a detached `HEAD`, created from an exact assigned commit.
The worker's candidate commit remains outside the goal branch until the root
applies its patch, validates the integrated result, and creates a new accepted
commit on the goal branch.

| Diagram stage                                | Owner                                            | Git context                                                                | Result                                                                                         |
| -------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Product Direction                            | Developer and planning AI                        | No implementation branch mutation                                          | Requirements and product decisions become planning input.                                      |
| Product Plan                                 | Planning AI and developer                        | Goal branch                                                                | The human-approved Product Plan is committed by itself before implementation.                  |
| Architecture Package                         | Compiler input                                   | Read from the committed goal-branch checkout                               | The immutable installed architecture selection supplies contracts and quality floors.          |
| AI Compiles for Execution                    | Planning AI                                      | Goal branch                                                                | Compiled manifests, initial run state, and the dependency graph are committed separately.      |
| Independent AI Planning Review (optional)    | Configured fresh AI reviewers                    | Read-only snapshot; generated ledger committed on the goal branch          | When enabled, all reviewers approve one fingerprinted execution map before workers may start.  |
| Optimized Slice Map                          | Root controller                                  | Committed goal-branch state                                                | Ready Slices are derived from dependencies, path ownership, locks, policy, and accepted state. |
| Root Controller                              | Root controller                                  | Named goal-branch checkout                                                 | The root owns scheduling, integration, state, review, retries, and completion.                 |
| Ready Slices — Run Concurrently              | Root controller                                  | Goal branch plus one detached worktree per ready slice                     | Compatible slices receive isolated worktrees at their assigned base commit.                    |
| Scope Preflight                              | Slice worker                                     | Its detached worker worktree                                               | The worker validates its assignment and allowed scope before writing.                          |
| Build + Tests                                | Slice worker                                     | Its detached worker worktree                                               | The worker implements and tests only its assigned slice.                                       |
| Slice Gate + Self-Check                      | Slice worker                                     | Its detached worker worktree                                               | The declared gate and bounded worker review run before the candidate is created.               |
| Candidate Commit                             | Slice worker                                     | Detached `HEAD`; not the goal branch                                       | The worker creates exactly one proposed commit and returns its SHA and evidence.               |
| Each Finished Candidate Advances Immediately | Root controller                                  | Detached candidate plus the named goal-branch checkout                     | An eligible candidate enters serial integration while sibling workers may continue.            |
| Root Verify on Arrival                       | Root controller                                  | Detached candidate commit; goal branch remains unchanged                   | The root validates its tracked worker gate, checkpoint, Git identity, and boundary.            |
| Apply Candidate                              | Root controller                                  | Goal-branch working tree, with no new commit yet                           | One attempt atomically claims the goal checkout and applies its exact verified patch.          |
| Integrated Quality Pipeline                  | Root controller                                  | Goal-branch working tree containing the uncommitted candidate              | The declared gate runs against the candidate plus all previously accepted slices.              |
| Independent Review                           | Fresh reviewer or configured review orchestrator | Integrated, uncommitted goal-branch diff                                   | A non-implementing reviewer assesses behavior, scope, preservation, and maintainability.       |
| Quality + Review Pass?                       | Root controller                                  | Integrated, uncommitted goal-branch diff                                   | Passing proceeds to acceptance; failure restores the clean accepted goal state.                |
| Fresh Retry — Same Slice                     | Root and fresh worker                            | Clean goal branch plus a new detached worktree at the latest accepted base | Only the failed slice is retried; accepted commits remain unchanged.                           |
| Accept Slice Commit                          | Root controller                                  | Goal branch                                                                | State and evidence are recorded and one accepted slice commit is created on the goal branch.   |
| More Slices Running or Remain?               | Root controller                                  | Committed goal branch and durable run state                                | The root continues active work or recomputes the next Ready Slices from committed evidence.    |
| Final Goal Audit                             | Root controller                                  | Goal branch after every slice is accepted                                  | The complete integrated goal is audited once before a successful terminal state.               |
| Goal Complete                                | Root controller                                  | Committed goal branch; optionally its remote goal branch and goal-level PR | Local mode finishes; GitHub mode prepares one CI-green PR without merging or deploying.        |

## Implementation boundary

Parallel Slices does not have one executable that performs this entire diagram.
It combines deterministic enforcement scripts with controller procedures:

- `quality.mjs`, `run-state.mjs`, and `planning-review.mjs` enforce the separate
  approved-plan, compiled-execution, and independent planning-review
  boundaries.
- `architecture-package.mjs` refuses an implicit architecture replacement.
- `slice-graph.mjs` validates dependencies and calculates conflict-free Ready
  Slices.
- `run-lock.mjs` enforces one controller on the named goal branch.
- `slice-worktree.mjs` creates detached worktrees, verifies candidate commits,
  atomically claims and applies one eligible candidate, performs bounded retry
  replacement, verifies accepted content, and removes accepted worktrees.
- `gate.mjs` enforces scope and runs both isolated and integrated pipelines.
- `review.mjs` creates immutable planning and slice snapshots, coordinates
  configured reviewers, tracks approval, and writes permanent JSON and Markdown
  evidence when multi-agent review is enabled. Runs with it disabled record a
  fresh independent reviewer's slice evidence
  in committed slice state.
- `run-tracking.mjs` atomically enforces one goal-checkout integration owner and
  preserves worker, pipeline, review, retry, acceptance, and interruption
  evidence; `run-status.mjs` reports that state and recovery guidance.
- `run-state.mjs` refuses successful terminal state until every slice is
  accepted and the structured final-audit and per-slice evidence are complete.

Product discovery, implementation, worker self-review, choosing among multiple
simultaneously eligible candidates, creation of the accepted Git commit, the
semantic judgments in the final goal audit, and goal-level publication remain
controller procedures. Their scripts enforce important boundaries, but no
single command performs the entire pipeline.

In particular, a finished candidate may be verified, atomically applied,
quality-gated, reviewed, and accepted while sibling detached workers continue
at their recorded bases. Only one attempt can own the goal checkout, and the
root recomputes readiness after every accepted slice rather than waiting for a
Ready Slices batch barrier.

## Step-by-step description

### 1. Product Direction

The developer supplies the product outcome, constraints, priorities, and
consequential decisions. AI product discovery resolves important ambiguity.
This is planning input, not authorization to write application code.

### 2. Product Plan

AI writes the human-readable Product Plan with atomic requirements, locked
decisions, acceptance evidence, preservation scenarios, risks, and explicit
non-goals. The developer approves or revises that document. The approved plan
is committed alone on the goal branch before execution artifacts or application
changes are created.

### 3. Architecture Package

The selected Architecture Package is an input alongside the Product Plan, not
a later implementation stage. It supplies repository-shape assumptions,
contracts, templates, and minimum quality floors. The installed selection in
`.parallel-slices/architecture.json` is immutable unless an explicit migration
changes it.

### 4. AI Compiles for Execution

AI combines the approved plan, selected architecture, and configured sizing
strategy. It creates version 2 scope manifests, version 5 run state, slice
dependencies, path ownership, logical locks, parallel policy, exact gates,
review paths, commit subjects, and impact coverage for entry points, contracts,
consumers, data side effects, tests, and operations. It forward- and
reverse-traces repository evidence, then challenges each future worker packet
in a separate read-only pass. These compiled artifacts are validated and
committed to the goal branch separately from the approved Product Plan.

### 5. Independent AI Planning Review

When `.parallel-slices/review.json` has `enabled=true`, the multi-agent review
engine gives every configured reviewer a fresh,
read-only snapshot of the Product Plan, compiled map, current implementation,
tests, and architecture contracts. All reviewers must approve the same round.
Their generated ledger is committed separately, and worker creation verifies
its execution-map fingerprint. An audited exact-path correction invalidates the
old fingerprint and must be re-reviewed; semantic expansion returns to Product
Plan approval. With review disabled, compilation omits the planning target and
worker creation does not require a planning-review fingerprint.

### 6. Optimized Slice Map

The compiled map is the executable view of the goal. The scheduler uses
committed evidence to determine which slices are ready; it does not infer
readiness from chat history. A slice is ready only when its dependencies,
minimum project stage, worker paths, logical locks, and parallel policy permit
it to run.

### 7. Root Controller and Ready Slices

One continuing root controller owns the named goal-branch checkout and the
local run lease. It verifies durable state, computes the current Ready Slices,
and creates one detached worktree with a fresh worker context for each compatible
slice. The root orchestrates but does not implement application code.

### 8. Scope Preflight

Before writing, each worker reads the repository instructions, Product Plan,
run state, assigned scope manifest, project contracts, and testing and release
rules. It verifies a clean detached worktree at the assigned base and runs the
manifest's scope-only gate:

```bash
node scripts/parallel-slices/gate.mjs \
  --scope-file docs/plans/scopes/<feature>/<slice>.scope \
  --scope-check-only \
  --worker-id <worker-id>
```

The preflight refuses missing or inconsistent inputs before partial work can be
created.

### 9. Build + Tests

The worker implements only the requirement IDs and worker-owned paths declared
by its manifest. It adds behavior-focused tests and the required developer
release fragment, then runs the applicable targeted tests. It may not edit the
plan, manifest, aggregate run state, another slice, or coordinator-owned paths.

### 10. Slice Gate + Self-Check

The worker runs the manifest's exact quality pipeline and checks the result
against the assigned requirements, tests, preservation invariants, allowed
paths, and forbidden actions. This validates the implementation in isolation;
it does not yet prove the change works with slices already accepted on the goal
branch.

```bash
node scripts/parallel-slices/gate.mjs \
  --scope-file <scope-file> \
  --worker-id <worker-id>
```

The script records each pipeline step for interruption recovery. The bounded
self-check itself is a worker procedure rather than a separate executable
validator.

### 11. Candidate Commit

After the isolated gate passes, the worker confirms that only authorized paths
changed and creates exactly one commit using the manifest's required subject.
This candidate lives at detached `HEAD`, not on a worker branch and not on the
goal branch. The worker returns the candidate SHA, changed paths, gate evidence,
self-check summary, and blockers. The worker also checkpoints the candidate in
ignored runtime tracking:

```bash
node scripts/parallel-slices/run-tracking.mjs checkpoint \
  --worker-id <worker-id> \
  --role worker \
  --phase candidate_ready \
  --candidate-commit HEAD
```

### 12. Each Finished Candidate Advances Immediately

The root begins admission checks as soon as one worker returns a candidate; it
does not wait for every sibling worker in the Ready Slices result to finish.
The worker lanes remain parallel while each eligible candidate enters the one
serial integration slot. A verified candidate waits only for its declared
dependencies, a clean goal checkout, and the exclusive integration claim, not
for unfinished independent workers or a global slice-number barrier.

### 13. Root Verify on Arrival

The root verifies repository evidence instead of trusting the worker's report:

```bash
node scripts/parallel-slices/slice-worktree.mjs verify \
  --worker-id <worker-id>
```

This is an admission-control check, not another implementation gate. It proves
that the worker has a passed tracked pipeline and matching `candidate_ready`
checkpoint, the worktree is clean, the candidate is exactly one commit above
the assigned base, the subject is exact, metadata still matches the committed
manifest, and every changed path belongs to the worker. The goal branch remains
unchanged throughout this step.

### 14. Apply Candidate

When the serial integration slot is available, the root runs:

```bash
node scripts/parallel-slices/slice-worktree.mjs apply \
  --worker-id <worker-id>
```

The command re-verifies the candidate, requires all declared dependencies to be
accepted, requires a clean named goal-branch checkout, and atomically refuses a
second integration owner. It records the goal base, applies the candidate
without committing, proves the resulting changed paths exactly match the
verified candidate, and records `candidate_applied`. This is not a branch
merge. The goal branch's `HEAD` still points to the latest accepted commit
while the candidate patch is present in its working tree.

### 15. Integrated Quality Pipeline

The root updates only coordinator-owned state and evidence paths, then reruns
the exact declared gate with the candidate combined with all previously
accepted slices:

```bash
node scripts/parallel-slices/gate.mjs \
  --scope-file <scope-file> \
  --integrated \
  --worker-id <worker-id>
```

This catches integration failures that the isolated worker gate could not see.

### 16. Independent Review

An independent reviewer that did not implement the slice examines the
integrated, uncommitted goal diff and checks behavior, tests, scope,
preservation, security, and maintainability. When multi-agent review is
enabled, the configured orchestrator records its tracked approval and permanent
structured artifacts; the root does not treat a provider failure, malformed
result, or unavailable reviewer as approval.

```bash
node scripts/parallel-slices/review.mjs run \
  --scope-file <scope-file> \
  --worker-id <worker-id>
```

When multi-agent review is disabled, the root instead uses a fresh read-only
native review agent and records its identity, reviewed boundary, outcome, and
concise findings in the slice's `reviewEvidence` state array. It does not
manually create the multi-agent JSON or Markdown artifacts.

### 17. Quality + Review Pass?

This decision combines the integrated gate and independent review outcomes.
`YES` permits acceptance. `NO` preserves the failure evidence, restores the
goal checkout to its latest clean accepted state, and sends only that slice
through bounded correction.

### 18. Fresh Retry — Same Slice

The root creates a new detached worktree and fresh worker context from the
latest accepted goal-branch commit. The retry uses the same committed manifest
and receives the prior finding IDs. Previously accepted slice commits remain
unchanged. After three rejected fresh-worker corrections, the run returns
`FAILED` instead of weakening a gate or expanding scope.

### 19. Accept Slice Commit

After the integrated gate and review both pass, the root records the candidate
SHA, gate and review evidence, and accepted slice state. It creates one new
accepted commit on the named goal branch using the manifest subject, verifies
that worker-owned blobs were preserved, and removes the accepted worker
worktree. The accepted goal-branch commit normally has a different SHA from the
detached candidate commit because it is created in a different Git context and
includes coordinator-owned evidence.

The root creates the Git commit as a controller procedure. Afterwards,
`slice-worktree.mjs accept` requires the tracked integrated gate to have passed,
an enabled multi-agent review to have tracked approval, the accepted commit to
have the claimed goal-base parent and exact manifest subject, committed gate
and review evidence to match, both configured review artifacts to exist when
that mode ran, and every worker-owned blob to equal the reviewed candidate.
`slice-worktree.mjs remove` refuses to remove anything except that accepted,
clean worktree.

### 20. More Slices Running or Remain?

Immediately after each accepted commit, the root reruns `slice-graph.mjs ready`
against the committed goal branch and state. It may start newly unlocked,
non-conflicting workers while older independent workers continue, and it may
admit the next already verified eligible candidate as soon as the goal checkout
is free. Future readiness is never cached from an earlier iteration.

### 21. Final Goal Audit

The final audit runs once, only after every slice in the complete goal has been
accepted and no work remains. The root proves:

- every Product Plan requirement has acceptance evidence;
- preservation scenarios and existing behavior remain intact;
- every required quality gate passed on the integrated goal branch;
- required reviews completed and blocking findings were resolved;
- required developer release fragments exist;
- every accepted slice commit and state entry is present and consistent; and
- explicit non-goals were not implemented.

The audit's semantic conclusions are a controller responsibility, but its
record is enforced. Before the terminal-state commit, `finalAudit` must name the
current audited commit, every accepted slice in numeric order, a canonical
completion time, and non-empty evidence arrays for requirements, preservation,
gates, reviews, release fragments, state, and non-goals. `run-state.mjs` refuses
`finished` or `pull_request_ready` unless every slice is accepted, every slice
has gate and review evidence, and any multi-agent review artifacts form a
complete JSON/Markdown pair at the audited commit. Non-successful state requires
`finalAudit` to remain `null`.

### 22. Goal Complete

In local-only mode, the root commits terminal state and returns
`MILESTONE_FINISHED`. In GitHub mode, it pushes only the goal branch, creates or
updates one pull request for the complete goal, monitors required CI to green,
and returns `PULL_REQUEST_READY`. Completion does not authorize merging the pull
request, pushing a protected branch, deploying, publishing, or running a
production migration.

The run-state validator recognizes `finished` and `pull_request_ready`, and the
run-lock implementation refuses normal release before a terminal status or
while active worker attempts remain. GitHub publication itself is a documented
controller procedure using the authorized repository profile and `gh`; it is
not performed by a single Parallel Slices publication command.

## Failure and stopping boundaries

`BLOCKED` stops the run when a decision, ownership conflict, unsafe state, or
scope expansion requires the developer. `FAILED` stops after the bounded
correction cycle cannot produce an acceptable slice. Neither condition permits
the root to fix application code directly, weaken a gate, discard unrelated
work, or continue into a later goal.
