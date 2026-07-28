# A plain-language guide to the Parallel Slices skills

This guide is for someone who builds with an AI coding agent and wants to
understand what these skills actually do, why they work the way they do, and
what all the surrounding machinery (CI, CD, scanners, pull requests) is for.
You do not need to be a professional developer to read it. Every term of art
is explained the first time it appears, and each guide ends with the true
stories that shaped its rules.

## What Parallel Slices is

Parallel Slices is a set of four instruction manuals, called skills, that an
AI coding agent reads and follows. Three of them take a piece of work from
"here is what I want" to "here is the finished, checked result":

1. [`plan-milestone`](./plan-milestone.md): agree on what to build, write it
   down precisely, and collect every permission the work will need, all
   before any code is written.
2. [`build-parallel`](./build-parallel.md): split big work across several
   agents working at the same time without stepping on each other, then
   combine their results carefully, one at a time.
3. [`review-and-decide`](./review-and-decide.md): have fresh agents inspect
   the finished work once, then make a recorded decision about every issue
   they raise.

The fourth stands guard over the delivery pipeline rather than a single
piece of work:

4. [`secure-supply-chain`](./secure-supply-chain.md): keep known security
   vulnerabilities out of what you ship, using the scanning tools' own
   features instead of custom scripts.

## How a skill works

A skill is a Markdown file (`SKILL.md`) containing judgment and procedure:
what to do, in what order, and what never to do. When your agent starts a
task that matches a skill's description, it reads the whole file and follows
it as the authoritative workflow. Skills bundle their own templates and
small scripts in a `files/` folder beside them, so everything a skill
mentions travels with it.

The installer (`scripts/install-skills.mjs`) copies the skills into any
project. Claude Code reads them natively from `.claude/skills/`; Cursor and
Codex get small pointer files that reference that same copy, so there is
exactly one canonical text per skill inside your project. Running the
installer again refreshes everything in place.

## Why the rules are so specific

Every rule in every skill traces to a measured failure: something that went
wrong in a real autonomous run, cost real time, and would have been
prevented by the rule. The "receipts" section at the bottom of each skill
(and the stories section at the bottom of each guide here) is that trace.
Nothing in these skills is a best practice adopted on faith.

## Words you will meet everywhere

- **Repository (repo)**: the folder containing your project and its entire
  change history.
- **Commit**: a saved snapshot of the project with a message describing the
  change. Commits are local and easily undone, which is why the skills treat
  committing as cheap and safe.
- **Branch**: a named line of work. The main branch is the official version;
  feature branches are where changes are prepared.
- **Pull request (PR)**: a proposal to merge a branch into the main branch,
  with a place for review and automated checks.
- **CI (continuous integration)**: automation that runs your checks (tests,
  linters, scanners) on every proposed change, before it merges.
- **CD (continuous delivery/deployment)**: automation that ships the merged
  code to a real environment.
- **Quality gate**: any check that must pass before work proceeds. A gate
  that can be skipped is not a gate.
- **Orchestrator and workers**: in these skills, the orchestrator is the
  agent that makes decisions and delegates; workers are fresh agents that
  each build one piece. The developer (you) approves the plan and receives
  the result.

## Suggested reading order

Read [`plan-milestone`](./plan-milestone.md) first: everything else depends
on the plan it produces. Then [`build-parallel`](./build-parallel.md) and
[`review-and-decide`](./review-and-decide.md), which are the middle and end
of the same journey. Read
[`secure-supply-chain`](./secure-supply-chain.md) whenever you are ready to
learn how shipping pipelines stay safe; it stands alone and doubles as a
gentle introduction to CI, CD, and vulnerability scanning.
