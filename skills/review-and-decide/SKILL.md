---
name: review-and-decide
description: Run one round of independent review on an integrated change set with fresh agents, then decide every finding on the record. Reviews inform the decision and never hold a veto. Use after integration, before declaring a milestone or substantial change complete.
---

# Review once, then decide

One round of independent review. The orchestrator reads every finding, decides
each one with a written reason, applies the corrections it chooses, re-runs
the gates, and closes the phase. There is no second round: not to confirm a
fix, not because the changes were large, not because a finding looked serious.

The reason is measured, not assumed. Review is very good at finding the first
tranche of defects in a piece of work and much worse at converging, because
correcting anything gives the next round new material to read. Rounds two and
three arrive after the cheap findings are already in hand, and they are the
most expensive part of the pipeline.

## 1. Run the review

- Spawn fresh agents that did not build the work, using
  `files/review-prompt-template.md` beside this skill. Two is both the default
  and the ceiling: uncorrelated errors are the entire mechanism, and a third
  reviewer pays the same price for a much smaller return. Drop to one only when
  the change touches nothing a gate cannot see: no wire contract, no security
  boundary, no parity data, no platform this host cannot exercise.
- If the project's `AGENTS.md` names a reviewer invocation, use it: run that
  command once per reviewer, pass the review prompt on standard input, and read
  the verdict and findings from standard output. Reviewers whose errors are
  uncorrelated are the entire mechanism, and two reviewers on one model share
  its blind spots, so a project that cares about the second opinion points it at
  a peer-capability model from a different provider. With no invocation named,
  spawn fresh agents in the current tool.
- They review the real integrated diff against the plan, the contracts, and
  the ground-truth documents, not a summary of it.
- They work independently and never see each other's conclusions. Two
  reviewers whose errors are uncorrelated catch what either alone misses;
  a reviewer who has read another's findings is no longer an independent
  sample.
- They report every finding at the severity they actually believe, with file
  and line evidence, and they know their verdict informs a decision rather
  than blocking anything. That framing matters: a reviewer with a veto learns
  to negotiate; a reviewer without one reports what is real.

Point them at the failure classes that gates cannot catch: contract and wire
mismatches against the producing source, byte-exact parity against ground
truth, security boundaries (what reaches logs, bundles, and serialized
payloads), platform differences between the development host and the
deployment target, and silent data rewriting inside transforms.

## 2. Verify before deciding

Reviewers are independent inputs, not oracles. Before acting on a finding,
check the claim: run the probe, read the producing source, measure the
behavior. In the field trial, one confidently-worded finding was refuted by a
two-minute probe build, and one "inert, remove it" finding turned out to be a
load-bearing security pin the reviewer had not traced. Trust the verdict as
signal; never trust the explanation without checking it.

The same courtesy runs the other way: when a finding is right, say so plainly
and fix it, even when the fix embarrasses earlier work.

## 3. Decide every finding on the record

Write the decisions into a committed file using
`files/decisions-template.md`. Every finding gets exactly one of:

- **fixed**, with what changed and how it was verified; or
- **accepted**, with a substantive reason a stranger could evaluate later.

Corrections get built and re-gated, not re-reviewed. The gates prove the fix
compiles, passes, and stays inside its boundary; a fresh review round would
prove only that reviewers can always find something new.

A finding you cannot decide is structural: it needs a plan revision, a tooling
change, or a developer decision, none of which another review can supply. Take
it to the developer as a decision, not as a review escalation.

## Receipts

- Under a three-round cap, a single workstream consumed three build-and-review
  cycles over several hours, and each round found new material in the work the
  previous round had caused. The useful findings all arrived in round one.
- Under a unanimity rule, reviewers deadlocked a planning gate for eight
  rounds; a gate nothing can satisfy is not a gate.
- One round caught, among other things: a container that validated its
  configuration and never ran the validator, invented wire field names that
  kept every test green, a transform silently destroying byte-exact parity
  values, a 71-second regular-expression hang, and a manual procedure that
  printed identifying data while asserting it did not.
- A reviewer's recommended fix was mechanically impossible (the package had no
  install scripts to allow-list); the builder proved it from a clean install
  and fixed the symptom properly. Verify, then decide.
