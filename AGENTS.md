# Parallel Slices contributor instructions

These instructions govern work on Parallel Slices itself. The repository is
deliberately small: four skills, an installer, two bundled scripts, and
tests. Keep it that way.

## What this repository is

Parallel Slices version 2 is a set of portable agent skills, not a framework.
The skills carry judgment and procedure; the two bundled scripts do the only
mechanical work worth automating; the installer copies everything into a
target repository for Claude Code, Cursor, and Codex. Version 1 was a
13,000-line control plane, and a full field trial showed that its machinery
cost more than it protected. Its history is the strongest guardrail this file
can offer: **do not reintroduce a state machine.** If a proposed change adds
phases, ledgers, commit-kind taxonomies, or choreography that an orchestrator
must execute in precise order, it belongs in the agent tools themselves or
nowhere.

## Repository structure

| Path                         | Responsibility                                              |
| ---------------------------- | ----------------------------------------------------------- |
| `skills/<name>/SKILL.md`     | Canonical skill content, open Agent Skills format           |
| `skills/<name>/files/`       | Templates and scripts bundled with that skill               |
| `scripts/install-skills.mjs` | The only installer; copies skills and writes tool adapters  |
| `tests/`                     | Behavior-focused coverage for the installer and the scripts |
| `docs/skills/`               | Plain-language user guides, one per skill, plus an index    |
| `docs/assets/`               | README imagery                                              |

## Rules

- Every rule inside a skill must trace to a measured failure, and each skill's
  Receipts section is where that trace lives. A rule nobody can justify with
  an incident is a candidate for deletion, not for elaboration.
- Scripts stay dependency-free, cross-platform (Node `fs`/`path`, no shell
  pipelines, no macOS-only tools), and single-purpose. A script that needs
  another script is becoming a framework.
- The installer must remain idempotent: re-running it refreshes copies and
  replaces its `AGENTS.md` marker block without duplicating it.
- `npm run check` must pass before any commit: syntax, lint, format, tests.
- Tests must not need the network or credentials; git and a temp directory
  are the only fixtures.
- Never use an em-dash in any file in this repository.

## Before changing anything

1. Read the skill or script you are changing in full, and the test that
   covers it.
2. Search for every consumer of the behavior you are touching; the installer,
   the tests, the README, and the guides in `docs/skills/` must stay aligned
   with the skills.
3. Prefer deleting over adding. Version 2 exists because deletion was the
   correct fix.
