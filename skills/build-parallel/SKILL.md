---
name: build-parallel
description: Execute an approved plan with parallel workers in isolated git worktrees. Shared contracts are written and reviewed first, each workstream gets a fresh agent with an explicit boundary, and integration is serial and atomic. Use when an approved plan declares the parallel tier.
---

# Build in parallel

One orchestrator, several fresh workers, each in its own detached git
worktree. Workers never see each other; only the orchestrator touches the goal
branch. The orchestrator makes decisions and delegates work; it does not write
application code itself.

Preconditions: an approved plan (`plan-milestone`) that declares the parallel
tier, names the workstreams, and records every authorization the run needs.

## 1. Contracts first

Before any parallel work starts, write and commit the interfaces the
workstreams will meet at: shared types, ports, function signatures, wire
schemas. Give this contract the hard review, because everything downstream
conforms to it.

Two workstreams built concurrently are correct in isolation and still wrong
together if they meet at an interface neither could see whole. The contract
commit is what makes "independent" true rather than hopeful.

## 2. Isolate each worker

Create one detached worktree per workstream with `files/worktree.mjs` (beside
this skill):

```bash
node <skill-dir>/files/worktree.mjs create --at <base-commit>
node <skill-dir>/files/worktree.mjs remove <path>   # after acceptance
```

Spawn one fresh agent per workstream with no inherited conversation. Build its
assignment from `files/worker-packet-template.md`. The packet must contain:

- the worktree path, base commit, and the exact paths the worker owns;
- the contracts it conforms to and the ground-truth documents it copies from,
  both read-only;
- the platform truths that differ between the development host, the developer
  workstations, and the deployment target;
- the forbidden actions: never push, publish, deploy, or touch another
  workstream's paths;
- the two clauses that do the most work: **verify premises** and **report
  honestly** (both spelled out in the template).

Workers commit their own candidate in their own worktree; the assignment is
the authorization, and a local commit in an isolated worktree is fully
reversible. Workers never push.

## 3. Integrate serially and atomically

One candidate at a time, and each integration runs start to finish before
anything else touches the goal branch:

1. Verify the candidate: exactly one commit on the assigned base, clean
   worktree.
2. Check its boundary with `files/scope-check.mjs`: only owned paths changed.
   ```bash
   node <skill-dir>/files/scope-check.mjs --base <base-commit> --allow "src/gateway/**" --allow "tests/gateway/**"
   ```
3. Apply it to the goal branch and run the project's full quality gate with
   caching disabled or bypassed. **A cached pass is not evidence**: task
   runners replay results across worktrees, and a gate that reports green in
   milliseconds executed nothing.
4. Commit the accepted result, then move to the next candidate.

Do not interleave. Committing anything else mid-integration corrupts the
sequence in ways that surface later and cost more than the discipline does.

## 4. Orchestrator discipline

- **Finish one integration completely before committing anything else.**
  Applying a candidate stages it; an unrelated `git add X && git commit` at
  that moment swallows the whole workstream into a mislabeled commit.
- **Freeze the goal branch while a review runs.** A review reads the tree it
  was given; any commit underneath it invalidates the round and wastes every
  reviewer's work.
- **Re-derive state before acting on it; never trust memory.** Before writing
  a worker packet or integrating, check what is actually in the tree, what the
  base commit actually contains, and what the ledger actually says. Every
  wrong premise handed to a worker in the field trial was remembered state;
  every measured premise was right.
- **Keep visible status truthful.** Update the task list the developer can
  see at every phase change, and distinguish "working" from "stalled": a
  quiet phase is normal during long builds, and the developer cannot tell
  silence from death unless you say which it is.
- **Never weaken a gate to make work pass.** If a gate is wrong, stop and fix
  the gate as its own change, with its own reasoning.

## 5. When a worker returns

Workers return a candidate, a self-check against their assignment, and an
honest account of what they verified and on which platform. Read the
self-check skeptically: a worker that says "verified by construction, not
tested here" is being honest, and a worker that claims verification without
saying where is not done. If a worker refuses an instruction because its
premise is wrong and shows evidence, that is the system working; check the
evidence and correct the plan, not the worker.

After all workstreams integrate, run `review-and-decide` on the integrated
result.

## Receipts

- Two concurrent workstreams met at an unseen interface: the data gateway
  omitted the flag the domain layer sorted by, and rejected the date formats
  the domain layer documented. Every test in both passed.
- An orchestrator committed a one-file doc fix during integration, twice, and
  each time the staged candidate was swallowed into a commit labeled as
  something else.
- A quality gate reported green in 13 milliseconds by replaying a sibling
  worktree's cached result; forcing execution exposed a real failure it had
  hidden. A worker's pre-commit hook did the same with another worktree's
  14-test run standing in for its own 161.
- A committed doc fix made mid-review invalidated the round after both
  reviewers had finished reading; their verdicts were discarded.
- Workers refuted five orchestrator premises with evidence, including "the
  candidate is in your base" (it was dangling) and "this path is in your
  allow set" (the gate rejected it). Every refutation was correct.
- A developer watching an unchanged progress display asked twice whether the
  run was stuck; both times it was mid-container-build and nothing said so.
