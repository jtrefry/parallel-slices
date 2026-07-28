# plan-milestone, explained

The rulebook itself: [`skills/plan-milestone/SKILL.md`](../../skills/plan-milestone/SKILL.md)

## What it is

`plan-milestone` turns "I want the app to do X" into a written plan so
complete that an AI agent can build X from start to finish without stopping
to ask you anything. Your involvement is deliberately reduced to two
moments: approving the plan at the start, and receiving the finished result
at the end.

That sounds like a convenience feature. It is actually the core design
constraint: an autonomous run that stops halfway to ask a question can sit
stalled for hours before anyone notices, because a paused run and a working
run look identical from the outside. Everything this skill does exists to
make sure the question never comes up.

## The features, the decisions behind them, and why they help

### 1. A requirements interview, not a guessing game

Before planning, the agent interviews you, asking only questions whose
answers would change what gets built. Each requirement is recorded as a
small, numbered statement with **acceptance evidence**: a concrete thing a
test, a command, or a person can check to confirm it is done.

**Why this way:** vague requirements do not fail loudly; they fail as
plausible-looking code that does the wrong thing. Evidence you can check is
the difference between "the agent says it works" and "here is proof."

**Non-goals are recorded too.** Writing down what must NOT change protects
the parts of your app you care about from well-meaning "improvements."

**For ports** (rebuilding an existing app on a new stack), the skill fixes a
rule that settles a thousand small arguments in advance: the old app is the
authority on behavior a user can see, and has no authority over how the new
code is written. If a user could not observe the difference, the new code
does it the modern way.

### 2. Ground truth is written down before anyone builds

When the work must reproduce existing behavior, the agent first commits a
reference document (from `files/ground-truth-template.md`) containing exact
values copied from the source, each with a citation to the file and line
that produced it.

**Why copied, never retyped:** retyping invents errors, and paraphrasing
invents "corrections." The document includes a section literally called
"oddities that must survive": misspellings, trailing spaces, duplicated
values, anything a tidy-minded editor would fix. Tests then assert those
oddities exactly, so an accidental cleanup fails the build instead of
shipping.

**Why confidence labels:** if one section was read from source and another
was inferred, the document says which is which. Otherwise the weakest claim
silently borrows the credibility of the strongest.

**Why wire contracts are read from producing code:** when your app talks to
a service, the field names must come from the code that actually produces
them, never from memory or plausible guessing. Invented names have a nasty
property: the tests agree with the fixtures, the fixtures agree with the
mistake, everything stays green, and every real call fails.

### 3. Process is sized to the work

Running agents in parallel, with reviews and isolation, has a fixed cost
per workstream that barely shrinks for small jobs. So the plan must choose
the smallest tier the work justifies:

- **solo**: one agent plus your project's quality gates. For small,
  low-risk changes.
- **reviewed**: one agent plus one independent review round. For most
  feature work.
- **parallel**: shared contracts first, several isolated workers, one
  review of the combined result. Only for genuinely independent workstreams
  that are each substantial on their own.

**Why this matters:** the field trial measured an eleven-workstream
decomposition of a 308-line file spending roughly ten times more on process
than on the work. Ceremony is a cost; pay it only where it buys something.

### 4. Every permission is collected up front

The plan lists every action that touches the world outside your machine:
pushing branches, opening pull requests, publishing packages, deploying,
changing secrets. You are asked for all of them in one conversation, and
the plan records what you granted and what you withheld.

**Why:** a withheld permission is a constraint the plan can route around. A
permission nobody thought to ask for is a wall the run hits at 2 a.m. The
receipt behind this rule is a 26-hour run that stalled mid-flight on a
package publish nobody had discussed, with eight workstreams queued behind
it.

### 5. Approval that means something

The plan is presented to you once, complete, with any review verdicts
alongside. It must never arrive pre-approved: no filled-in "Approved by"
line, no approval date on a document you have not seen. After you approve,
the plan is frozen; changing a requirement means coming back to you, not
quietly editing the document.

**Why:** the receipt is a draft plan copied from an earlier one that still
carried the previous approval line, presenting a developer with a document
claiming they had already signed it. Approval theater is worse than no
approval.

## What you get at the end

One committed plan document: numbered requirements with acceptance
evidence, non-goals, locked decisions, the chosen process tier, the record
of granted and withheld permissions, and links to the ground-truth
references. When you approve it, the run starts, and your part is done
until the result comes back.

## The stories behind the rules

- A 26-hour autonomous run stalled on an unasked publishing question.
  Rule 4 exists so it cannot happen again.
- Invented wire field names kept every test green while guaranteeing every
  real call would fail. Rule 2's "read the producing code" clause is the
  fix.
- A deliberate misspelling and two trailing spaces, load-bearing in a
  ported status map, were silently destroyed by a generic text cleanup.
  Only a committed oddities list with byte-exact tests catches that class.
- Acceptance evidence once cited a record that did not exist, so the test
  compared two lists written by the same author and proved nothing.
  Evidence must be checkable by someone other than its author.
- An over-decomposed port spent ten times more on process than on work.
  Rule 3 is the guardrail.
