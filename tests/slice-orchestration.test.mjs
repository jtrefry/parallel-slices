import assert from "node:assert/strict";
import { execFile as execFileCallback, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  analyzeExecutionGraph,
  computeExecutionSets,
  computeReadySlices,
  loadPlanManifests,
  manifestsConflict,
  validateParallelismEvidence,
  validateSliceGraph,
} from "../repo-overlay/scripts/parallel-slices/slice-graph.mjs";
import {
  acquireRunLock,
  releaseRunLock,
} from "../repo-overlay/scripts/parallel-slices/run-lock.mjs";
import { readRunState } from "../repo-overlay/scripts/parallel-slices/run-state.mjs";
import {
  readPlanningReviewTarget,
  validatePlanningReviewEvidence,
} from "../repo-overlay/scripts/parallel-slices/planning-review.mjs";
import { writeReviewLedger } from "../repo-overlay/scripts/parallel-slices/review-artifact.mjs";
import { readSliceCompilationSnapshot } from "../repo-overlay/scripts/parallel-slices/slice-compilation.mjs";
import {
  beginPipelineTracking,
  claimIntegrationAttempt,
  listRunAttempts,
  readSliceAttemptTracking,
  readWorkerMetadata,
  updateIntegrationTracking,
  updateWorkerTracking,
} from "../repo-overlay/scripts/parallel-slices/run-tracking.mjs";
import {
  renderRunStatus,
  summarizeRunStatus,
} from "../repo-overlay/scripts/parallel-slices/run-status.mjs";
import {
  acceptSliceCandidate,
  applySliceCandidate,
  createSliceWorktree,
  removeAcceptedWorktree,
  resumeSliceWorktree,
  restoreSliceReviewEvidence,
  retrySliceWorker,
  verifySliceCandidate,
} from "../repo-overlay/scripts/parallel-slices/slice-worktree.mjs";
import { patternsMayOverlap } from "../repo-overlay/scripts/parallel-slices/scope-policy.mjs";
import { assertImmutablePlanContractHistory } from "../repo-overlay/scripts/parallel-slices/branch-policy.mjs";
import {
  parallelSlicesRoot,
  run,
  write,
  writeInitializedContract,
  writeScaffold,
} from "./helpers/fixture.mjs";

const execFile = promisify(execFileCallback);

function graphManifest(slice, dependsOn, allow, options = {}) {
  return {
    slice,
    depends_on: dependsOn,
    allow: [allow],
    lock: options.lock ? [options.lock] : [],
    parallel: options.parallel ?? "allowed",
  };
}

test("derives deterministic parallel sets and refuses unsafe graph shapes", () => {
  const manifests = [
    graphManifest("1.1", "none", "apps/account.ts"),
    graphManifest("1.2", "none", "apps/notifications.ts"),
    graphManifest("1.3", "1.1", "tests/account.test.ts"),
    graphManifest("1.4", "1.2", "tests/notifications.test.ts"),
    graphManifest("1.5", "1.3,1.4", "tests/integrated.test.ts", {
      parallel: "forbidden",
    }),
  ];
  assert.deepEqual(computeExecutionSets(manifests), [
    ["1.1", "1.2"],
    ["1.3", "1.4"],
    ["1.5"],
  ]);
  assert.equal(patternsMayOverlap("apps/a.ts", "apps/ab.ts"), false);
  assert.equal(patternsMayOverlap("apps/a/**", "apps/a/page.tsx"), true);
  assert.equal(
    manifestsConflict(
      graphManifest("2.1", "none", "apps/a.ts", {
        lock: "shared-api",
      }),
      graphManifest("2.2", "none", "apps/b.ts", {
        lock: "shared-api",
      }),
    ),
    true,
  );
  assert.throws(
    () =>
      validateSliceGraph([
        graphManifest("3.1", "3.2", "apps/a.ts"),
        graphManifest("3.2", "3.1", "apps/b.ts"),
      ]),
    /dependency cycle/,
  );
  assert.throws(
    () => validateSliceGraph([graphManifest("4.1", "missing", "apps/a.ts")]),
    /unknown dependency/,
  );
});

test("rejects an unjustified eight-slice serial application graph", () => {
  const manifests = Array.from({ length: 8 }, (_, index) => {
    const number = index + 1;
    return graphManifest(
      `1.${number}`,
      index === 0 ? "none" : `1.${number - 1}`,
      `apps/outcome-${number}.ts`,
    );
  });
  const dependencyRationale = manifests.slice(1).map((manifest, index) => ({
    slice: manifest.slice,
    dependsOn: `1.${index + 1}`,
    reason: `${manifest.slice} consumes a concrete accepted output from slice 1.${index + 1}.`,
  }));
  const state = {
    version: 5,
    compilation: {
      parallelism: {
        dependencyRationale,
        serialOnlyJustification: null,
      },
    },
  };

  assert.deepEqual(analyzeExecutionGraph(manifests), {
    sliceCount: 8,
    dependencyCount: 7,
    executionSetCount: 8,
    maxParallelWidth: 1,
    fullySerial: true,
    initialReadySlices: ["1.1"],
    dependencyEdges: dependencyRationale.map(({ slice, dependsOn }) => ({
      slice,
      dependsOn,
    })),
    executionSets: manifests.map((manifest) => [manifest.slice]),
  });
  assert.throws(
    () => validateParallelismEvidence(manifests, state),
    /rerun the serial-chain challenge and create safe parallel slices/,
  );

  state.compilation.parallelism.serialOnlyJustification =
    "Repository evidence proves that every slice consumes an accepted irreversible migration result from its immediate predecessor, and no committed contract, fixture, or test double can represent that state safely.";
  assert.doesNotThrow(() => validateParallelismEvidence(manifests, state));

  state.compilation.parallelism.dependencyRationale =
    dependencyRationale.slice(1);
  assert.throws(
    () => validateParallelismEvidence(manifests, state),
    /missing: 1\.2 -> 1\.1/,
  );
});

test("rejects stale serial-only evidence when the graph has parallel slices", () => {
  const manifests = [
    graphManifest("1.1", "none", "apps/account.ts"),
    graphManifest("1.2", "none", "apps/notifications.ts"),
    graphManifest("1.3", "1.1,1.2", "tests/integrated.test.ts"),
  ];
  const state = {
    version: 5,
    compilation: {
      parallelism: {
        dependencyRationale: [
          {
            slice: "1.3",
            dependsOn: "1.1",
            reason:
              "The integrated acceptance slice consumes the accepted account outcome.",
          },
          {
            slice: "1.3",
            dependsOn: "1.2",
            reason:
              "The integrated acceptance slice consumes the accepted notification outcome.",
          },
        ],
        serialOnlyJustification:
          "This stale explanation incorrectly claims the graph is serial even though two independent product outcomes are ready together.",
      },
    },
  };

  assert.equal(analyzeExecutionGraph(manifests).maxParallelWidth, 2);
  assert.throws(
    () => validateParallelismEvidence(manifests, state),
    /must be null because the execution graph contains parallel slices/,
  );
  state.compilation.parallelism.serialOnlyJustification = null;
  assert.doesNotThrow(() => validateParallelismEvidence(manifests, state));
});

test("Product Plan approval and compiled manifest commits remain immutable", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-contract-history-"));
  try {
    run("git", ["init", "-b", "feature/contract-history"], root);
    write(root, "README.md", "# Baseline\n");
    commit(root, "chore: establish baseline");
    const base = run("git", ["rev-parse", "HEAD"], root).trim();
    const plan = "docs/plans/2026-07-17-history.md";
    const scope = "docs/plans/scopes/history/1.1.scope";
    write(root, plan, "# Product Plan\n\nStatus: APPROVED\n");
    commit(root, "docs(plan): approve product plan");
    write(root, scope, "version=2\n");
    commit(root, "chore(plan): compile execution map");
    const manifests = [{ version: "2", plan, path: scope }];
    assert.doesNotThrow(() =>
      assertImmutablePlanContractHistory(root, base, manifests),
    );
    write(root, plan, "# Revised after approval\n");
    commit(root, "docs(plan): revise approved contract");
    assert.throws(
      () => assertImmutablePlanContractHistory(root, base, manifests),
      /added once and remain unchanged/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeManifest(root, options) {
  const path = `docs/plans/scopes/parallel/${options.slice}.scope`;
  const locks = (options.locks ?? []).map((lock) => `lock=${lock}\n`).join("");
  const changedSurface = options.coverageSurface ?? "entrypoint";
  const coverageSurfaces = [
    "entrypoint",
    "contract",
    "consumer",
    "data-side-effect",
    "test",
    "operations",
  ];
  const coverage = coverageSurfaces
    .map((surface) =>
      surface === changedSurface
        ? `coverage=${surface}|change|${options.allow}|The fixture path owns this slice outcome.\n`
        : `coverage=${surface}|not-applicable|none|This synthetic fixture does not exercise the ${surface} surface.\n`,
    )
    .join("");
  write(
    root,
    path,
    `version=2
plan=docs/plans/2026-07-17-parallel.md
state=docs/plans/loop-runs/parallel-state.json
slice=${options.slice}
requirements=${options.requirement}
depends_on=${options.dependsOn}
observable=${options.observable}
minimum_stage=foundation-ready
release_notes=none
gate=core
parallel=allowed
${locks}review=docs/plans/reviews/parallel/${options.slice}.json
commit=${options.commit}
${coverage}allow=${options.allow}
coordinate=docs/plans/loop-runs/parallel-state.json
coordinate=docs/plans/reviews/parallel/${options.slice}.json
coordinate=docs/plans/reviews/parallel/${options.slice}.md
`,
  );
  return path;
}

function commit(root, subject) {
  run("git", ["add", "."], root);
  run(
    "git",
    [
      "-c",
      "user.name=Slice Test",
      "-c",
      "user.email=slice@example.test",
      "commit",
      "-m",
      subject,
    ],
    root,
  );
}

function enableFixtureReview(root) {
  const path = join(root, ".parallel-slices/review.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  config.enabled = true;
  config.reviewers = [{ id: "independent-planning-review", provider: "codex" }];
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

function writePlanningScope(root, requirements) {
  const path = "docs/plans/scopes/parallel/_planning.scope";
  write(
    root,
    path,
    `version=1
plan=docs/plans/2026-07-17-parallel.md
state=docs/plans/loop-runs/parallel-state.json
slice=planning
requirements=${requirements}
observable=Independent reviewers approve the complete execution map before any worker starts.
minimum_stage=foundation-ready
release_notes=none
gate=core
review=docs/plans/reviews/parallel/planning.json
allow=.parallel-slices/review.json
allow=docs/plans/2026-07-17-parallel.md
allow=docs/plans/loop-runs/parallel-state.json
allow=docs/plans/scopes/parallel/**
allow=docs/plans/reviews/parallel/planning.json
allow=docs/plans/reviews/parallel/planning.md
allow=docs/plans/corrections/parallel/**
`,
  );
  return path;
}

function writeApprovedPlanningReview(root, statePath) {
  const target = readPlanningReviewTarget(root, statePath);
  const reviewer = {
    id: "independent-planning-review",
    provider: "codex",
  };
  const configuration = {
    billingPolicy: "subscription-only",
    turnTimeoutSeconds: 600,
    overallTimeoutSeconds: 3600,
    authWaitSeconds: 900,
    reviewers: [reviewer],
  };
  const now = "2026-07-20T12:00:00.000Z";
  const ledger = {
    version: 1,
    scopeFile: target.scopeFile,
    slice: "planning",
    requirements: target.manifest.requirements.split(","),
    configuration,
    attempts: [
      {
        number: 1,
        fingerprint: `sha256:${"a".repeat(64)}`,
        contractFingerprint: target.contractFingerprint,
        reviewKind: "planning",
        changedPaths: target.reviewPaths,
        status: "approved",
        startedAt: now,
        completedAt: now,
        outcome: "All configured reviewers approved the execution map.",
        rounds: [
          {
            number: 1,
            turns: [
              {
                reviewerId: reviewer.id,
                provider: reviewer.provider,
                providerVersion: "fixture-version",
                verdict: "approve",
                summary: "The compiled map closes the approved requirements.",
                findingIds: [],
                durationMs: 1,
              },
            ],
          },
        ],
        findings: [],
        nextFindingNumber: 1,
        activeReviewer: null,
        configuration,
        providers: {
          codex: {
            version: "fixture-version",
            authKind: "subscription",
            billingMode: "subscription",
          },
        },
      },
    ],
  };
  writeReviewLedger(
    root,
    { json: target.artifact, markdown: target.artifactMarkdown },
    ledger,
  );
  return target;
}

function updateState(root, mutate) {
  const path = join(root, "docs/plans/loop-runs/parallel-state.json");
  const state = JSON.parse(readFileSync(path, "utf8"));
  mutate(state);
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

function checkpointWorker(worker, phase, candidate = null) {
  const args = [
    "scripts/parallel-slices/run-tracking.mjs",
    "checkpoint",
    "--worker-id",
    worker.workerId,
    "--role",
    "worker",
    "--phase",
    phase,
  ];
  if (candidate) args.push("--candidate-commit", candidate);
  run("node", args, worker.worktree);
}

function passWorkerPreflight(worker, scopeFile) {
  run(
    "node",
    [
      "scripts/parallel-slices/gate.mjs",
      "--scope-file",
      scopeFile,
      "--scope-check-only",
      "--worker-id",
      worker.workerId,
    ],
    worker.worktree,
  );
  checkpointWorker(worker, "implementing");
}

function checkpointCandidate(worker) {
  checkpointWorker(worker, "candidate_ready", "HEAD");
}

function integrateCandidate(root, worker, slice, options = {}) {
  const applied = applySliceCandidate(root, worker.workerId);
  updateState(root, (state) => {
    state.status = "in_progress";
    state.slices[slice].status = "in_progress";
    state.slices[slice].candidateCommit = applied.candidateCommit;
  });
  restoreSliceReviewEvidence(root, worker.workerId);
  assert.throws(
    () => acceptSliceCandidate(root, worker.workerId),
    /passed integrated gate/,
  );
  run(
    "node",
    [
      "scripts/parallel-slices/gate.mjs",
      "--scope-file",
      worker.scopeFile,
      "--integrated",
      "--worker-id",
      worker.workerId,
    ],
    root,
  );
  if (options.assertConfiguredReview) {
    const reviewConfigPath = join(root, ".parallel-slices/review.json");
    const originalReviewConfig = readFileSync(reviewConfigPath, "utf8");
    const configuredReview = JSON.parse(originalReviewConfig);
    configuredReview.enabled = true;
    configuredReview.reviewers = [
      { id: "fixture-reviewer", provider: "codex" },
    ];
    writeFileSync(
      reviewConfigPath,
      `${JSON.stringify(configuredReview, null, 2)}\n`,
    );
    assert.throws(
      () => acceptSliceCandidate(root, worker.workerId),
      /approved tracked multi-agent review/,
    );
    writeFileSync(reviewConfigPath, originalReviewConfig);
  } else {
    assert.throws(
      () => acceptSliceCandidate(root, worker.workerId),
      /approved tracked multi-agent review|accepted commit is not based|run state has not accepted/,
    );
  }
  const reviewArtifact = `docs/plans/reviews/parallel/${slice}.json`;
  write(
    root,
    reviewArtifact,
    `${JSON.stringify(
      { version: 1, attempts: [{ status: "APPROVED" }] },
      null,
      2,
    )}\n`,
  );
  write(
    root,
    reviewArtifact.replace(/\.json$/, ".md"),
    `# Slice ${slice} review\n\nAPPROVED\n`,
  );
  updateIntegrationTracking(root, worker.workerId, "review_running");
  updateIntegrationTracking(root, worker.workerId, "review_approved", {
    review: { status: "APPROVED", artifact: reviewArtifact },
    blocker: null,
  });
  updateState(root, (state) => {
    state.slices[slice].status = "accepted";
    state.slices[slice].gateEvidence = ["worker and integrated gates passed"];
    state.slices[slice].reviewEvidence = [
      options.independentReview
        ? "A fresh independent reviewer approved the integrated diff."
        : `Approved tracked multi-agent review: ${reviewArtifact}`,
    ];
  });
  const manifest = loadPlanManifests(
    root,
    "docs/plans/2026-07-17-parallel.md",
  ).find((candidate) => candidate.slice === slice);
  commit(root, manifest.commit);
  const accepted = acceptSliceCandidate(root, worker.workerId);
  assert.equal(accepted.candidateCommit, applied.candidateCommit);
  removeAcceptedWorktree(root, worker.workerId);
  return accepted;
}

test("runs Ready Slices concurrently, integrates serially, and unlocks a dependent", async () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-ready-set-"));
  try {
    run("git", ["init", "-b", "feature/parallel-slices"], root);
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
    enableFixtureReview(root);
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
      "docs/plans/2026-07-17-parallel.md",
      "# Parallel plan\n\nStatus: APPROVED\n\nR1, R2, and R3 are approved.\n",
    );
    commit(root, "docs(plan): approve parallel Product Plan");
    const planCommit = run("git", ["rev-parse", "HEAD"], root).trim();
    const compilation = {
      ...readSliceCompilationSnapshot(root),
      sizingRationale: [
        "Kept the account and notification outcomes separate because their paths and locks are disjoint and they can run concurrently.",
        "Allowed the account follow-up to start as soon as its one dependency is accepted, without waiting for the independent notification outcome.",
      ],
      parallelism: {
        dependencyRationale: [
          {
            slice: "1.3",
            dependsOn: "1.1",
            reason:
              "The account follow-up verifies the accepted account output created by slice 1.1.",
          },
        ],
        serialOnlyJustification: null,
      },
      planningReview: {
        scope: "docs/plans/scopes/parallel/_planning.scope",
        artifact: "docs/plans/reviews/parallel/planning.json",
      },
    };
    const firstScope = writeManifest(root, {
      slice: "1.1",
      requirement: "R1",
      dependsOn: "none",
      observable: "Account output exists.",
      commit: "feat(account): add isolated account output",
      allow: "apps/account.txt",
    });
    const secondScope = writeManifest(root, {
      slice: "1.2",
      requirement: "R2",
      dependsOn: "none",
      observable: "Notification output exists.",
      commit: "feat(notifications): add isolated notification output",
      allow: "apps/notifications.txt",
    });
    const finalScope = writeManifest(root, {
      slice: "1.3",
      requirement: "R3",
      dependsOn: "1.1",
      observable: "Account follow-up output exists.",
      commit: "test(account): add follow-up verification",
      allow: "tests/integrated.txt",
      coverageSurface: "test",
    });
    writePlanningScope(root, "R1,R2,R3");
    write(
      root,
      "docs/plans/loop-runs/parallel-state.json",
      `${JSON.stringify(
        {
          $schema: "../../../.parallel-slices/loop-state.schema.json",
          version: 5,
          plan: "docs/plans/2026-07-17-parallel.md",
          planCommit,
          compilation,
          milestone: "Deliver the approved parallel outputs",
          goalBranch: "feature/parallel-slices",
          controller: "codex",
          runId: "00000000-0000-4000-8000-000000000001",
          status: "not_started",
          slices: {
            1.1: {
              manifest: firstScope,
              status: "not_started",
              candidateCommit: null,
              gateEvidence: [],
              reviewEvidence: [],
              reviewArtifact: "docs/plans/reviews/parallel/1.1.json",
            },
            1.2: {
              manifest: secondScope,
              status: "not_started",
              candidateCommit: null,
              gateEvidence: [],
              reviewEvidence: [],
              reviewArtifact: "docs/plans/reviews/parallel/1.2.json",
            },
            1.3: {
              manifest: finalScope,
              status: "not_started",
              candidateCommit: null,
              gateEvidence: [],
              reviewEvidence: [],
              reviewArtifact: "docs/plans/reviews/parallel/1.3.json",
            },
          },
          findings: [],
          finalAudit: null,
        },
        null,
        2,
      )}\n`,
    );
    updateState(root, (state) => {
      state.version = 3;
      delete state.compilation;
    });
    assert.equal(
      readRunState(root, "docs/plans/loop-runs/parallel-state.json").version,
      3,
    );
    updateState(root, (state) => {
      state.version = 5;
      state.compilation = compilation;
    });
    updateState(root, (state) => {
      state.planCommit = "0000000000000000000000000000000000000000";
    });
    assert.throws(
      () => readRunState(root, "docs/plans/loop-runs/parallel-state.json"),
      /planCommit does not contain the Product Plan/,
    );
    updateState(root, (state) => {
      state.planCommit = planCommit;
    });
    updateState(root, (state) => {
      state.compilation.sizingStrategy = "isolation-first";
    });
    assert.throws(
      () => readRunState(root, "docs/plans/loop-runs/parallel-state.json"),
      /sizingStrategy does not match the Product Plan approval commit/,
    );
    updateState(root, (state) => {
      state.compilation = compilation;
    });
    updateState(root, (state) => {
      state.compilation.configSha256 = "0".repeat(64);
    });
    assert.throws(
      () => readRunState(root, "docs/plans/loop-runs/parallel-state.json"),
      /configSha256 does not match the Product Plan approval commit/,
    );
    updateState(root, (state) => {
      state.compilation = compilation;
    });
    updateState(root, (state) => {
      state.version = 4;
      state.compilation = { ...compilation };
      delete state.compilation.parallelism;
    });
    run(
      "git",
      [
        "add",
        "docs/plans/scopes/parallel",
        "docs/plans/loop-runs/parallel-state.json",
      ],
      root,
    );
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
          root,
        ),
      /new compiled execution requires version 5 run state/,
    );
    updateState(root, (state) => {
      state.version = 5;
      state.compilation = compilation;
    });
    const firstScopeContent = readFileSync(join(root, firstScope), "utf8");
    write(
      root,
      firstScope,
      firstScopeContent
        .split("\n")
        .filter((line) => !line.startsWith("coverage="))
        .join("\n"),
    );
    run(
      "git",
      [
        "add",
        "docs/plans/scopes/parallel",
        "docs/plans/loop-runs/parallel-state.json",
      ],
      root,
    );
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
          root,
        ),
      /scope coverage is required/,
    );
    write(root, firstScope, firstScopeContent);
    run(
      "git",
      [
        "add",
        "docs/plans/scopes/parallel",
        "docs/plans/loop-runs/parallel-state.json",
      ],
      root,
    );
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
        root,
      ).toString(),
      /AI-compiled execution commit boundary passed/,
    );
    const graphAnalysis = JSON.parse(
      run(
        "node",
        [
          "scripts/parallel-slices/slice-graph.mjs",
          "analyze",
          "--plan",
          "docs/plans/2026-07-17-parallel.md",
        ],
        root,
      ).toString(),
    );
    assert.equal(graphAnalysis.sliceCount, 3);
    assert.equal(graphAnalysis.maxParallelWidth, 2);
    assert.deepEqual(graphAnalysis.initialReadySlices, ["1.1", "1.2"]);
    commit(root, "chore(plan): compile parallel execution map");

    acquireRunLock(root, "codex", "docs/plans/loop-runs/parallel-state.json");
    assert.throws(
      () =>
        createSliceWorktree(root, {
          controller: "codex",
          state: "docs/plans/loop-runs/parallel-state.json",
          scopeFile: firstScope,
        }),
      /approved planning review is missing/,
    );
    releaseRunLock(root, "codex", "docs/plans/loop-runs/parallel-state.json", {
      handoff: true,
    });

    writeApprovedPlanningReview(
      root,
      "docs/plans/loop-runs/parallel-state.json",
    );
    run(
      "git",
      [
        "add",
        "docs/plans/reviews/parallel/planning.json",
        "docs/plans/reviews/parallel/planning.md",
      ],
      root,
    );
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
        root,
      ).toString(),
      /Independent planning-review commit boundary passed/,
    );
    commit(root, "chore(plan): record independent planning review");
    assert.doesNotThrow(() =>
      validatePlanningReviewEvidence(
        root,
        "docs/plans/loop-runs/parallel-state.json",
      ),
    );

    const lock = acquireRunLock(
      root,
      "codex",
      "docs/plans/loop-runs/parallel-state.json",
    );
    assert.equal(lock.created, true);
    assert.throws(
      () =>
        acquireRunLock(
          root,
          "cursor",
          "docs/plans/loop-runs/parallel-state.json",
        ),
      /assigns codex/,
    );
    const alternateStatePath = "docs/plans/loop-runs/alternate-state.json";
    const alternateState = JSON.parse(
      readFileSync(
        join(root, "docs/plans/loop-runs/parallel-state.json"),
        "utf8",
      ),
    );
    alternateState.controller = "cursor";
    alternateState.runId = "00000000-0000-4000-8000-000000000002";
    write(
      root,
      alternateStatePath,
      `${JSON.stringify(alternateState, null, 2)}\n`,
    );
    assert.throws(
      () => acquireRunLock(root, "cursor", alternateStatePath),
      /already owned by codex/,
    );
    rmSync(join(root, alternateStatePath));

    const legacyWorkerId = "00000000-0000-4000-8000-000000000011";
    const legacyWorktree = join(
      root,
      `.parallel-slices/runtime/worktrees/legacy-${legacyWorkerId.slice(0, 8)}`,
    );
    const legacyBase = run("git", ["rev-parse", "HEAD"], root).trim();
    run(
      "git",
      ["worktree", "add", "--detach", legacyWorktree, legacyBase],
      root,
    );
    write(
      root,
      `.parallel-slices/runtime/workers/${legacyWorkerId}.json`,
      `${JSON.stringify(
        {
          version: 1,
          workerId: legacyWorkerId,
          runId: "00000000-0000-4000-8000-000000000001",
          controller: "codex",
          state: "docs/plans/loop-runs/parallel-state.json",
          slice: "1.1",
          scopeFile: firstScope,
          baseCommit: legacyBase,
          worktree: legacyWorktree,
          status: "active",
          candidateCommit: null,
          acceptedCommit: null,
          retryCount: 1,
          candidateHistory: [],
          reviewEvidence: {},
        },
        null,
        2,
      )}\n`,
    );
    const firstWorker = readWorkerMetadata(root, legacyWorkerId);
    assert.equal(firstWorker.retryCount, 1);
    const secondWorker = createSliceWorktree(root, {
      controller: "codex",
      state: "docs/plans/loop-runs/parallel-state.json",
      scopeFile: secondScope,
    });
    const runtimeIndexPath = join(
      root,
      ".parallel-slices/runtime/runs/00000000-0000-4000-8000-000000000001/index.json",
    );
    const interruptedIndex = JSON.parse(readFileSync(runtimeIndexPath, "utf8"));
    interruptedIndex.slices["1.1"].attempts = [];
    writeFileSync(
      runtimeIndexPath,
      `${JSON.stringify(interruptedIndex, null, 2)}\n`,
    );
    assert.match(
      summarizeRunStatus(
        root,
        "docs/plans/loop-runs/parallel-state.json",
      ).warnings.join("\n"),
      /runtime index missed a complete atomic attempt directory/,
    );
    acquireRunLock(root, "codex", "docs/plans/loop-runs/parallel-state.json");
    assert.equal(
      JSON.parse(readFileSync(runtimeIndexPath, "utf8")).slices["1.1"].attempts
        .length,
      1,
    );
    updateWorkerTracking(root, firstWorker.workerId, "claimed");
    run("git", ["worktree", "remove", firstWorker.worktree], root);
    const missingWorktree = summarizeRunStatus(
      root,
      "docs/plans/loop-runs/parallel-state.json",
    );
    assert.match(
      missingWorktree.slices.find((slice) => slice.slice === "1.1").recovery,
      /slice-worktree\.mjs resume/,
    );
    resumeSliceWorktree(root, firstWorker.workerId);
    assert.equal(existsSync(firstWorker.worktree), true);
    assert.equal(
      readSliceAttemptTracking(root, firstWorker.workerId).worker.phase,
      "worktree_ready",
    );
    const firstTracking = readSliceAttemptTracking(root, firstWorker.workerId);
    const secondTracking = readSliceAttemptTracking(
      root,
      secondWorker.workerId,
    );
    assert.notEqual(firstTracking.workerPath, secondTracking.workerPath);
    assert.notEqual(
      firstTracking.integrationPath,
      secondTracking.integrationPath,
    );
    const artificialLock = `${join(root, firstTracking.workerPath)}.lock`;
    writeFileSync(
      artificialLock,
      `${JSON.stringify({ pid: 4242, startedAt: "2026-07-18T00:00:00.000Z" })}\n`,
    );
    const lockedStatus = summarizeRunStatus(
      root,
      "docs/plans/loop-runs/parallel-state.json",
    );
    assert.match(lockedStatus.warnings.join("\n"), /pid 4242/);
    rmSync(artificialLock);
    const deadProcess = spawnSync("node", ["-e", ""]);
    assert.equal(deadProcess.status, 0);
    writeFileSync(
      artificialLock,
      `${JSON.stringify({
        pid: deadProcess.pid,
        startedAt: "2026-07-18T00:00:00.000Z",
        token: "stale-owner",
      })}\n`,
    );
    updateWorkerTracking(root, firstWorker.workerId, "worktree_ready");
    assert.equal(existsSync(artificialLock), false);
    writeFileSync(
      artificialLock,
      `${JSON.stringify({
        pid: process.pid,
        startedAt: "2026-07-18T00:00:00.000Z",
        token: "live-owner",
      })}\n`,
    );
    assert.throws(
      () => updateWorkerTracking(root, firstWorker.workerId, "worktree_ready"),
      /already being updated/,
    );
    assert.equal(
      JSON.parse(readFileSync(artificialLock, "utf8")).token,
      "live-owner",
    );
    rmSync(artificialLock);
    updateWorkerTracking(root, firstWorker.workerId, "worktree_ready", {
      get blocker() {
        rmSync(artificialLock);
        writeFileSync(
          artificialLock,
          `${JSON.stringify({
            pid: process.pid,
            startedAt: "2026-07-18T00:00:00.000Z",
            token: "operator-reacquired",
          })}\n`,
        );
        return null;
      },
    });
    assert.equal(
      JSON.parse(readFileSync(artificialLock, "utf8")).token,
      "operator-reacquired",
    );
    rmSync(artificialLock);
    const stagingDirectory = join(
      root,
      ".parallel-slices/runtime/runs/00000000-0000-4000-8000-000000000001/slices/1.1/attempts/002.incoming-4242-fixture",
    );
    mkdirSync(stagingDirectory, { recursive: true });
    assert.match(
      summarizeRunStatus(
        root,
        "docs/plans/loop-runs/parallel-state.json",
      ).warnings.join("\n"),
      /incomplete atomic-write staging file exists at .*002\.incoming-4242-fixture/,
    );
    rmSync(stagingDirectory, { recursive: true, force: true });
    assert.notEqual(firstWorker.worktree, secondWorker.worktree);
    assert.equal(firstWorker.baseCommit, secondWorker.baseCommit);
    assert.equal(
      readSliceAttemptTracking(root, firstWorker.workerId).worker.phase,
      "worktree_ready",
    );
    assert.throws(
      () =>
        run(
          "node",
          [
            "scripts/parallel-slices/gate.mjs",
            "--scope-file",
            firstScope,
            "--scope-check-only",
            "--worker-id",
            firstWorker.workerId,
          ],
          root,
          { quiet: true },
        ),
      /worker gate is running in the wrong worktree/,
    );
    assert.throws(
      () =>
        createSliceWorktree(root, {
          controller: "codex",
          state: "docs/plans/loop-runs/parallel-state.json",
          scopeFile: finalScope,
        }),
      /not in the next ready parallel set/,
    );

    passWorkerPreflight(firstWorker, firstScope);
    passWorkerPreflight(secondWorker, secondScope);
    write(firstWorker.worktree, "apps/account.txt", "account\n");
    run(
      "node",
      [
        "scripts/parallel-slices/gate.mjs",
        "--scope-file",
        firstScope,
        "--worker-id",
        firstWorker.workerId,
      ],
      firstWorker.worktree,
    );
    commit(firstWorker.worktree, "feat(account): add isolated account output");
    checkpointCandidate(firstWorker);

    write(secondWorker.worktree, "apps/notifications.txt", "notifications\n");
    beginPipelineTracking(root, secondWorker.workerId, {
      integrated: false,
      pipeline: "full",
      steps: ["format", "lint"],
    });
    const interrupted = summarizeRunStatus(
      root,
      "docs/plans/loop-runs/parallel-state.json",
    );
    assert.match(
      interrupted.slices.find((slice) => slice.slice === "1.2").recovery,
      /pipeline is running or was interrupted/,
    );
    assert.throws(
      () => verifySliceCandidate(root, secondWorker.workerId),
      /candidate worktree is not clean/,
    );
    assert.equal(
      verifySliceCandidate(root, firstWorker.workerId).changed[0],
      "apps/account.txt",
    );

    integrateCandidate(root, firstWorker, "1.1", {
      independentReview: true,
    });
    assert.equal(existsSync(secondWorker.worktree), true);
    assert.equal(
      readSliceAttemptTracking(root, secondWorker.workerId).worker.phase,
      "pipeline_running",
    );

    const stateAfterFirst = readRunState(
      root,
      "docs/plans/loop-runs/parallel-state.json",
    );
    const manifestsAfterFirst = loadPlanManifests(
      root,
      "docs/plans/2026-07-17-parallel.md",
    );
    assert.deepEqual(
      computeReadySlices(manifestsAfterFirst, stateAfterFirst).map(
        (manifest) => manifest.slice,
      ),
      ["1.2", "1.3"],
    );
    const thirdWorker = createSliceWorktree(root, {
      controller: "codex",
      state: "docs/plans/loop-runs/parallel-state.json",
      scopeFile: finalScope,
    });
    assert.notEqual(thirdWorker.baseCommit, secondWorker.baseCommit);
    assert.equal(
      thirdWorker.baseCommit,
      run("git", ["rev-parse", "HEAD"], root).trim(),
    );

    run(
      "node",
      [
        "scripts/parallel-slices/gate.mjs",
        "--scope-file",
        secondScope,
        "--worker-id",
        secondWorker.workerId,
      ],
      secondWorker.worktree,
    );
    commit(
      secondWorker.worktree,
      "feat(notifications): add isolated notification output",
    );
    checkpointCandidate(secondWorker);
    assert.deepEqual(
      readSliceAttemptTracking(
        root,
        secondWorker.workerId,
      ).worker.pipelines.map((pipeline) => pipeline.status),
      ["interrupted", "passed"],
    );
    assert.equal(
      verifySliceCandidate(root, secondWorker.workerId).changed[0],
      "apps/notifications.txt",
    );

    passWorkerPreflight(thirdWorker, finalScope);
    write(thirdWorker.worktree, "tests/integrated.txt", "account verified\n");
    run(
      "node",
      [
        "scripts/parallel-slices/gate.mjs",
        "--scope-file",
        finalScope,
        "--worker-id",
        thirdWorker.workerId,
      ],
      thirdWorker.worktree,
    );
    commit(thirdWorker.worktree, "test(account): add follow-up verification");
    checkpointCandidate(thirdWorker);
    const thirdVerified = verifySliceCandidate(root, thirdWorker.workerId);
    assert.equal(thirdVerified.changed[0], "tests/integrated.txt");

    const claimedGoalBase = run("git", ["rev-parse", "HEAD"], root).trim();
    const thirdTracking = readSliceAttemptTracking(root, thirdWorker.workerId);
    const integrationLock = `${join(root, thirdTracking.integrationPath)}.lock`;
    writeFileSync(
      integrationLock,
      `${JSON.stringify({
        pid: process.pid,
        startedAt: "2026-07-18T00:00:00.000Z",
        token: "held",
      })}\n`,
    );
    assert.throws(
      () =>
        claimIntegrationAttempt(root, thirdWorker.workerId, claimedGoalBase),
      /already being updated/,
    );
    rmSync(integrationLock);
    const claimSource = [
      `import { claimIntegrationAttempt } from ${JSON.stringify(
        pathToFileURL(join(root, "scripts/parallel-slices/run-tracking.mjs"))
          .href,
      )};`,
      "try {",
      `  const claim = claimIntegrationAttempt(${JSON.stringify(root)}, ${JSON.stringify(thirdWorker.workerId)}, ${JSON.stringify(claimedGoalBase)});`,
      "  console.log(JSON.stringify({ ok: true, alreadyClaimed: claim.alreadyClaimed === true }));",
      "} catch (error) {",
      "  console.log(JSON.stringify({ ok: false, message: error.message }));",
      "}",
    ].join("\n");
    const claimResults = (
      await Promise.all([
        execFile("node", ["--input-type=module", "-e", claimSource], {
          cwd: root,
        }),
        execFile("node", ["--input-type=module", "-e", claimSource], {
          cwd: root,
        }),
      ])
    ).map((result) => JSON.parse(result.stdout));
    assert.equal(
      claimResults.filter((claim) => claim.ok && !claim.alreadyClaimed).length,
      1,
    );
    for (const claim of claimResults) {
      if (claim.ok) continue;
      assert.match(claim.message, /already being updated/);
    }
    const claimedTracking = readSliceAttemptTracking(
      root,
      thirdWorker.workerId,
    );
    assert.equal(claimedTracking.integration.phase, "integration_claimed");
    assert.equal(claimedTracking.integration.goalBaseCommit, claimedGoalBase);
    assert.equal("alreadyClaimed" in claimedTracking.integration, false);
    assert.equal(
      claimIntegrationAttempt(root, thirdWorker.workerId, claimedGoalBase)
        .alreadyClaimed,
      true,
    );
    run(
      "git",
      ["cherry-pick", "--no-commit", thirdVerified.metadata.candidateCommit],
      root,
    );
    assert.throws(
      () =>
        claimIntegrationAttempt(root, secondWorker.workerId, claimedGoalBase),
      /serial integration is already owned by slice 1\.3 attempt 1/,
    );
    const claimedStatus = summarizeRunStatus(
      root,
      "docs/plans/loop-runs/parallel-state.json",
    );
    assert.match(
      claimedStatus.slices.find((slice) => slice.slice === "1.3").recovery,
      /slice-worktree\.mjs apply/,
    );
    integrateCandidate(root, thirdWorker, "1.3", {
      assertConfiguredReview: true,
    });

    const rejected = verifySliceCandidate(root, secondWorker.workerId);
    applySliceCandidate(root, secondWorker.workerId);
    updateState(root, (state) => {
      state.status = "in_progress";
      state.slices["1.2"].status = "in_progress";
      state.slices["1.2"].candidateCommit = rejected.metadata.candidateCommit;
    });
    run(
      "node",
      [
        "scripts/parallel-slices/gate.mjs",
        "--scope-file",
        secondScope,
        "--integrated",
        "--worker-id",
        secondWorker.workerId,
      ],
      root,
    );
    write(
      root,
      "docs/plans/reviews/parallel/1.2.json",
      '{"version":1,"result":"changes_requested"}\n',
    );
    write(
      root,
      "docs/plans/reviews/parallel/1.2.md",
      "# Review\n\nChanges requested.\n",
    );
    updateIntegrationTracking(root, secondWorker.workerId, "review_running");
    updateIntegrationTracking(root, secondWorker.workerId, "review_failed", {
      review: {
        status: "CHANGES_REQUESTED",
        artifact: "docs/plans/reviews/parallel/1.2.json",
      },
      blocker: "Review requested a correction.",
    });
    const retry = retrySliceWorker(root, secondWorker.workerId);
    assert.notEqual(retry.worktree, secondWorker.worktree);
    assert.equal(
      retry.baseCommit,
      run("git", ["rev-parse", "HEAD"], root).trim(),
    );
    assert.notEqual(retry.workerId, secondWorker.workerId);
    const retryTracking = listRunAttempts(
      root,
      "docs/plans/loop-runs/parallel-state.json",
    ).attempts.filter((attempt) => attempt.worker.slice === "1.2");
    assert.equal(retryTracking.length, 2);
    assert.equal(retryTracking[0].integration.phase, "retry_requested");
    assert.equal(
      retryTracking[0].integration.candidateCommit,
      rejected.metadata.candidateCommit,
    );
    assert.equal(run("git", ["status", "--porcelain=v1"], root), "");
    run("git", ["worktree", "remove", retry.worktree], root);
    const resumedRetry = retrySliceWorker(root, secondWorker.workerId);
    assert.equal(resumedRetry.workerId, retry.workerId);
    assert.equal(existsSync(retry.worktree), true);
    passWorkerPreflight(resumedRetry, secondScope);
    write(
      resumedRetry.worktree,
      "apps/notifications.txt",
      "notifications corrected\n",
    );
    run(
      "node",
      [
        "scripts/parallel-slices/gate.mjs",
        "--scope-file",
        secondScope,
        "--worker-id",
        resumedRetry.workerId,
      ],
      resumedRetry.worktree,
    );
    commit(
      resumedRetry.worktree,
      "feat(notifications): add isolated notification output",
    );
    checkpointCandidate(resumedRetry);
    integrateCandidate(root, resumedRetry, "1.2");
    assert.match(
      readFileSync(join(root, "docs/plans/reviews/parallel/1.2.json"), "utf8"),
      /APPROVED/,
    );

    const state = JSON.parse(
      readFileSync(
        join(root, "docs/plans/loop-runs/parallel-state.json"),
        "utf8",
      ),
    );
    const manifests = loadPlanManifests(
      root,
      "docs/plans/2026-07-17-parallel.md",
    );
    assert.deepEqual(
      computeReadySlices(manifests, state).map((manifest) => manifest.slice),
      [],
    );
    const summary = summarizeRunStatus(
      root,
      "docs/plans/loop-runs/parallel-state.json",
    );
    assert.equal(summary.accepted, 3);
    assert.equal(summary.total, 3);
    assert.equal(summary.progress, 100);
    assert.match(renderRunStatus(summary), /Total \[#{20}\]\s+100%/);
    assert.match(
      renderRunStatus(summary),
      /1\.3\s+\[#{20}\]\s+100%\s+accepted/,
    );
    const statusOutput = run(
      "node",
      [
        "scripts/parallel-slices/run-status.mjs",
        "--state",
        "docs/plans/loop-runs/parallel-state.json",
      ],
      root,
    ).toString();
    assert.match(statusOutput, /Total \[#{20}\]\s+100%/);
    assert.match(statusOutput, /1\.1\s+\[#{20}\]\s+100%\s+accepted/);

    updateState(root, (runState) => {
      runState.status = "finished";
    });
    assert.throws(
      () => readRunState(root, "docs/plans/loop-runs/parallel-state.json"),
      /requires structured finalAudit evidence/,
    );
    updateState(root, (runState) => {
      runState.status = "in_progress";
      runState.slices["1.3"].status = "in_progress";
    });
    assert.doesNotThrow(() =>
      readRunState(root, "docs/plans/loop-runs/parallel-state.json"),
    );
    const auditedCommit = run("git", ["rev-parse", "HEAD"], root).trim();
    updateState(root, (runState) => {
      runState.status = "finished";
      runState.slices["1.3"].status = "accepted";
      runState.finalAudit = {
        version: 1,
        completedAt: "2026-07-18T22:00:00.000Z",
        auditedCommit,
        acceptedSlices: ["1.1", "1.2", "1.3"],
        requirements: ["R1, R2, and R3 are satisfied."],
        preservation: ["No accepted slice regressed."],
        gates: ["Every worker and integrated gate passed."],
        reviews: ["Every accepted slice has approved review evidence."],
        releaseFragments: ["No release fragment was required."],
        state: ["Committed state agrees with all accepted candidates."],
        nonGoals: ["No work outside the approved plan was added."],
      };
    });
    assert.doesNotThrow(() =>
      readRunState(root, "docs/plans/loop-runs/parallel-state.json"),
    );
    updateState(root, (runState) => {
      runState.slices["1.3"].status = "in_progress";
    });
    assert.throws(
      () => readRunState(root, "docs/plans/loop-runs/parallel-state.json"),
      /requires every slice to be accepted/,
    );
    updateState(root, (runState) => {
      runState.slices["1.3"].status = "accepted";
    });
    commit(root, "chore(run): record final audit");
    assert.doesNotThrow(() =>
      readRunState(root, "docs/plans/loop-runs/parallel-state.json"),
    );
    releaseRunLock(root, "codex", "docs/plans/loop-runs/parallel-state.json", {
      handoff: true,
    });
    const runLockPath = join(root, ".parallel-slices/runtime/run.lock.json");
    writeFileSync(runLockPath, "");
    assert.throws(
      () =>
        acquireRunLock(
          root,
          "codex",
          "docs/plans/loop-runs/parallel-state.json",
        ),
      /invalid run lock .+run\.lock\.json.+verify the former controller process stopped/,
    );
    rmSync(runLockPath);
    write(root, "docs/plans/loop-runs/zz-legacy-invalid.json", "{\n");
    const discoveredStatus = run(
      "node",
      ["scripts/parallel-slices/run-status.mjs"],
      root,
    ).toString();
    assert.match(discoveredStatus, /Total \[#{20}\]\s+100%/);
    assert.match(
      discoveredStatus,
      /skipped unreadable run-state candidate docs\/plans\/loop-runs\/zz-legacy-invalid\.json/,
    );
    rmSync(join(root, "docs/plans/loop-runs/zz-legacy-invalid.json"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
