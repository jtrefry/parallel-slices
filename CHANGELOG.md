# Changelog

All notable changes to Parallel Slices will be documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
intends to adhere to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once versioned
releases begin.

## [Unreleased]

### Added

- The `secure-supply-chain` skill: gate dependency and container-image
  vulnerabilities with each tool's native mechanisms instead of custom glue.
  Production-only runtime images, report-then-gate scanning at pull request,
  deploy, and on a schedule, one scoped suppression list per tool with native
  expiry, overrides proven to load, and platform-native failure alerts. Ships
  with an image-scan job template and a suppression policy template. Its
  receipts come from a three-day deploy outage in which every seam the rules
  close had opened.

## [2.0.0] - 2026-07-27

A ground-up replacement of the version 1 control plane, informed by a full
field trial that ported a real application end to end. The trial's verdict
split cleanly: the method produced quality, the machinery produced downtime.
Version 2 keeps the first and deletes the second.

### Added

- Three portable skills in the open Agent Skills format, under `skills/`:
  `plan-milestone`, `build-parallel`, and `review-and-decide`. Each bundles
  its templates and scripts in a `files/` directory, and each ends with the
  measured failures its rules exist to prevent.
- `scripts/install-skills.mjs`, which installs the skills into any repository
  for Claude Code (native `.claude/skills/`), Cursor (`.cursor/commands/`
  adapters), and Codex (`.agents/skills/` pointers plus a marker-delimited
  `AGENTS.md` index block). Idempotent; re-running refreshes in place.
- A scope checker and a worktree helper bundled with `build-parallel`, the
  two pieces of v1 enforcement that earned their keep.
- A new test suite covering the installer, the scope checker, and the
  worktree helper.

### Changed

- Review policy: one independent round, then the orchestrator decides every
  finding on the record. Corrections are re-gated, not re-reviewed. The field
  trial measured review rounds finding new material in each other's
  corrections without converging; the useful findings all arrived in round
  one.
- Parallel execution now requires a reviewed contract commit before any
  parallel work, because two concurrently built workstreams met at an
  interface neither could see whole.
- Process sizing is an explicit planning step with three tiers (solo,
  reviewed, parallel), because v1 charged the same fixed toll per slice
  regardless of slice size.

### Removed

- The entire v1 control plane: `repo-overlay/` (orchestration scripts, run
  state, commit-kind gates, phase machines, controller adapters, process
  documents), `architectures/`, `schemas/`, `examples/`, the generated
  documentation tree, and their tests. Eighteen distinct control-plane
  defects blocked the field trial, each a feature not threaded through its
  readers, and the choreography amplified small orchestrator mistakes into
  lost review rounds and stranded work. The v1 implementation remains in git
  history before this release.

### Fixed

- **The initialization gate assumed every operation happens exactly once.** Four
  symptoms of one bug: the control plane could not be repaired while
  initialization was in progress, a compiled execution map could be produced
  once and never corrected, and neither an unchanged manifest nor an unchanged
  planning scope could be re-staged, because git has nothing to stage for a file
  that did not change. A repository could therefore compile a defective map,
  have independent review reject it, and have no way to commit the correction.
  Recompilation now classifies, an already-committed unchanged manifest counts
  exactly as a staged one, and one `repository-contract` rule replaces the
  narrower special case: every staged path is already an adoption-contract path
  and nothing touches `docs/plans/`, which is what guarantees such a commit can
  never alter an approved plan, a manifest, run state or review evidence. The
  adoption path also now covers `.gitignore`, `.env.example` and `tools/`;
  untracked files block worker worktree creation entirely, so content that
  cannot be committed stops the whole workflow rather than merely hiding from a
  worker.
- **Multi-agent review could not run at all.** The reviewer response schema
  declared a top-level `allOf`, which both structured-output APIs reject
  outright (`input_schema does not support oneOf, allOf, or anyOf at the top
level`; `In context=(), 'allOf' is not permitted`), so no configured reviewer
  on any provider could complete a review in any generated repository. The
  schema is now flat and is sent verbatim.
- The Codex authentication probe classified `codex login status` against stdout
  only. That CLI prints its status on stderr, so every run exited
  `AUTH_STATUS_UNKNOWN` before spawning a reviewer. It now reads both streams.
- Provider failures discarded the provider's own output, leaving diagnostics
  that named neither the provider nor what it said. Problems now carry it.
- The default review turn timeout of 600 seconds was shorter than a thorough
  review of a real plan, which was killed mid-turn. Raised, with the overall
  budget raised to match.
- The initialization commit gate recognized no commit kind that could repair the
  control plane, so a defect blocking the planning sequence could not be fixed
  without bypassing the gate. Adds `control-plane-repair`, scoped to
  `scripts/parallel-slices/`, `docs/parallel-slices/` and
  `.parallel-slices/review*`, never `docs/plans/`.

### Changed

- **Generating from a checkout is the only creation path.** The public starter
  template repositories were retired, so the root architecture starter catalog,
  the bundled packages' `starter` manifest metadata, and the repository audit
  rule that required both are gone. The root `README.md` now lists every bundled
  creation configuration instead, including `nextjs-cloudflare-supabase`, which
  the catalog previously carried alone. A package may still declare optional
  `starter` URLs; nothing bundled does.
- Development dependencies advanced to `eslint` 10.8.0, `globals` 17.8.0 and
  `create-turbo` 2.10.7. The generated scaffold baseline advanced to `next` and
  `@next/eslint-plugin-next` 16.2.12, `turbo` and `eslint-plugin-turbo` 2.10.7,
  `globals` 17.8.0 and `postcss` 8.5.23; the Terraform example advanced to the
  `hashicorp/google` 7.41.0 range. Root `@types/node` is now held below 25 for
  the same reason the scaffold holds it: it tracks the supported Node.js 22 and
  24 LTS runtimes.
- **Reviewers are genuinely isolated.** The review packet carried the running
  findings list, every prior reviewer's summary, and an instruction to return
  uphold/dismiss assessments, so reviewers anchored on each other. Unanimity
  across two reviewers admits one bad artefact in sixteen rather than one in
  four only because their errors are uncorrelated; a reviewer that has read
  another's conclusions is not an independent sample. The packet now contains
  the work and nothing else. This also closes a prompt-injection path by
  construction: no reviewer's output reaches another reviewer, so there is
  nothing to sanitize.
- **Review is one independent pass per reviewer, unanimity to pass.** Reviewers
  previously negotiated across up to `maxRounds` rounds, assigning `uphold` or
  `dismiss` dispositions to each other's findings. That design treats a
  reviewer's stated reason as reliable evidence; measurement shows the opposite,
  with judges reporting the wrong reason even when their verdict is correct.
  Reviewers now report findings and the controller decides. Removes
  `assessments`, dispositions, vote records, finding status transitions and
  `maxRounds`. Applies to planning review and slice review alike, since both are
  one code path.

### Added

- **A human override for review findings.** `review-override.mjs` lets a person
  accept a specific finding on the record. Previously a reviewer could block
  indefinitely with no way forward, which made the whole workflow unusable when
  a reviewer was wrong or insisted on something contradicting a deliberate human
  decision; the only escapes were disabling review or hand-editing the ledger.
  It is not a flag on the review command and there is no approve-anyway switch:
  it names exact findings, requires a substantive written reason, is recorded
  permanently in the ledger and the final audit, does not unblock unless every
  blocking finding is accounted for, and does not survive a re-review. The cost
  of overriding is permanent visibility.
- **Independent Product Plan review, before a human is asked to approve it.**
  `review-plan.mjs --plan <plan>` runs every configured reviewer over the plan
  and the repository, independently, and requires unanimity. It catches what
  prose hides: acceptance evidence no implementation could produce, a
  requirement with no observable evidence or no possible owner, requirements
  that contradict each other or a stated non-goal, conflicts with the root
  instructions or the installed architecture, unrealisable lifecycles, and a
  definition of done containing an item nothing delivers. The plan is
  fingerprinted so an approval cannot survive an edit. Human approval was the
  most expensive gate in the workflow and the only one nothing checked first.
- `review-smoke.mjs`, which asks every configured reviewer one trivial question
  through the exact invocation path a real review uses and validates the answer
  against the schema. Every defect above was detectable this way in seconds
  rather than minutes into a real review. `--preflight-only` checks
  installation, authentication and model availability without spending a turn.
- `slice-graph.mjs diagram`, rendering a compiled execution map as a Mermaid DAG
  with slice, wave and maximum-parallel-width counts.

Parallel Slices is pre-release software at version 0.1.0. There is no published
npm package and no tagged GitHub release yet. Cloning this repository and
generating or adopting a project is the supported path, and any commit on
`main` reflects the current state. Versioned releases are planned.

Current state of the project:

- An architecture-neutral control layer (`repo-overlay/`) installed into every
  generated or adopted repository: planning contracts, scope manifests, version
  2 manifest and version 5 JSON run-state formats, quality gates, Husky hooks,
  run leases, attempt ledgers, recovery procedures, and Git safety policy.
- One bundled architecture package, `nextjs-gcp-postgres`, with a `postgres`
  profile and an `external-api-only` profile, a pinned Turborepo and Next.js
  plus Mantine baseline, and a Google Cloud delivery boundary.
- Native adapters for Cursor, Codex, and Claude Code, installed together with
  one recorded default controller per repository and one leased controller per
  run.
- Optional multi-agent planning and slice review through provider CLIs, with
  fingerprinted, committed evidence.
- Creation configurations, an existing-repository adoption path
  (`scripts/setup.sh`), verification (`scripts/verify.sh`), and a public
  starter template repository for the bundled architecture.
- Unit and isolated integration tests, workflow validation, and a repository
  audit run by the Quality GitHub workflow.
