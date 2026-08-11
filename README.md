# Parallel Slices

[![Quality](https://github.com/jtrefry/parallel-slices/actions/workflows/quality.yml/badge.svg)](https://github.com/jtrefry/parallel-slices/actions/workflows/quality.yml)

**Plan the product. Build it in parallel slices.**

Parallel Slices is four portable agent skills. Three take a product milestone
from an approved plan to a finished, independently reviewed result, with the
developer involved exactly twice: approving the plan and receiving the
outcome. The fourth keeps the delivery pipeline's supply chain gated using
the scanning tools' own mechanisms. They install into any repository for
Claude Code, Cursor, and Codex.

[Website](https://parallelslices.com) ·
[GitHub](https://github.com/jtrefry/parallel-slices)

> **Status:** version 2 is a ground-up replacement of the version 1 control
> plane. What used to be a 13,000-line orchestration state machine is now
> a small set of skills, two small scripts, and an installer. The reasons are in
> [Why version 2](#why-version-2) and the [changelog](CHANGELOG.md); the v1
> implementation remains in git history before 2.0.0.

![Parallel Slices shown as independent cake slices baked concurrently, checked and assembled serially, retried individually when needed, and audited as one finished cake](docs/assets/parallel-slices-cake-generated.png)

## The skills

| Skill                                                        | What it does                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`plan-milestone`](skills/plan-milestone/SKILL.md)           | Plan work so it runs to completion autonomously: requirements with observable evidence, committed ground truth, process sizing, and every authorization collected before work begins.                                  |
| [`build-parallel`](skills/build-parallel/SKILL.md)           | Execute the plan with parallel workers in isolated git worktrees: shared contracts first, one fresh agent per workstream, serial atomic integration.                                                                   |
| [`review-and-decide`](skills/review-and-decide/SKILL.md)     | One round of independent review by fresh agents, then the orchestrator decides every finding on the record. Reviews inform; they never veto.                                                                           |
| [`secure-supply-chain`](skills/secure-supply-chain/SKILL.md) | Gate dependency and image vulnerabilities with each tool's native mechanisms: production-only runtime images, report-then-gate scans at pull request, deploy, and on a schedule, one scoped suppression list per tool. |

Each skill bundles its own templates and scripts (worker packets, review
prompts, a ground-truth template, a scope checker, a worktree helper, an
image-scan job, a suppression policy) in a `files/` directory beside it.

New to CI, CD, or software quality? Plain-language guides to every skill,
written for readers who build with an agent and are learning the
fundamentals, start at [`docs/skills/`](docs/skills/README.md). Each guide
explains the skill's features, the decisions behind them, why those
decisions were made, and the tools involved.

## Install

```bash
node scripts/install-skills.mjs /path/to/project
node scripts/install-skills.mjs /path/to/project --tools claude,cursor
```

Claude Code reads `.claude/skills/<name>/SKILL.md` natively, including
automatic invocation from the description. Cursor gets `.cursor/commands/`
entries and Codex gets `.agents/skills/` pointers plus a marker-delimited
index block in `AGENTS.md`, all pointing at that same canonical copy.
Re-running the installer refreshes everything in place.

## Choosing the reviewer model

By default, reviewers run as fresh agents inside whatever tool is driving the
work, on whatever model that tool is using. That is the weakest form of the
idea. Two reviewers on the same model share its blind spots, so the second one
largely agrees with the first, and independent review stops being independent.
For work that matters, point the reviewer at a peer-capability model from a
different provider.

Name the invocation in **your project's own `AGENTS.md`**. Every tool these
skills install into already reads that file, and the installer only ever
replaces its own marker-delimited block, so your text survives re-installs.

```markdown
## Review policy

Run reviewers with: `codex exec --model gpt-5.6 "$(cat)"`
```

The contract is deliberately small: the orchestrator runs your command once per
reviewer, passes the review prompt on standard input, and reads the verdict,
summary, and findings from standard output. Reviewers never write, so the
command needs no write access and no sandbox exception. Name no invocation and
nothing changes.

### Examples by provider

Each form below takes the prompt on standard input. `"$(cat)"` is what hands it
to a CLI that expects the prompt as an argument.

```bash
# OpenAI (Codex CLI): progress goes to stderr, final message to stdout
codex exec --model gpt-5.6 "$(cat)"

# Google (Gemini CLI)
gemini -m gemini-3.1-pro -p "$(cat)"

# Anthropic (Claude Code)
claude -p "$(cat)" --model claude-opus-5

# xAI, Groq, Ollama, or anything else: OpenCode reaches 75+ providers
opencode run --model openai/gpt-5.6 "$(cat)"

# Aider, routing through OpenRouter
aider --model openrouter/openai/gpt-5.6 --message "$(cat)"
```

To keep Claude Code as the harness while swapping the model underneath it,
point it at a gateway. The environment variables scope to that one child
process, so the orchestrator itself stays where it is:

```bash
env ANTHROPIC_BASE_URL=https://openrouter.ai/api \
    ANTHROPIC_AUTH_TOKEN="$OPENROUTER_KEY" \
    claude -p "$(cat)" --model openai/gpt-5.6
```

This works well here specifically because reviewers are read-only: their whole
tool surface is reading, globbing, and grepping, and tool translation is where
these gateways are least reliable.

### Cursor, and running more than one model

Cursor has three separate paths, and they are worth keeping straight.

**The orchestrator's own model** is whatever you select in Cursor. Adding your
own provider keys under **Settings → Models** (OpenAI, Anthropic, Google, xAI)
lets you drive the work with one vendor's frontier model.

**The reviewers** do not have to run in Cursor at all, and this is the reliable
path to more than one model. Cursor's agent can run terminal commands, so it
honors exactly the same `AGENTS.md` invocation as every other tool. To get two
reviewers on two different providers, name both:

```markdown
## Review policy

Run the first reviewer with: `codex exec --model gpt-5.6 "$(cat)"`
Run the second reviewer with: `gemini -m gemini-3.1-pro -p "$(cat)"`
```

Neither reviewer shares a provider with the other or with Cursor, which is the
whole point.

**Cursor's own CLI** can also serve as a reviewer:

```bash
agent -p "$(cat)"
```

One caveat: at the time of writing, the Cursor CLI selects models with a
`/model` slash command inside a session, and a flag for pinning the model in
headless runs is an open feature request. If you need the reviewer's model
pinned and audited, use one of the provider CLIs above instead. Check
`agent --help` on your installed version before relying on any flag here.

Two further notes on Cursor: it receives a thin `.cursor/commands/` adapter
rather than native skill invocation, so you invoke the skill deliberately; and
if agent terminal access is disabled, no configuration reaches the reviewers
and you get the single-tool default.

### Verify before you rely on it

CLI flags move. Confirm the invocation runs and returns findings on standard
output before trusting it in a real review:

```bash
echo "Reply with the word READY and nothing else." | <your reviewer command>
```

## The flow

```mermaid
flowchart TD
  A["Product direction"] --> B["plan-milestone<br/>requirements, ground truth, sizing, authorizations"]
  B --> C{"Developer approves the plan<br/>(last required involvement)"}
  C --> D["Contract commit<br/>shared interfaces, hard-reviewed first"]
  D --> E["Worker A<br/>isolated worktree"]
  D --> F["Worker B<br/>isolated worktree"]
  D --> G["Worker C<br/>isolated worktree"]
  E --> H["Serial atomic integration<br/>scope check, full gate with caching bypassed"]
  F --> H
  G --> H
  H --> I["review-and-decide<br/>one independent round"]
  I --> J["Orchestrator decides every finding<br/>on the record"]
  J -- corrections, re-gated --> H
  J --> K["Milestone complete<br/>decisions committed, deployment handed to the developer"]
```

## Why version 2

Version 1 enforced this method with a large control plane: manifests, run
state, commit-kind gates, phase machines, and multi-round multi-agent review.
A full field trial ported a real application with it, end to end, and the
results split cleanly.

The method worked. Independent review caught defects no quality gate could
have: wire field names invented instead of read from the producing source
(every test stayed green because the fixtures agreed with the mistake), a
transform silently destroying byte-exact parity values, a container that
validated its configuration but never ran the validator, a 71-second
regular-expression hang. Isolated worktrees ran three workers concurrently
without a collision. Ground-truth documents and workers that verify premises
caught wrong assumptions before they became code.

The machinery failed. Eighteen control-plane defects blocked the run, each a
feature not threaded through its readers. The choreography amplified small
orchestrator mistakes into lost review rounds and stranded work, and its
fixed cost per slice exceeded the work itself on anything small. Review
rounds found new material in each other's corrections and never converged.

Version 2 keeps everything that produced quality and deletes everything that
produced downtime. Every rule in the skills traces to a measured failure; the
receipts are printed at the bottom of each skill.

## Develop Parallel Slices

```bash
npm ci
npm run check   # syntax, lint, format, tests
```

The canonical skills live in [`skills/`](skills/), the installer in
[`scripts/install-skills.mjs`](scripts/install-skills.mjs), and the tests in
[`tests/`](tests/). Contributions should preserve the shape: skills carry
judgment and procedure, scripts stay small and single-purpose, and anything
that starts to look like a state machine belongs in the tools themselves, not
here.
