# build-parallel, explained

The rulebook itself: [`skills/build-parallel/SKILL.md`](../../skills/build-parallel/SKILL.md)

## What it is

`build-parallel` is how one orchestrating agent runs several worker agents
at the same time without them colliding, then combines their work into one
branch, one piece at a time. It exists for plans big enough that building
everything in sequence would waste the parallelism agents make cheap.

The shape in one sentence: agree on the meeting points first, give every
worker a sealed room and a written assignment, then merge the results one
at a time through the full battery of checks.

## Words used here

- **Worktree**: git can check out the same repository into several
  independent folders at once. Each worker gets its own, so nobody edits
  anyone else's files. "Detached" means the worktree is pinned to an exact
  snapshot rather than following a moving branch.
- **Contract**: the shared interface two pieces of code meet at: type
  definitions, function signatures, the shape of data sent over the wire.
- **Candidate**: a worker's finished result, delivered as exactly one
  commit in its own worktree, ready to be judged.

## The features, the decisions behind them, and why they help

### 1. Contracts are written and reviewed before anyone builds

Before parallel work starts, the interfaces where workstreams will meet are
written, hard-reviewed, and committed.

**Why:** two workstreams built at the same time can each be correct alone
and still wrong together, if they meet at an interface neither saw whole.
The receipt: a data layer omitted the field the domain layer sorted by and
rejected the date formats the domain layer documented, and every test in
both passed. The contract commit is what makes "independent" true rather
than hopeful.

### 2. Each worker is genuinely isolated

Every workstream gets a fresh agent (no inherited conversation, so no
inherited misunderstandings) in its own detached worktree, created with the
bundled `files/worktree.mjs` helper. The worker's assignment is built from
`files/worker-packet-template.md` and spells out:

- exactly which paths it owns, and that everything else is off-limits;
- the contracts and ground-truth documents it must conform to, read-only;
- the platform differences that matter (what runs on your machine versus
  what runs where the code ships);
- the forbidden actions: never push, publish, deploy, or touch another
  workstream's files;
- two standing clauses that do the most work: **verify premises** (check
  the assignment's claims against reality before building on them) and
  **report honestly** (say what was verified, where, and what was not).

Workers commit their own candidate locally. A local commit in an isolated
worktree is fully reversible, so the assignment itself is the permission;
nobody stops to ask.

**Why fresh agents:** an agent that watched the planning debate carries its
conclusions, including the wrong ones. A fresh agent only knows what the
packet says, which forces the packet to be complete.

### 3. Integration is serial and atomic

Combining results happens one candidate at a time, and each integration
runs start to finish before anything else touches the goal branch:

1. Verify the candidate: exactly one commit, on the assigned base, clean.
2. Check its boundary with `files/scope-check.mjs`: only the owned paths
   changed. A worker that drifted outside its lane is caught here, not in
   production.
3. Apply it and run the project's full quality gate **with caching
   disabled**. Build tools cache aggressively, and a cached "pass" proves a
   sibling worktree passed once, not that this combination passes now. The
   receipt: a gate reported green in 13 milliseconds by replaying another
   worktree's result; forcing real execution exposed a real failure.
4. Commit the accepted result, then take the next candidate.

**Why serial:** merging two things at once means neither was tested against
the other. Slower and certain beats fast and entangled.

### 4. Orchestrator discipline

The orchestrator follows rules that all trace to expensive accidents:

- **Never commit anything unrelated mid-integration.** Applying a candidate
  stages its changes; an innocent one-file commit at that moment swallows
  the entire workstream into a mislabeled commit. It happened twice in one
  trial.
- **Freeze the goal branch while a review runs.** Reviewers read the exact
  tree they were given; a commit underneath them invalidates the whole
  round. One doc fix discarded two finished reviews.
- **Re-derive state; never trust memory.** Before writing a packet or
  integrating, check what the tree, the base commit, and the records
  actually say. In the field trial, every wrong premise handed to a worker
  was remembered state; every measured premise was right.
- **Keep visible status truthful.** Long builds have quiet phases, and from
  the outside a quiet run and a dead run look the same. The status the
  developer can see must say which it is. A real developer asked twice
  whether a run was stuck; both times it was mid-build and nothing said so.
- **Never weaken a gate to make work pass.** If a gate is wrong, fixing the
  gate is its own change with its own reasoning. Loosening checks to get
  green is how quality debt becomes invisible.
- **Correct once, then escalate.** If a candidate fails the same check again
  after one correction, the problem is the plan or the contract rather than
  the worker, and a third attempt spends more time to produce a different
  failure. The orchestrator stops and brings you the decision.

### 5. Workers are allowed to push back

A worker returns its candidate with a self-check: what it verified, on
which platform, and what it could not verify. "Verified by construction,
not tested here" is an honest answer; an unqualified "verified" with no
location is not done. And when a worker refuses an instruction because the
instruction's premise is wrong, showing evidence, that is the system
working. In the field trial workers refuted five orchestrator premises,
and every refutation was correct.

## What you get at the end

All workstreams integrated on the goal branch, each having passed the
boundary check and the full uncached gate, ready for one independent
review round via `review-and-decide`.

## The stories behind the rules

- Two correct-in-isolation workstreams met at an unseen interface and were
  wrong together while fully green. Contracts first.
- A staged candidate was twice swallowed by an unrelated commit. Atomic
  integration.
- A 13-millisecond "pass" had executed nothing. Caching disabled during
  integration.
- A mid-review commit threw away two completed reviews. Freeze the branch.
- Five wrong premises given to workers were all remembered rather than
  measured. Re-derive state.
- A silent run was mistaken for a dead one, twice. Status must say
  "working" or "stalled," explicitly.
