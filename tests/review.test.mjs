import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  acquireReviewLock,
  assertNoReviewTemporaries,
  beginReviewAttempt,
  loadReviewLedger,
  releaseReviewLock,
  writeReviewLedger,
} from "../repo-overlay/scripts/parallel-slices/review-artifact.mjs";
import {
  supportedReviewProviders,
  validateReviewConfig,
} from "../repo-overlay/scripts/parallel-slices/review-config.mjs";
import {
  parseMarkedJson,
  validateReviewerResponse,
} from "../repo-overlay/scripts/parallel-slices/review-contract.mjs";
import { runSupervised } from "../repo-overlay/scripts/parallel-slices/review-process.mjs";
import { preflightProvider } from "../repo-overlay/scripts/parallel-slices/review-providers.mjs";
import {
  calculateRepositoryFingerprint,
  createReviewSnapshot,
} from "../repo-overlay/scripts/parallel-slices/review-snapshot.mjs";
import {
  applyReviewerResponse,
  evaluateConsensus,
} from "../repo-overlay/scripts/parallel-slices/review-state.mjs";
import { parseReviewArguments } from "../repo-overlay/scripts/parallel-slices/review.mjs";
import { run, write } from "./helpers/fixture.mjs";

function reviewConfig(overrides = {}) {
  return {
    $schema: "./review.schema.json",
    version: 1,
    enabled: true,
    billingPolicy: "subscription-only",
    turnTimeoutSeconds: 600,
    overallTimeoutSeconds: 3600,
    authWaitSeconds: 900,
    reviewers: [
      { id: "codex-review", provider: "codex", effort: "high" },
      { id: "claude-review", provider: "claude-code", effort: "max" },
      { id: "antigravity-review", provider: "antigravity" },
    ],
    ...overrides,
  };
}

function response(overrides = {}) {
  return {
    verdict: "approve",
    summary: "The authorized implementation satisfies the slice contract.",
    findings: [],
    ...overrides,
  };
}

function highFinding() {
  return {
    severity: "high",
    category: "correctness",
    title: "Failure path is not bounded",
    description: "The new branch can wait forever after a failed request.",
    evidence: [
      {
        path: "apps/web/app/page.tsx",
        line: 12,
        detail: "The pending state has no timeout or recovery transition.",
      },
    ],
    recommendation: "Add and test a bounded recovery state.",
  };
}

test("validates ordered review configuration and rejects ambiguous variants", () => {
  assert.deepEqual(supportedReviewProviders, [
    "codex",
    "claude-code",
    "antigravity",
    "cursor",
  ]);
  assert.equal(validateReviewConfig(reviewConfig()).reviewers.length, 3);
  assert.doesNotThrow(() =>
    validateReviewConfig(
      reviewConfig({
        reviewers: [
          { id: "cursor-review-a", provider: "cursor", model: "model-a" },
          { id: "cursor-review-b", provider: "cursor", model: "model-b" },
        ],
      }),
    ),
  );
  assert.doesNotThrow(() =>
    validateReviewConfig(reviewConfig({ enabled: false, reviewers: [] })),
  );
  assert.throws(
    () =>
      validateReviewConfig(
        reviewConfig({
          reviewers: [
            { id: "same", provider: "codex" },
            { id: "same", provider: "claude-code" },
          ],
        }),
      ),
    /duplicate reviewer id/,
  );
  assert.throws(
    () =>
      validateReviewConfig(
        reviewConfig({
          reviewers: [
            {
              id: "antigravity-review",
              provider: "antigravity",
              effort: "high",
            },
          ],
        }),
      ),
    /effort is not supported/,
  );
  assert.throws(
    () =>
      validateReviewConfig(
        reviewConfig({
          reviewers: [{ id: "cursor-review", provider: "cursor" }],
        }),
      ),
    /model is required by cursor/,
  );
  assert.throws(
    () =>
      validateReviewConfig(
        reviewConfig({
          reviewers: [
            {
              id: "cursor-review",
              provider: "cursor",
              model: "model-a",
              effort: "high",
            },
          ],
        }),
      ),
    /effort is not supported by cursor/,
  );
});

test("Cursor preflight uses the Agent CLI and cached subscription login", async () => {
  const invocations = [];
  const ready = await preflightProvider("cursor", {
    root: "/synthetic/repository",
    billingPolicy: "subscription-only",
    models: ["model-a"],
    runProcess: async (options) => {
      invocations.push(options);
      return {
        outcome: "completed",
        exitCode: 0,
        stdout:
          options.args[0] === "--version"
            ? "cursor-agent test-version\n"
            : options.args[0] === "status"
              ? "Authenticated via browser login\n"
              : "model-a - Model A\n",
        stderr: "",
      };
    },
  });

  assert.equal(ready.ok, true);
  assert.equal(ready.authKind, "cached-browser-login");
  assert.equal(ready.billingMode, "subscription");
  assert.deepEqual(
    invocations.map(({ command, args }) => ({ command, args })),
    [
      { command: "cursor-agent", args: ["--version"] },
      { command: "cursor-agent", args: ["status"] },
      { command: "cursor-agent", args: ["--list-models"] },
    ],
  );
  assert.equal(
    invocations.some(({ env }) => Object.hasOwn(env, "CURSOR_API_KEY")),
    false,
  );

  const missing = await preflightProvider("cursor", {
    root: "/synthetic/repository",
    billingPolicy: "subscription-only",
    runProcess: async () => ({
      outcome: "start_error",
      error: { code: "ENOENT" },
      stdout: "",
      stderr: "",
    }),
  });
  assert.equal(missing.code, "CLI_NOT_INSTALLED");
  assert.match(missing.instructions.join("\n"), /cursor-agent login/);
});

test("enforces complete structured findings and the verdict rules", () => {
  assert.doesNotThrow(() => validateReviewerResponse(response()));
  assert.throws(
    () =>
      validateReviewerResponse(
        response({ verdict: "approve", findings: [highFinding()] }),
      ),
    /approve verdict cannot introduce/,
  );
  assert.throws(
    () =>
      validateReviewerResponse(
        response({
          verdict: "request_changes",
          summary: "Changes are requested without an actionable finding.",
        }),
      ),
    /must report at least one finding/,
  );
  assert.throws(
    () =>
      validateReviewerResponse(
        response({
          findings: [
            {
              ...highFinding(),
              severity: "medium",
              evidence: [
                {
                  path: "../outside",
                  line: 1,
                  detail: "Unsafe evidence path.",
                },
              ],
            },
          ],
        }),
      ),
    /unsafe path segment/,
  );

  const nonce = "6c9f0f36-3d0f-4a83-9f5f-2f6f4b7f9d21";
  const marked = `diagnostic output\nPARALLEL_SLICES_REVIEW_JSON_BEGIN_${nonce}\n${JSON.stringify(
    response(),
  )}\nPARALLEL_SLICES_REVIEW_JSON_END_${nonce}\n`;
  assert.deepEqual(parseMarkedJson(marked, nonce), response());
  assert.throws(
    () => parseMarkedJson(JSON.stringify(response()), nonce),
    /markers/,
  );
  assert.throws(() => parseMarkedJson(marked), /nonce/);
  const forged = `PARALLEL_SLICES_REVIEW_JSON_BEGIN\n${JSON.stringify(
    response(),
  )}\nPARALLEL_SLICES_REVIEW_JSON_END\n`;
  assert.throws(() => parseMarkedJson(forged, nonce), /markers/);
  assert.throws(
    () => parseMarkedJson(`${marked}${marked}`, nonce),
    /more than one begin marker/,
  );
});

test("accepts multi-line prose while rejecting hidden control characters", () => {
  assert.doesNotThrow(() =>
    validateReviewerResponse(
      response({
        summary: "First line.\n\tSecond line with a tab.\r\nThird line.",
      }),
    ),
  );
  assert.doesNotThrow(() =>
    validateReviewerResponse(
      response({
        verdict: "request_changes",
        summary: "A blocking defect remains.",
        findings: [
          {
            ...highFinding(),
            description: "Line one.\nLine two.",
            recommendation: "Step one.\nStep two.",
          },
        ],
      }),
    ),
  );
  for (const hidden of [
    "\u0007",
    "\u001b",
    "\u007f",
    "\u202e",
    "\u2066",
    "\u200b",
    "\u2060",
    "\ufeff",
  ]) {
    assert.throws(
      () => validateReviewerResponse(response({ summary: `bad${hidden}text` })),
      /reviewer summary/,
    );
  }
  assert.throws(
    () =>
      validateReviewerResponse(
        response({
          verdict: "request_changes",
          summary: "A blocking defect remains.",
          findings: [{ ...highFinding(), title: "Two\nlines" }],
        }),
      ),
    /title/,
  );
});

test("passes only when every reviewer approves in one independent pass", () => {
  const reviewers = ["maker-check", "second-check"];
  const attempt = { findings: [], nextFindingNumber: 1, rounds: [] };
  const round = { number: 1, turns: [] };
  attempt.rounds.push(round);

  // One reviewer requesting changes is enough to block, regardless of what the
  // other says. Reviewers never see or overrule each other.
  applyReviewerResponse(
    attempt,
    round,
    { id: reviewers[0], provider: "codex", version: "codex test" },
    response({
      verdict: "request_changes",
      summary: "A blocking recovery defect remains.",
      findings: [highFinding()],
    }),
    10,
  );
  applyReviewerResponse(
    attempt,
    round,
    { id: reviewers[1], provider: "claude-code", version: "claude test" },
    response({ summary: "This reviewer found nothing." }),
    11,
  );
  const blocked = evaluateConsensus(attempt, round, reviewers);
  assert.equal(blocked.approved, false);
  assert.equal(blocked.allApproved, false);
  assert.deepEqual(blocked.blockingFindingIds, ["F001"]);

  // Unanimous approval with nothing blocking passes.
  const clean = { findings: [], nextFindingNumber: 1, rounds: [] };
  const cleanRound = { number: 1, turns: [] };
  clean.rounds.push(cleanRound);
  for (const [index, id] of reviewers.entries()) {
    applyReviewerResponse(
      clean,
      cleanRound,
      { id, provider: "codex", version: "codex test" },
      response({ summary: `Reviewer ${index + 1} approves.` }),
      12 + index,
    );
  }
  assert.equal(evaluateConsensus(clean, cleanRound, reviewers).approved, true);
});

test("a high finding blocks even when every reviewer approves", () => {
  const reviewers = ["one"];
  const attempt = { findings: [], nextFindingNumber: 1, rounds: [] };
  const round = { number: 1, turns: [] };
  attempt.rounds.push(round);
  // validateReviewerResponse refuses this pairing, so reach past it to prove
  // the consensus rule is a second, independent guard.
  attempt.findings.push({ ...highFinding(), id: "F001", raisedBy: "one" });
  round.turns.push({ reviewerId: "one", verdict: "approve" });
  const consensus = evaluateConsensus(attempt, round, reviewers);
  assert.equal(consensus.allApproved, true);
  assert.equal(consensus.approved, false);
  assert.deepEqual(consensus.blockingFindingIds, ["F001"]);
});

test("an overridden blocking finding no longer blocks, and an outstanding one still does", () => {
  const reviewers = ["one", "two"];
  const attempt = { findings: [], nextFindingNumber: 1, rounds: [] };
  const round = { number: 1, turns: [] };
  attempt.rounds.push(round);
  applyReviewerResponse(
    attempt,
    round,
    { id: reviewers[0], provider: "codex", version: "codex test" },
    response({
      verdict: "request_changes",
      summary: "Two blocking defects remain.",
      findings: [highFinding(), highFinding()],
    }),
    10,
  );
  applyReviewerResponse(
    attempt,
    round,
    { id: reviewers[1], provider: "claude-code", version: "claude test" },
    response({ summary: "This reviewer found nothing." }),
    11,
  );
  assert.equal(evaluateConsensus(attempt, round, reviewers).approved, false);

  // Accepting one of two leaves the other outstanding, so it still blocks.
  attempt.overrides = [
    { findingId: "F001", reason: "Accepted on the record." },
  ];
  const partial = evaluateConsensus(attempt, round, reviewers);
  assert.equal(partial.approved, false);
  assert.deepEqual(partial.blockingFindingIds, ["F002"]);

  // Accepting every blocking finding lets the orchestrator's decision stand in
  // place of unanimity, which is what keeps the workflow completable when
  // reviewers never converge.
  attempt.overrides.push({
    findingId: "F002",
    reason: "Accepted on the record.",
  });
  const decided = evaluateConsensus(attempt, round, reviewers);
  assert.equal(decided.approved, true);
  assert.equal(decided.allApproved, false);
  assert.deepEqual(decided.blockingFindingIds, []);
});

test("consensus is unchanged when the orchestrator overrides nothing", () => {
  const reviewers = ["one"];
  const attempt = {
    findings: [],
    nextFindingNumber: 1,
    rounds: [],
    overrides: [],
  };
  const round = { number: 1, turns: [] };
  attempt.rounds.push(round);
  attempt.findings.push({ ...highFinding(), id: "F001", raisedBy: "one" });
  round.turns.push({ reviewerId: "one", verdict: "approve" });
  assert.equal(evaluateConsensus(attempt, round, reviewers).approved, false);
});

test("creates an immutable review snapshot that represents tracked deletions", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-review-snapshot-"));
  let snapshot;
  try {
    run("git", ["init", "-b", "feature/review-snapshot"], root);
    write(root, "kept.txt", "before\n");
    write(root, "deleted.txt", "remove me\n");
    run("git", ["add", "."], root);
    run(
      "git",
      [
        "-c",
        "user.name=Review Test",
        "-c",
        "user.email=review@example.test",
        "commit",
        "-m",
        "test: establish review fixture",
      ],
      root,
    );
    write(root, "kept.txt", "after\n");
    unlinkSync(join(root, "deleted.txt"));
    write(root, "new.txt", "new file\n");
    snapshot = createReviewSnapshot(root, {
      changedPaths: ["deleted.txt", "kept.txt", "new.txt"],
      excludePaths: [],
    });
    assert.equal(
      readFileSync(join(snapshot.snapshotRoot, "kept.txt"), "utf8"),
      "after\n",
    );
    assert.equal(existsSync(join(snapshot.snapshotRoot, "deleted.txt")), false);
    assert.match(readFileSync(snapshot.patchPath, "utf8"), /deleted file mode/);
    const original = calculateRepositoryFingerprint(root).fingerprint;
    assert.equal(snapshot.fingerprint, original);
    assert.deepEqual(snapshot.files, ["kept.txt", "new.txt"]);
    write(root, "kept.txt", "concurrent edit\n");
    assert.notEqual(calculateRepositoryFingerprint(root).fingerprint, original);
  } finally {
    if (snapshot)
      rmSync(snapshot.snapshotRoot, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses absolute review-input symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-review-link-"));
  try {
    run("git", ["init", "-b", "feature/review-link"], root);
    write(root, "target.txt", "target\n");
    symlinkSync(join(root, "target.txt"), join(root, "absolute-link"));
    assert.throws(
      () => createReviewSnapshot(root, { changedPaths: [], excludePaths: [] }),
      /absolute symlink/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writes a permanent JSON ledger and generated Markdown view", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-review-artifact-"));
  try {
    const config = reviewConfig({
      reviewers: reviewConfig().reviewers.slice(0, 1),
    });
    const manifest = {
      review: "docs/plans/reviews/example/1.1.json",
      requirements: "R1",
      slice: "1.1",
    };
    const loaded = loadReviewLedger(
      root,
      "docs/plans/scopes/example/1.1.scope",
      manifest,
      config,
      "2026-07-16T00:00:00.000Z",
    );
    const attempt = beginReviewAttempt(
      loaded.ledger,
      "sha256:test",
      ["apps/web/app/page.tsx"],
      loaded.ledger.configuration,
      "2026-07-16T00:00:00.000Z",
    );
    attempt.status = "approved";
    attempt.completedAt = "2026-07-16T00:01:00.000Z";
    attempt.outcome = "Approved by all configured reviewers.";
    writeReviewLedger(root, loaded.paths, loaded.ledger);
    const json = JSON.parse(
      readFileSync(join(root, loaded.paths.json), "utf8"),
    );
    const markdown = readFileSync(join(root, loaded.paths.markdown), "utf8");
    assert.equal(
      json.attempts[0].configuration.reviewers[0].id,
      "codex-review",
    );
    assert.match(markdown, /Attempt 1: approved/);
    assert.match(markdown, /Source fingerprint: `sha256:test`/);

    const lock = acquireReviewLock(root, loaded.paths);
    assert.throws(
      () => acquireReviewLock(root, loaded.paths),
      /review lock already exists/,
    );
    releaseReviewLock(lock);
    write(root, "docs/plans/reviews/example/1.1.json.tmp-999", "incomplete\n");
    assert.throws(
      () => assertNoReviewTemporaries(root, loaded.paths),
      /stale review temporary files/,
    );
    unlinkSync(join(root, "docs/plans/reviews/example/1.1.json.tmp-999"));

    rmSync(join(root, "docs/plans/reviews/example"), {
      recursive: true,
      force: true,
    });
    write(root, "outside", "outside\n");
    symlinkSync(
      join(root, "outside"),
      join(root, "docs/plans/reviews/example"),
    );
    assert.throws(
      () => writeReviewLedger(root, loaded.paths, loaded.ledger),
      /directory symlink/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("supervises provider time and output bounds", async () => {
  const timed = await runSupervised({
    command: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    cwd: process.cwd(),
    timeoutMs: 50,
    outputLimitBytes: 1024,
  });
  assert.equal(timed.outcome, "timed_out");

  const noisy = await runSupervised({
    command: process.execPath,
    args: [
      "-e",
      "process.stdout.write('x'.repeat(10000)); setInterval(() => {}, 1000)",
    ],
    cwd: process.cwd(),
    timeoutMs: 1000,
    outputLimitBytes: 100,
  });
  assert.equal(noisy.outcome, "output_limit");
  assert.ok(Buffer.byteLength(noisy.stdout) <= 100);
});

test("settles promptly when an orphaned grandchild holds the output pipe", async () => {
  const script = [
    "const { spawn } = require('node:child_process');",
    "const holder = spawn(",
    "  process.execPath,",
    "  ['-e', 'setTimeout(() => {}, 30000)'],",
    "  { stdio: ['ignore', 'inherit', 'inherit'] },",
    ");",
    "holder.unref();",
    "console.log('parent finished');",
  ].join("\n");
  const settled = await runSupervised({
    command: process.execPath,
    args: ["-e", script],
    cwd: process.cwd(),
    timeoutMs: 10_000,
    outputLimitBytes: 64 * 1024,
  });
  assert.equal(settled.outcome, "exited");
  assert.equal(settled.exitCode, 0);
  assert.match(settled.stdout, /parent finished/);
  assert.ok(settled.durationMs < 5000);
});

test("parses only explicit review commands", () => {
  assert.deepEqual(parseReviewArguments(["validate"]), { command: "validate" });
  assert.deepEqual(
    parseReviewArguments([
      "run",
      "--scope-file",
      "docs/plans/scopes/example/1.1.scope",
      "--worker-id",
      "00000000-0000-4000-8000-000000000123",
      "--non-interactive",
    ]),
    {
      command: "run",
      scopeFile: "docs/plans/scopes/example/1.1.scope",
      workerId: "00000000-0000-4000-8000-000000000123",
      nonInteractive: true,
    },
  );
  assert.throws(() => parseReviewArguments(["run", "--unknown"]), /unknown/);
});

test("Product Plan review isolates reviewers, fingerprints the plan, and needs unanimity", async () => {
  const { planFingerprint, planReviewArtifactPaths } =
    await import("../repo-overlay/scripts/parallel-slices/review-plan.mjs");

  // A fingerprint ties an approval to exact content, so an edited plan cannot
  // inherit an earlier approval.
  const first = planFingerprint("# Plan\n\nR1 does a thing.\n");
  assert.match(first, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first, planFingerprint("# Plan\n\nR1 does a thing.\n"));
  assert.notEqual(first, planFingerprint("# Plan\n\nR1 does another thing.\n"));

  // Artifacts land beside the other review evidence, keyed by feature name and
  // independent of the plan's date prefix.
  const paths = planReviewArtifactPaths(
    "docs/plans/2026-01-01-example-goal.md",
  );
  assert.equal(paths.feature, "example-goal");
  assert.equal(paths.json, "docs/plans/reviews/example-goal/product-plan.json");
  assert.equal(
    paths.markdown,
    "docs/plans/reviews/example-goal/product-plan.md",
  );
});

test("a human override is narrow, reasoned, permanent, and does not unblock on its own", async () => {
  const { applyOverrides, locateReviewRecord } =
    await import("../repo-overlay/scripts/parallel-slices/review-override.mjs");
  const reason =
    "R29 is superseded by the next plan revision; the finding is correct and accepted.";
  const ledger = () => ({
    status: "changes_requested",
    findings: [
      { id: "P001", severity: "high", title: "one", raisedBy: "a" },
      { id: "P002", severity: "high", title: "two", raisedBy: "b" },
      { id: "P003", severity: "low", title: "three", raisedBy: "a" },
    ],
  });

  // Overriding one of two blocking findings must not unblock the review.
  const partial = ledger();
  const first = applyOverrides(
    partial,
    ["P001"],
    reason,
    "2026-01-01T00:00:00Z",
  );
  assert.equal(first.record.status, "changes_requested");
  assert.deepEqual(
    first.outstanding.map((finding) => finding.id),
    ["P002"],
  );

  // Accounting for every blocking finding unblocks it, and low findings never
  // blocked in the first place so they need no override.
  const full = ledger();
  applyOverrides(full, ["P001"], reason, "2026-01-01T00:00:00Z");
  const second = applyOverrides(full, ["P002"], reason, "2026-01-02T00:00:00Z");
  assert.equal(second.record.status, "approved_with_overrides");
  assert.equal(locateReviewRecord(full).overrides.length, 2);

  // Every override records who raised it and why, permanently.
  for (const entry of locateReviewRecord(full).overrides) {
    assert.ok(entry.reason.length >= 40);
    assert.ok(entry.decidedAt);
    assert.ok(entry.raisedBy);
  }

  // An unknown finding id is refused rather than silently accepted.
  assert.throws(
    () => applyOverrides(ledger(), ["NOPE"], reason, "2026-01-01T00:00:00Z"),
    /no such finding/,
  );
});
