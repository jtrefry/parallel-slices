import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseManifestText } from "../repo-overlay/scripts/parallel-slices/scope-policy.mjs";
import { readSliceCompilationSnapshot } from "../repo-overlay/scripts/parallel-slices/slice-compilation.mjs";
import {
  parallelSlicesRoot,
  run,
  write,
  writeInitializedContract,
  writeScaffold,
} from "./helpers/fixture.mjs";

function commit(root, subject) {
  run("git", ["add", "."], root);
  run(
    "git",
    [
      "-c",
      "user.name=Planning Test",
      "-c",
      "user.email=planning@example.test",
      "commit",
      "-m",
      subject,
    ],
    root,
  );
}

test("planning dry run closes a shared result contract before execution", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-plan-coverage-"));
  try {
    run("git", ["init", "-b", "feature/reference-only-result"], root);
    writeScaffold(root, { qualityScripts: true });
    run(
      "bash",
      [
        join(parallelSlicesRoot, "scripts/install.sh"),
        "--default-controller",
        "codex",
        root,
      ],
      parallelSlicesRoot,
      { quiet: true },
    );
    writeInitializedContract(root);
    run(
      "node",
      [
        "scripts/parallel-slices/project-state.mjs",
        "advance",
        "contract-ready",
      ],
      root,
    );
    run(
      "node",
      [
        "scripts/parallel-slices/project-state.mjs",
        "advance",
        "foundation-ready",
      ],
      root,
    );

    write(
      root,
      "packages/shared/src/schemas/apply-result.schema.ts",
      `export const applyResultShape = {
  entityId: "required-string",
  scheduleId: "required-string",
};
`,
    );
    write(
      root,
      "packages/shared/src/schemas/apply-result.schema.test.ts",
      `import { applyResultShape } from "./apply-result.schema";

if (applyResultShape.entityId !== "required-string") process.exit(1);
`,
    );
    write(
      root,
      "apps/api/src/apply-selection.ts",
      `export function applySelection(referenceOnly) {
  if (referenceOnly) return { entityId: null, scheduleId: null };
  return { entityId: "entity-1", scheduleId: "schedule-1" };
}
`,
    );
    write(
      root,
      "apps/api/src/apply-selection.test.ts",
      `import { applySelection } from "./apply-selection";

if (applySelection(true).entityId !== null) process.exit(1);
`,
    );
    write(
      root,
      "apps/web/src/apply-client.ts",
      `export function renderApplyResult(result) {
  return result.entityId ? "created" : "reference-only";
}
`,
    );
    const reviewConfig = JSON.parse(
      readFileSync(join(root, ".parallel-slices/review.json"), "utf8"),
    );
    reviewConfig.enabled = true;
    reviewConfig.reviewers = [
      { id: "independent-planning-review", provider: "codex" },
    ];
    write(
      root,
      ".parallel-slices/review.json",
      `${JSON.stringify(reviewConfig, null, 2)}\n`,
    );
    commit(root, "chore: establish synthetic application baseline");

    const plan = "docs/plans/2026-07-20-reference-only-result.md";
    write(
      root,
      plan,
      `# Reference-only result Product Plan

Status: APPROVED
Owner: Example maintainer
Milestone: Apply a reference-only selection without creating entities
Goal branch: \`feature/reference-only-result\`

## Goal and user-visible outcome

A caller can apply a reference-only selection and receive a successful result
without an entity or schedule being created.

## Requirements

| ID | Formal requirement | Source | Acceptance evidence |
| --- | --- | --- | --- |
| R1 | A reference-only selection creates no entity or schedule. | Developer requirement | The service test observes both identifiers as absent. |
| R2 | The shared result contract represents the successful no-entity outcome. | Existing contract incompatibility | The schema test accepts absent identifiers. |

## Existing behavior to preserve

- P1: Selections that create entities continue returning both identifiers.

## Non-goals

- No persistence, deployment, migration, or unrelated refactor.

## Locked decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| No-entity result | Both identifiers are absent | No entity or schedule exists to identify. |

## Acceptance traceability

| Requirement | Verified by |
| --- | --- |
| R1 | Service test for the reference-only selection. |
| R2 | Shared result-schema test for absent identifiers. |

## Contract and change-impact inventory

| Requirement | Entry point | Contract | Consumers | Data or side effects | Test surface | Operations |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Apply-selection service | Shared apply result | Existing web result renderer | No durable write | Service test | None |
| R2 | Apply-selection service | Shared apply result must allow absent IDs | Existing web result renderer remains compatible | None | Schema test | None |

## Product acceptance scenarios

1. Given a reference-only selection, when it is applied, then the successful
   result contains no entity or schedule identifier.
2. Given a creating selection, when it is applied, then both existing
   identifiers remain present.

## Definition of done

- R1 and R2 have automated acceptance evidence.
- Creating selections remain compatible.

## Approval record

- Approved scope: R1 and R2
- Approved by: Example maintainer
- Approval date: 2026-07-20
- Approved repository publication mode: local-only
`,
    );
    run("git", ["add", plan], root);
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
        root,
      ),
      /Product Plan approval commit boundary passed/,
    );
    commit(root, "docs(plan): approve reference-only result");
    const planCommit = run("git", ["rev-parse", "HEAD"], root).trim();

    const scope = "docs/plans/scopes/reference-only-result/1.1.scope";
    const planningScope =
      "docs/plans/scopes/reference-only-result/_planning.scope";
    const state = "docs/plans/loop-runs/reference-only-result-state.json";
    write(
      root,
      scope,
      `version=2
plan=${plan}
state=${state}
slice=1.1
requirements=R1,R2
depends_on=none
observable=A reference-only selection succeeds without creating an entity or schedule.
minimum_stage=foundation-ready
release_notes=none
gate=core
parallel=allowed
lock=shared-api-contract
review=docs/plans/reviews/reference-only-result/1.1.json
commit=fix(contract): represent reference-only apply results
coverage=entrypoint|change|apps/api/src/apply-selection.ts|The service must return the approved no-entity result.
coverage=contract|change|packages/shared/src/schemas/apply-result.schema.ts|The current shared schema requires identifiers that do not exist for the approved outcome.
coverage=consumer|preserve|apps/web/src/apply-client.ts|The existing renderer already handles an absent entity identifier.
coverage=data-side-effect|not-applicable|none|The approved reference-only path performs no durable write or external action.
coverage=test|change|apps/api/src/apply-selection.test.ts|The service test proves that neither identifier is created.
coverage=test|change|packages/shared/src/schemas/apply-result.schema.test.ts|The schema test proves the shared contract represents absent identifiers.
coverage=operations|not-applicable|none|The local contract change has no deployment or operational action.
allow=apps/api/src/apply-selection.ts
allow=apps/api/src/apply-selection.test.ts
allow=packages/shared/src/schemas/apply-result.schema.ts
allow=packages/shared/src/schemas/apply-result.schema.test.ts
coordinate=${state}
coordinate=docs/plans/reviews/reference-only-result/1.1.json
coordinate=docs/plans/reviews/reference-only-result/1.1.md
`,
    );
    const compilation = {
      ...readSliceCompilationSnapshot(root),
      sizingRationale: [
        "Kept the service, shared result schema, and their tests together because the negative outcome cannot compile or be verified coherently if its producer and contract are split.",
      ],
      parallelism: {
        dependencyRationale: [],
        serialOnlyJustification: null,
      },
      planningReview: {
        scope: planningScope,
        artifact: "docs/plans/reviews/reference-only-result/planning.json",
      },
    };
    write(
      root,
      state,
      `${JSON.stringify(
        {
          $schema: "../../../.parallel-slices/loop-state.schema.json",
          version: 5,
          plan,
          planCommit,
          compilation,
          milestone:
            "Apply a reference-only selection without creating entities",
          goalBranch: "feature/reference-only-result",
          controller: "codex",
          runId: "00000000-0000-4000-8000-000000000020",
          status: "not_started",
          slices: {
            1.1: {
              manifest: scope,
              status: "not_started",
              candidateCommit: null,
              gateEvidence: [],
              reviewEvidence: [],
              reviewArtifact:
                "docs/plans/reviews/reference-only-result/1.1.json",
            },
          },
          findings: [],
          finalAudit: null,
        },
        null,
        2,
      )}\n`,
    );
    write(
      root,
      planningScope,
      `version=1
plan=${plan}
state=${state}
slice=planning
requirements=R1,R2
observable=Independent reviewers approve the complete execution map before any worker starts.
minimum_stage=foundation-ready
release_notes=none
gate=core
review=docs/plans/reviews/reference-only-result/planning.json
allow=.parallel-slices/review.json
allow=${plan}
allow=${state}
allow=docs/plans/scopes/reference-only-result/**
allow=docs/plans/reviews/reference-only-result/planning.json
allow=docs/plans/reviews/reference-only-result/planning.md
allow=docs/plans/corrections/reference-only-result/**
`,
    );
    run("git", ["add", scope, planningScope, state], root);

    const enabledReview = readFileSync(
      join(root, ".parallel-slices/review.json"),
      "utf8",
    );
    const disabledReview = JSON.parse(enabledReview);
    disabledReview.enabled = false;
    disabledReview.reviewers = [];
    write(
      root,
      ".parallel-slices/review.json",
      `${JSON.stringify(disabledReview, null, 2)}\n`,
    );
    run("git", ["add", ".parallel-slices/review.json"], root);
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
          root,
        ),
      /disabled multi-agent review requires the compiled run state to omit planningReview/,
    );
    write(root, ".parallel-slices/review.json", enabledReview);
    run("git", ["add", ".parallel-slices/review.json"], root);

    const preCommitOutput = run(
      "node",
      ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
      root,
    );
    assert.match(
      preCommitOutput,
      /AI-compiled execution commit boundary passed/,
    );
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/slice-graph.mjs", "validate", "--plan", plan],
        root,
      ),
      /slice graph valid: 1 slices/,
    );
    assert.equal(
      run(
        "node",
        ["scripts/parallel-slices/slice-graph.mjs", "sets", "--plan", plan],
        root,
      ).trim(),
      '[["1.1"]]',
    );

    const manifest = parseManifestText(readFileSync(join(root, scope), "utf8"));
    const changedCoverage = manifest.coverage.filter((entry) =>
      entry.includes("|change|"),
    );
    for (const requiredPath of [
      "packages/shared/src/schemas/apply-result.schema.ts",
      "packages/shared/src/schemas/apply-result.schema.test.ts",
    ]) {
      assert.ok(manifest.allow.includes(requiredPath));
      assert.ok(
        changedCoverage.some((entry) => entry.includes(`|${requiredPath}|`)),
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
