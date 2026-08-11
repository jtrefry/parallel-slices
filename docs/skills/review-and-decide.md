# review-and-decide, explained

The rulebook itself: [`skills/review-and-decide/SKILL.md`](../../skills/review-and-decide/SKILL.md)

## What it is

`review-and-decide` is the quality inspection at the end of a piece of
work: fresh agents who did not build it read the real changes and report
everything they find, then the orchestrator decides every finding, in
writing, and closes the phase. One round, no matter what.

## The features, the decisions behind them, and why they help

### 1. Exactly one round of review

This is the skill's most counterintuitive rule, and it is measured, not
assumed. Review is excellent at finding the first tranche of real defects
in a piece of work, and bad at converging: every correction gives the next
round new material to read, so rounds two and three arrive after the cheap
findings are already in hand, and they are the most expensive part of the
whole pipeline. In the field trial, a three-round cap still let one
workstream burn three build-and-review cycles over several hours, each
round finding new things in the fixes from the previous one. The useful
findings all arrived in round one.

So: one round. Corrections are rebuilt and re-run through the quality
gates, which prove the fix compiles, passes, and stays in bounds. They are
not re-reviewed, because a fresh review round would prove only that
reviewers can always find something new.

### 2. Reviewers are fresh, independent, and have no veto

- **Fresh**: reviewers did not build the work, so they carry none of the
  builder's assumptions.
- **Independent**: when there is more than one reviewer, none sees another's
  conclusions. Two reviewers whose mistakes are
  uncorrelated catch what either alone would miss; a reviewer who has read
  another's findings is no longer an independent sample. Two is both the
  default and the maximum: the uncorrelated pair is what does the work, and a
  third reviewer costs as much as the second while finding much less. One
  reviewer is enough only when the change touches nothing the automated checks
  are blind to.
- **No veto**: reviewers report findings at the severity they actually
  believe, knowing the verdict informs a decision rather than blocking
  anything. This framing is load-bearing: a reviewer with a veto learns to
  negotiate; a reviewer without one reports what is real. (The receipt for
  the alternative: under a unanimity rule, reviewers once deadlocked a
  gate for eight rounds. A gate nothing can satisfy is not a gate.)

**Choosing the reviewer's model.** By default reviewers run in whatever tool
is driving the work, on whatever model that tool is using. That is the weakest
version of the idea: two reviewers on one model make the same mistakes, so the
second one mostly agrees with the first. A project can name a different
reviewer command in its own `AGENTS.md`, and the orchestrator will use it. The
README explains how, with examples for each provider.

Reviewers read the real integrated changes against the plan, the
contracts, and the ground truth, never a summary. Their prompts are built
from `files/review-prompt-template.md`.

### 3. Reviewers hunt what automated checks cannot catch

Tests and linters are good at what they encode. Reviewers are pointed at
the failure classes no gate can see: field names that match the fixtures
but not the real service, values silently rewritten inside transforms,
security boundaries (what leaks into logs or shipped bundles), differences
between the machine the code was built on and the machine it will run on,
and configuration that is validated but never actually applied.

That last one is real: one round of review caught a container that
validated its configuration and never ran the validator, invented wire
names that kept every test green, a transform destroying values that had
to survive byte-for-byte, and a 71-second regular-expression hang.

### 4. Findings are verified before they are acted on

Reviewers are independent inputs, not oracles. Before acting on a finding,
the orchestrator checks the claim: run the probe, read the producing code,
measure the behavior. In the field trial, one confidently-worded finding
was refuted by a two-minute test build, and one "this is inert, delete it"
finding turned out to be a load-bearing security setting the reviewer had
not traced. Trust the verdict as a signal; never trust the explanation
without checking. The same honesty runs the other way: when a finding is
right, it gets fixed plainly, even when the fix embarrasses earlier work.

### 5. Every finding gets a written decision

Using `files/decisions-template.md`, every finding ends in exactly one of
two states, on the record:

- **fixed**, with what changed and how the fix was verified; or
- **accepted**, with a substantive reason a stranger could evaluate later.

**Why write it down:** an undecided finding is a loose end that resurfaces
as an argument; a decided one is a fact. And a finding the orchestrator
cannot decide is structural: it needs a plan change, a tooling change, or
your judgment, so it goes to you as a decision to make, not as another
round of review.

## What you get at the end

The work as built, corrected where the orchestrator chose to correct it,
re-gated, with a committed decisions document listing every finding and
its fate. You can audit any decision later because the reason is written
next to it.

## The stories behind the rules

- Three review rounds on one workstream, hours each, with all the value in
  round one. Hence the single round.
- An eight-round deadlock under a unanimity rule. Hence no veto.
- A refuted "confident" finding and a nearly-deleted load-bearing security
  pin. Hence verify before deciding.
- A validator that was never run, invented wire names under green tests, a
  destructive transform, and a 71-second regex hang, all caught by one
  independent round. Hence the review exists at all.
