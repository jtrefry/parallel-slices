---
name: plan-milestone
description: Plan a development milestone so it can run to completion autonomously. Requirements interview, committed ground-truth references, process sizing, and every authorization collected before work begins. Use before starting any substantial build, port, or migration.
---

# Plan a milestone

The developer's involvement ends when the plan is approved. From that moment
the work runs on its own, and the only things handed back are a finished
result and any procedure only a human may execute. That is a design constraint
on this phase, not an aspiration: anything the run will need later has to be
settled here, because stopping mid-run to ask for something the plan already
implied is a planning failure, not a safety feature.

Every rule in this skill is load-bearing. Each one traces to a measured
failure in a real autonomous run; the receipts are at the end.

## 1. Interview for requirements

- Ask only consequential questions, but resolve every consequential ambiguity
  before writing the plan. A question that would change what gets built is
  cheap now and expensive later.
- Record atomic requirements with stable IDs, each with observable acceptance
  evidence: something a test, a command, or a person can check. A requirement
  whose evidence no implementation could produce is a defect in the plan.
- Record non-goals explicitly. Work that must remain unchanged is a
  requirement too.
- For a port, the porting rule is: the legacy application is authoritative for
  behavior and carries no authority over implementation. Reproduce exactly
  what a user can see or get; write everything else to current practice. When
  choosing an implementation, ask whether a user can observe the difference.

## 2. Commit ground truth before anyone builds

When the work must reproduce existing behavior, commit a reference document
before implementation starts, using `files/ground-truth-template.md` beside
this skill. It must contain:

- Exact values copied from the source, never retyped or paraphrased, each with
  the producing file and line cited so a reader can verify without leaving the
  repository.
- An "oddities that must survive" section naming everything a well-meaning
  editor would correct: misspellings, trailing whitespace, duplicate values,
  inconsistent casing. Tests should assert these exactly so an accidental
  cleanup fails the build.
- Honest confidence labels. If one section is read from source and another is
  inferred, say which is which. The weakest claim in a document otherwise
  inherits the credibility of the strongest.

Verify wire contracts against the code that produces them, never from memory
and never by inventing plausible names. If a service builds its response from
a database reader or a serializer, read that code and record the field names
verbatim. Fixtures built from invented names agree with the mistake, so every
test stays green while every real call fails.

## 3. Size the process

Process has a fixed cost per workstream that barely varies with workstream
size. Pick the smallest tier the work justifies, and write the choice into the
plan:

- **solo**: one agent, project quality gates, no independent review. Small,
  low-risk changes.
- **reviewed**: one agent plus one independent review round
  (`review-and-decide`). Most feature work and small ports.
- **parallel**: shared contracts first, parallel isolated workers, one review
  of the integrated result (`build-parallel` then `review-and-decide`). Only
  when the plan contains genuinely independent workstreams that are each
  substantial on their own. If the workstreams are hours rather than days, use
  fewer, bigger workstreams or a lower tier: the toll will otherwise exceed
  the work.

## 4. Collect every authorization

List every external action the plan could require: publishing a package,
pushing a branch, opening a pull request, deploying, mutating a secret or any
external system. Ask for all of them in one conversation, and record what was
granted and what was withheld. A withheld authorization is a constraint to
plan around, not a surprise to hit mid-run.

If a dependency might need changing (a shared library missing a capability the
work needs), name that possibility now and settle who may change and publish
it.

## 5. Approval

Present the plan once, with any review verdicts alongside it. Never present a
document that already claims approval: no pre-filled "Approved by" line, no
approval date on a document the developer has not seen. After approval the
plan is immutable; a change to requirements goes back to the developer rather
than being edited in place.

## Output

One committed plan document containing: numbered requirements with acceptance
evidence, non-goals, locked decisions, the process tier, the authorization
record, and links to the committed ground-truth references. When it is
approved, the run starts and the developer's part is done.

## Receipts

Each rule above exists because its absence was measured, once, expensively:

- A 26-hour autonomous run stalled mid-flight on a library publish nobody had
  asked about during planning, with eight workstreams queued behind it.
- Every wire field name in a service adapter was invented instead of read from
  the producing code. All tests stayed green because the fixtures agreed with
  the mistake; every real call would have returned nothing.
- A ported status map carried values with a deliberate misspelling and two
  trailing spaces. A generic "trim all text" transform silently destroyed
  them; only a committed oddities list with byte-exact tests caught it.
- Acceptance evidence for a data export cited "the recorded legacy mapping"
  when no record existed; the test compared two lists written by the same
  author in the same change and proved nothing.
- A draft plan copied from an approved one carried the previous "Approved by"
  line, presenting the developer with a document that claimed they had already
  signed it.
- An eleven-workstream decomposition of a 308-line controller spent roughly
  ten times more on process than on the port itself.
