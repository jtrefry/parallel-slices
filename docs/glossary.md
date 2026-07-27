# Glossary

Short definitions of the terms used across the Parallel Slices documentation.
The [README](../README.md) introduces the model; the
[mechanism map](mechanism-map.md) explains which files implement each concept.

## Slice

One small, coherent subfeature built vertically through every software layer it
needs, sized so it can be implemented, tested, and verified independently. A
slice is the unit of AI autonomy: it has one declared scope, one quality gate,
one candidate commit from a worker, and one accepted commit on the goal branch.

## Subfeature

The same concept as a slice, seen through the cake metaphor: each cake slice is
one subfeature of the product, baked independently and assembled into the whole
one at a time. The documentation uses "slice" and "subfeature" interchangeably.

## Ready Slice

A slice whose dependencies are all accepted and whose path ownership, resource
locks, and parallel policy allow it to start now. Ready Slices may build
concurrently in separate worker worktrees; the root controller recalculates
readiness after every accepted slice.

## Slice DAG

The compiled dependency graph of a milestone's slices: a directed acyclic graph
that records which slices depend on which. The DAG determines integration order
and which slices are eligible to run in parallel.

## Root controller

The single continuing `/loop` or `/goal` thread that owns a run's lifecycle. It
holds the goal-branch checkout, computes Ready Slices, creates worker
worktrees, verifies and serially integrates candidates, records durable state,
and performs the final goal audit. It never implements slice code itself. The
documentation uses "controller" for this lifecycle-owner role; the default
controller recorded in `.parallel-slices/agent.json` is a convenience default,
not ownership of an active run.

## Worker

A fresh, bounded agent context created by the root controller for exactly one
slice. Each worker operates in an isolated detached worktree, implements only
its worker-owned paths, runs its declared quality gate, and returns one
candidate commit plus compact evidence. A retry uses a new worker, never a
continued one.

## Candidate

The single proposed commit a worker produces on a detached `HEAD`. A candidate
is not part of the goal branch until the root controller verifies its gate and
boundary, applies it to the clean goal checkout, reruns the integrated gate and
review, and creates the accepted slice commit.

## Goal branch

The one convention-compliant, non-protected Git branch that carries an approved
goal. Every accepted slice becomes one commit on this branch, and the complete
goal becomes one pull request. Protected branches such as `main` are never used
as the implementation checkout.

## Run lease

An ignored local lock file under `.parallel-slices/runtime/` naming the one
controller that owns an active run on the current machine. It prevents a second
tool from taking over the run; handoff requires a clean boundary and an
explicit lease release.

## Attempt ledger

The ignored per-attempt runtime records under `.parallel-slices/runtime/`: a
runtime `index.json` referencing separate `worker.json` and `integration.json`
files for every numbered slice attempt. Ledgers retain pipeline steps,
interruptions, failures, retries, and cleanup. A retry appends a new attempt
instead of overwriting failed evidence, and ledgers are never committed.

## Scope manifest

The committed per-slice contract under `docs/plans/scopes/`. It declares the
slice's dependencies, worker-owned paths, root-owned evidence paths, logical
resource locks, parallel policy, tests, quality pipeline, and exact commit
subject. The scope gate refuses any write outside the manifest, and existing
manifests are immutable.

## Coverage (change, preserve, not-applicable)

The machine-validated impact classification compiled into each slice for entry
points, contracts, consumers, data side effects, tests, and operations. Each
item is marked `change` (the slice modifies it), `preserve` (the slice must
leave it working), or `not-applicable`. This compile-time evidence explains why
the worker's scope is sufficient.

## Fingerprinted approval

The result of optional independent AI planning review. Configured reviewers
audit one immutable snapshot of the Product Plan, repository, and compiled
execution map; their approval ledger records the exact snapshot fingerprint and
is committed separately. When review is enabled, no worker can start without a
committed approval that matches the current fingerprint.

## Attestation

The SHA-256 and executable-bit record of every generated file, written to
`.parallel-slices/generated-baseline.json` at project creation. Only a tree that
still exactly matches its attestation may use the narrow generated-baseline
pipeline; any other change requires normal initialization.

## Product Plan

The human-readable plan an agent writes before any application code:
requirements, locked decisions, architecture, preservation rules, acceptance
evidence, risks, and non-goals. The developer approves it, and it is committed
by itself before AI compiles the execution files. It is the human approval
surface for a milestone.

## Architecture Package

A versioned package that owns the application and platform assumptions the core
deliberately avoids: the generator, scaffold, overlays, verifier, quality
floors, initialization commands, and required project documents for one stack.
The bundled `nextjs-gcp-postgres` package is one example. See
[architecture packages](architecture-packages.md).

## Version 2 manifests

The current internal format version of the compiled scope-manifest files. The
number identifies the manifest file format so tooling can validate and migrate
it; it is not a product or release version of Parallel Slices.

## Version 5 JSON state

The current internal format version of the durable run-state file under
`docs/plans/loop-runs/`. Like the manifest version, it identifies the file
format contract (fields such as the plan commit, compilation snapshot, and
sizing rationale), not a product version. New compilations require version 5;
older state versions remain readable so accepted work is never discarded.
