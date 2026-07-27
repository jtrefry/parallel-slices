import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";

import {
  parallelSlicesRoot,
  run,
  write,
  writeInitializedContract,
  writeScaffold,
} from "./helpers/fixture.mjs";
import { validatePlanningReviewEvidence } from "../repo-overlay/scripts/parallel-slices/planning-review.mjs";
import { acquireRunLock } from "../repo-overlay/scripts/parallel-slices/run-lock.mjs";
import { readSliceCompilationSnapshot } from "../repo-overlay/scripts/parallel-slices/slice-compilation.mjs";
import { createSliceWorktree } from "../repo-overlay/scripts/parallel-slices/slice-worktree.mjs";

function reviewConfiguration(reviewers, overrides = {}) {
  return {
    $schema: "./review.schema.json",
    version: 1,
    enabled: true,
    billingPolicy: "subscription-only",
    turnTimeoutSeconds: 5,
    overallTimeoutSeconds: 30,
    authWaitSeconds: 2,
    reviewers,
    ...overrides,
  };
}

function createReviewTarget(reviewers, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-review-target-"));
  run("git", ["init", "-b", "feature/review-engine"], root);
  writeScaffold(root, { qualityScripts: true });
  run(
    "bash",
    [join(parallelSlicesRoot, "scripts/setup.sh"), "--agent", "codex", root],
    parallelSlicesRoot,
  );
  writeInitializedContract(root);
  run(
    "node",
    ["scripts/parallel-slices/project-state.mjs", "advance", "contract-ready"],
    root,
  );
  write(
    root,
    ".parallel-slices/review.json",
    `${JSON.stringify(reviewConfiguration(reviewers, overrides), null, 2)}\n`,
  );
  write(
    root,
    "docs/plans/2026-07-16-review-engine.md",
    "# Review engine fixture\n\nStatus: APPROVED\n",
  );
  write(
    root,
    "docs/plans/scopes/review-engine/1.1.scope",
    `version=1
plan=docs/plans/2026-07-16-review-engine.md
slice=1.1
requirements=R1
observable=The reviewed module exports its approved behavior.
minimum_stage=contract-ready
release_notes=none
gate=core
review=docs/plans/reviews/review-engine/1.1.json
allow=app/example.mjs
allow=docs/plans/2026-07-16-review-engine.md
allow=docs/plans/reviews/review-engine/1.1.json
allow=docs/plans/reviews/review-engine/1.1.md
allow=docs/plans/scopes/review-engine/1.1.scope
`,
  );
  run("git", ["add", "."], root);
  run(
    "git",
    [
      "-c",
      "user.name=Review Integration",
      "-c",
      "user.email=review-integration@example.test",
      "commit",
      "-m",
      "test: establish review contract",
    ],
    root,
  );
  write(root, "app/example.mjs", "export const reviewed = true;\n");
  return root;
}

function installFakeProviders(parent) {
  const bin = join(parent, "bin");
  const script = `#!/usr/bin/env node
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const provider = basename(process.argv[1]);
const args = process.argv.slice(2);
const markerMatch = args
  .join("\\n")
  .match(/PARALLEL_SLICES_REVIEW_JSON_BEGIN_[0-9a-f-]+/);
const beginMarker = markerMatch
  ? markerMatch[0]
  : "PARALLEL_SLICES_REVIEW_JSON_BEGIN";
const endMarker = beginMarker.replace("BEGIN", "END");
const response = {
  verdict: "approve",
  summary: provider + " approved the bounded implementation.",
  findings: [],
};

if (args[0] === "--version") {
  console.log(provider + " test-version");
  process.exit(0);
}

if (provider === "codex" && args[0] === "login") {
  if (existsSync(join(process.env.XDG_CACHE_HOME, "codex-auth-fail"))) {
    console.error("not signed in");
    process.exit(1);
  }
  console.log("Logged in using ChatGPT");
  process.exit(0);
}
if (provider === "claude" && args[0] === "auth") {
  console.log(JSON.stringify({ loggedIn: true, authMethod: "claude.ai" }));
  process.exit(0);
}
if (provider === "agy" && args[0] === "models") {
  console.log("antigravity test model");
  process.exit(0);
}
if (provider === "cursor-agent" && args[0] === "status") {
  if (existsSync(join(process.env.XDG_CACHE_HOME, "cursor-auth-fail"))) {
    console.error("not authenticated");
    process.exit(1);
  }
  console.log("Authenticated via browser login");
  process.exit(0);
}
if (provider === "cursor-agent" && args[0] === "--list-models") {
  console.log("cursor-model-a - Cursor Model A");
  console.log("cursor-model-b - Cursor Model B");
  process.exit(0);
}

appendFileSync(
  join(process.env.XDG_CACHE_HOME, "provider-order.jsonl"),
  JSON.stringify({
    provider,
    args,
    leakedEnvironment: process.env.PARALLEL_SLICES_TEST_SECRET !== undefined,
    pid: process.pid,
    model:
      provider === "cursor-agent"
        ? args[args.indexOf("--model") + 1]
        : undefined,
    apiKeyInEnvironment: process.env.CURSOR_API_KEY !== undefined,
    hasReviewContract: args.some((value) =>
      value.includes("PARALLEL_SLICES_REVIEW_JSON_BEGIN"),
    ),
  }) + "\\n",
);
if (provider === "agy" && existsSync(join(process.env.XDG_CACHE_HOME, "agy-hang"))) {
  setInterval(() => {}, 1000);
} else if (provider === "codex") {
  const outputIndex = args.indexOf("--output-last-message");
  writeFileSync(args[outputIndex + 1], JSON.stringify(response));
} else if (provider === "claude") {
  console.log(JSON.stringify({ structured_output: response }));
} else if (provider === "agy") {
  console.log(beginMarker);
  console.log(JSON.stringify(response));
  console.log(endMarker);
} else if (provider === "cursor-agent") {
  if (existsSync(join(process.env.XDG_CACHE_HOME, "cursor-hang"))) {
    setInterval(() => {}, 1000);
  } else if (args.includes("missing-model")) {
    console.error("invalid model: missing-model");
    process.exit(1);
  } else {
    const model = args[args.indexOf("--model") + 1];
    const cursorResponse = {
      ...response,
      summary: model + " approved the bounded implementation.",
    };
    console.log(
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result:
          beginMarker +
          "\\n" +
          JSON.stringify(cursorResponse) +
          "\\n" +
          endMarker,
        session_id: "session-" + process.pid,
      }),
    );
  }
} else {
  process.exit(2);
}
`;
  for (const name of ["codex", "claude", "agy", "cursor-agent"]) {
    write(parent, `bin/${name}`, script);
    chmodSync(join(bin, name), 0o755);
  }
  return bin;
}

function reviewEnvironment(bin, cacheDirectory) {
  const env = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH}`,
    XDG_CACHE_HOME: cacheDirectory,
    PARALLEL_SLICES_TEST_SECRET: "must-not-reach-reviewers",
  };
  for (const name of [
    "CODEX_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_GENAI_USE_VERTEXAI",
    "CURSOR_API_KEY",
  ]) {
    delete env[name];
  }
  return env;
}

function invokeReview(root, env) {
  try {
    return execFileSync(
      process.execPath,
      [
        "scripts/parallel-slices/review.mjs",
        "run",
        "--scope-file",
        "docs/plans/scopes/review-engine/1.1.scope",
        "--non-interactive",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    error.message += `\nstdout:\n${error.stdout || ""}\nstderr:\n${error.stderr || ""}`;
    throw error;
  }
}

function commit(root, subject) {
  run("git", ["add", "."], root);
  run(
    "git",
    [
      "-c",
      "user.name=Planning Review Integration",
      "-c",
      "user.email=planning-review@example.test",
      "commit",
      "-m",
      subject,
    ],
    root,
  );
}

function createPlanningReviewTarget(reviewers, options = {}) {
  const reviewEnabled = options.reviewEnabled ?? true;
  const root = mkdtempSync(
    join(tmpdir(), "parallel-slices-planning-review-target-"),
  );
  run("git", ["init", "-b", "feature/planning-review"], root);
  writeScaffold(root, { qualityScripts: true });
  run(
    "bash",
    [join(parallelSlicesRoot, "scripts/setup.sh"), "--agent", "codex", root],
    parallelSlicesRoot,
  );
  writeInitializedContract(root);
  run(
    "node",
    ["scripts/parallel-slices/project-state.mjs", "advance", "contract-ready"],
    root,
  );
  write(
    root,
    ".parallel-slices/review.json",
    `${JSON.stringify(
      reviewConfiguration(reviewers, { enabled: reviewEnabled }),
      null,
      2,
    )}\n`,
  );
  write(
    root,
    "packages/shared/src/result.mjs",
    "export const result = { entityId: null };\n",
  );
  write(
    root,
    "app/consumer.mjs",
    "export const rendersMissingEntity = true;\n",
  );
  commit(root, "chore: establish planning-review fixture");

  const plan = "docs/plans/2026-07-20-planning-review.md";
  const state = "docs/plans/loop-runs/planning-review-state.json";
  const scope = "docs/plans/scopes/planning-review/1.1.scope";
  const planningScope = "docs/plans/scopes/planning-review/_planning.scope";
  write(
    root,
    plan,
    `# Planning-review Product Plan

Status: APPROVED

## Requirements

| ID | Requirement |
| --- | --- |
| R1 | Represent a successful result without an entity identifier in the shared contract and its test. |

## Existing behavior to preserve

- Results that contain an entity identifier remain supported.

## Non-goals

- No deployment, migration, or external-system action.
`,
  );
  run("git", ["add", plan], root);
  run(
    "node",
    ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
    root,
  );
  commit(root, "docs(plan): approve planning-review fixture");
  const planCommit = run("git", ["rev-parse", "HEAD"], root).trim();
  const compilation = {
    ...readSliceCompilationSnapshot(root),
    sizingRationale: [
      "Kept the shared contract outcome in one independently reviewable slice.",
    ],
    parallelism: {
      dependencyRationale: [],
      serialOnlyJustification: null,
    },
  };
  if (reviewEnabled) {
    compilation.planningReview = {
      scope: planningScope,
      artifact: "docs/plans/reviews/planning-review/planning.json",
    };
  }
  write(
    root,
    scope,
    `version=2
plan=${plan}
state=${state}
slice=1.1
requirements=R1
depends_on=none
observable=The shared result represents success without an entity identifier.
minimum_stage=contract-ready
release_notes=none
gate=core
parallel=allowed
review=docs/plans/reviews/planning-review/1.1.json
commit=fix(contract): support results without an entity
coverage=entrypoint|change|app/placeholder.mjs|The placeholder owns the synthetic entry-point outcome.
coverage=contract|not-applicable|none|The initial compiler failed to identify the shared contract impact.
coverage=consumer|preserve|app/consumer.mjs|The existing consumer remains compatible.
coverage=data-side-effect|not-applicable|none|The contract change performs no durable write.
coverage=test|not-applicable|none|The initial compiler failed to identify the contract test.
coverage=operations|not-applicable|none|The contract change has no operational action.
allow=app/placeholder.mjs
coordinate=${state}
coordinate=docs/plans/reviews/planning-review/1.1.json
coordinate=docs/plans/reviews/planning-review/1.1.md
`,
  );
  if (reviewEnabled) {
    write(
      root,
      planningScope,
      `version=1
plan=${plan}
state=${state}
slice=planning
requirements=R1
observable=Independent reviewers approve the complete execution map before any worker starts.
minimum_stage=contract-ready
release_notes=none
gate=core
review=docs/plans/reviews/planning-review/planning.json
allow=.parallel-slices/review.json
allow=${plan}
allow=${state}
allow=docs/plans/scopes/planning-review/**
allow=docs/plans/reviews/planning-review/planning.json
allow=docs/plans/reviews/planning-review/planning.md
allow=docs/plans/corrections/planning-review/**
`,
    );
  }
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
        milestone: "Represent the approved shared result",
        goalBranch: "feature/planning-review",
        controller: "cursor",
        runId: "00000000-0000-4000-8000-000000000030",
        status: "not_started",
        slices: {
          1.1: {
            manifest: scope,
            status: "not_started",
            candidateCommit: null,
            gateEvidence: [],
            reviewEvidence: [],
            reviewArtifact: "docs/plans/reviews/planning-review/1.1.json",
          },
        },
        findings: [],
        finalAudit: null,
      },
      null,
      2,
    )}\n`,
  );
  run(
    "git",
    ["add", scope, ...(reviewEnabled ? [planningScope] : []), state],
    root,
  );
  run(
    "node",
    ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
    root,
  );
  commit(root, "chore(plan): compile planning-review execution map");
  return {
    root,
    plan,
    planCommit,
    planningScope: reviewEnabled ? planningScope : null,
    scope,
    state,
  };
}

function invokePlanningReview(root, state, env) {
  try {
    return execFileSync(
      process.execPath,
      [
        "scripts/parallel-slices/review.mjs",
        "planning",
        "--state",
        state,
        "--non-interactive",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    error.message += `\nstdout:\n${error.stdout || ""}\nstderr:\n${error.stderr || ""}`;
    throw error;
  }
}

test("a compiled run succeeds without planning review when review is disabled", () => {
  const target = createPlanningReviewTarget([], { reviewEnabled: false });
  try {
    const state = JSON.parse(
      readFileSync(join(target.root, target.state), "utf8"),
    );
    const review = JSON.parse(
      readFileSync(join(target.root, ".parallel-slices/review.json"), "utf8"),
    );
    assert.equal(review.enabled, false);
    assert.equal(Object.hasOwn(state.compilation, "planningReview"), false);
    assert.equal(
      existsSync(
        join(target.root, "docs/plans/scopes/planning-review/_planning.scope"),
      ),
      false,
    );
    acquireRunLock(target.root, "cursor", target.state);
    const worker = createSliceWorktree(target.root, {
      controller: "cursor",
      state: target.state,
      scopeFile: target.scope,
    });
    assert.equal(existsSync(worker.worktree), true);
  } finally {
    rmSync(target.root, { recursive: true, force: true });
  }
});

test("installed review runs Codex, Claude Code, and Antigravity in configured order", () => {
  const parent = mkdtempSync(join(tmpdir(), "parallel-slices-review-success-"));
  const log = join(parent, "provider-order.jsonl");
  const bin = installFakeProviders(parent);
  const root = createReviewTarget([
    { id: "codex-review", provider: "codex", effort: "high" },
    { id: "claude-review", provider: "claude-code", effort: "high" },
    { id: "antigravity-review", provider: "antigravity" },
  ]);
  try {
    const output = invokeReview(root, reviewEnvironment(bin, parent));
    assert.match(output, /PARALLEL SLICES REVIEW APPROVED/);
    const invocations = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      invocations.map((item) => item.provider),
      ["codex", "claude", "agy"],
    );
    assert.equal(
      invocations.some((item) => item.leakedEnvironment),
      false,
    );
    assert.deepEqual(invocations[0].args.slice(0, 4), [
      "exec",
      "--sandbox",
      "read-only",
      "--ephemeral",
    ]);
    assert.ok(invocations[1].args.includes("--safe-mode"));
    assert.ok(invocations[1].args.includes("dontAsk"));
    assert.ok(invocations[2].args.includes("--sandbox"));

    const artifact = JSON.parse(
      readFileSync(
        join(root, "docs/plans/reviews/review-engine/1.1.json"),
        "utf8",
      ),
    );
    assert.equal(artifact.attempts.length, 1);
    assert.equal(artifact.attempts[0].status, "approved");
    assert.deepEqual(
      artifact.attempts[0].rounds[0].turns.map((turn) => turn.reviewerId),
      ["codex-review", "claude-review", "antigravity-review"],
    );
    assert.equal(
      Object.values(artifact.attempts[0].providers).some((provider) =>
        Object.hasOwn(provider, "identity"),
      ),
      false,
    );
    assert.match(
      readFileSync(
        join(root, "docs/plans/reviews/review-engine/1.1.md"),
        "utf8",
      ),
      /Configured reviewers: codex-review, claude-review, antigravity-review/,
    );
    assert.equal(
      existsSync(join(root, "docs/plans/reviews/review-engine/1.1.json.lock")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(parent, { recursive: true, force: true });
  }
});

test("installed review runs two fresh Cursor subscription agents with different models", () => {
  const parent = mkdtempSync(join(tmpdir(), "parallel-slices-cursor-review-"));
  const bin = installFakeProviders(parent);
  const root = createReviewTarget([
    {
      id: "cursor-review-a",
      provider: "cursor",
      model: "cursor-model-a",
    },
    {
      id: "cursor-review-b",
      provider: "cursor",
      model: "cursor-model-b",
    },
  ]);
  try {
    const environment = reviewEnvironment(bin, parent);
    const output = invokeReview(root, environment);
    assert.match(output, /PARALLEL SLICES REVIEW APPROVED/);

    const prompts = readFileSync(join(parent, "provider-order.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter((event) => event.provider === "cursor-agent");
    assert.deepEqual(
      prompts.map((event) => event.model),
      ["cursor-model-a", "cursor-model-b"],
    );
    assert.equal(new Set(prompts.map((event) => event.pid)).size, 2);
    assert.ok(
      prompts.every(
        (event) =>
          !event.apiKeyInEnvironment &&
          event.hasReviewContract &&
          !event.leakedEnvironment &&
          event.args.includes("--print") &&
          event.args.includes("--output-format") &&
          !event.args.includes("--resume"),
      ),
    );

    const artifact = JSON.parse(
      readFileSync(
        join(root, "docs/plans/reviews/review-engine/1.1.json"),
        "utf8",
      ),
    );
    assert.equal(
      artifact.attempts[0].providers.cursor.authKind,
      "cached-browser-login",
    );
    assert.equal(
      artifact.attempts[0].providers.cursor.billingMode,
      "subscription",
    );
    assert.deepEqual(
      artifact.attempts[0].rounds[0].turns.map((turn) => turn.reviewerId),
      ["cursor-review-a", "cursor-review-b"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(parent, { recursive: true, force: true });
  }
});

test("Cursor preflight validates models and billing policy", () => {
  const parent = mkdtempSync(
    join(tmpdir(), "parallel-slices-cursor-preflight-"),
  );
  const bin = installFakeProviders(parent);
  const reviewers = [
    { id: "cursor-review", provider: "cursor", model: "cursor-model-a" },
  ];
  const unavailableModelRoot = createReviewTarget([
    { id: "cursor-review", provider: "cursor", model: "missing-model" },
  ]);
  const billingMismatchRoot = createReviewTarget(reviewers);
  const providerManagedRoot = createReviewTarget(reviewers, {
    billingPolicy: "provider-managed",
  });
  try {
    const subscriptionEnvironment = reviewEnvironment(bin, parent);
    assert.throws(
      () => invokeReview(unavailableModelRoot, subscriptionEnvironment),
      (error) => {
        assert.equal(error.status, 24);
        assert.match(
          error.stdout,
          /PARALLEL SLICES REVIEW MODEL_NOT_AVAILABLE/,
        );
        return true;
      },
    );

    const apiEnvironment = reviewEnvironment(bin, parent);
    apiEnvironment.CURSOR_API_KEY = "cursor-test-key";
    assert.throws(
      () => invokeReview(billingMismatchRoot, apiEnvironment),
      (error) => {
        assert.equal(error.status, 20);
        assert.match(error.stdout, /PARALLEL SLICES REVIEW BILLING_MISMATCH/);
        return true;
      },
    );
    assert.equal(
      existsSync(
        join(billingMismatchRoot, "docs/plans/reviews/review-engine/1.1.json"),
      ),
      false,
    );

    assert.match(
      invokeReview(providerManagedRoot, apiEnvironment),
      /PARALLEL SLICES REVIEW APPROVED/,
    );
    const artifact = JSON.parse(
      readFileSync(
        join(providerManagedRoot, "docs/plans/reviews/review-engine/1.1.json"),
        "utf8",
      ),
    );
    assert.equal(artifact.attempts[0].providers.cursor.authKind, "api-key");
    assert.equal(artifact.attempts[0].providers.cursor.billingMode, "api");
    const providerManagedTurn = readFileSync(
      join(parent, "provider-order.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .at(-1);
    assert.equal(providerManagedTurn.provider, "cursor-agent");
    assert.equal(providerManagedTurn.apiKeyInEnvironment, true);
  } finally {
    rmSync(unavailableModelRoot, { recursive: true, force: true });
    rmSync(billingMismatchRoot, { recursive: true, force: true });
    rmSync(providerManagedRoot, { recursive: true, force: true });
    rmSync(parent, { recursive: true, force: true });
  }
});

test("Cursor authentication and review-turn timeouts fail safely", () => {
  const parent = mkdtempSync(
    join(tmpdir(), "parallel-slices-cursor-failures-"),
  );
  const bin = installFakeProviders(parent);
  const reviewers = [
    { id: "cursor-review", provider: "cursor", model: "cursor-model-a" },
  ];
  const authRoot = createReviewTarget(reviewers);
  const timeoutRoot = createReviewTarget(reviewers, {
    turnTimeoutSeconds: 1,
    overallTimeoutSeconds: 3,
  });
  try {
    const environment = reviewEnvironment(bin, parent);
    write(parent, "cursor-auth-fail", "1\n");
    assert.throws(
      () => invokeReview(authRoot, environment),
      (error) => {
        assert.equal(error.status, 20);
        assert.match(error.stdout, /PARALLEL SLICES REVIEW AUTH_REQUIRED/);
        return true;
      },
    );

    rmSync(join(parent, "cursor-auth-fail"));
    write(parent, "cursor-hang", "1\n");
    assert.throws(
      () => invokeReview(timeoutRoot, environment),
      (error) => {
        assert.equal(error.status, 23);
        assert.match(error.stdout, /PARALLEL SLICES REVIEW PROVIDER_TIMEOUT/);
        return true;
      },
    );
    const artifact = JSON.parse(
      readFileSync(
        join(timeoutRoot, "docs/plans/reviews/review-engine/1.1.json"),
        "utf8",
      ),
    );
    assert.equal(artifact.attempts[0].status, "provider_timeout");
  } finally {
    rmSync(authRoot, { recursive: true, force: true });
    rmSync(timeoutRoot, { recursive: true, force: true });
    rmSync(parent, { recursive: true, force: true });
  }
});

test("planning review is controller-neutral and must be renewed after an audited scope correction", () => {
  const parent = mkdtempSync(
    join(tmpdir(), "parallel-slices-planning-review-"),
  );
  const bin = installFakeProviders(parent);
  const target = createPlanningReviewTarget([
    { id: "codex-review", provider: "codex", effort: "high" },
    { id: "claude-review", provider: "claude-code", effort: "high" },
    { id: "antigravity-review", provider: "antigravity" },
  ]);
  const artifact = "docs/plans/reviews/planning-review/planning.json";
  const artifactMarkdown = artifact.replace(/\.json$/, ".md");
  try {
    const environment = reviewEnvironment(bin, parent);
    assert.match(
      invokePlanningReview(target.root, target.state, environment),
      /PARALLEL SLICES PLANNING REVIEW APPROVED/,
    );
    const firstEvidence = validatePlanningReviewEvidence(
      target.root,
      target.state,
    );
    assert.equal(firstEvidence.target.state.controller, "cursor");
    assert.equal(firstEvidence.attempt.reviewKind, "planning");
    assert.deepEqual(
      firstEvidence.attempt.changedPaths.sort(),
      [
        ".parallel-slices/review.json",
        target.planningScope,
        target.scope,
        target.state,
      ].sort(),
    );
    run("git", ["add", artifact, artifactMarkdown], target.root);
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
        target.root,
      ),
      /Independent planning-review commit boundary passed/,
    );
    commit(target.root, "chore(plan): record independent planning review");

    const replacement =
      "docs/plans/scopes/planning-review/1.1-revision-2.scope";
    const correction =
      "docs/plans/corrections/planning-review/1.1-revision-2.json";
    write(
      target.root,
      replacement,
      `version=2
revision=2
supersedes=${target.scope}
correction=${correction}
plan=${target.plan}
state=${target.state}
slice=1.1
requirements=R1
depends_on=none
observable=The shared result represents success without an entity identifier.
minimum_stage=contract-ready
release_notes=none
gate=core
parallel=allowed
review=docs/plans/reviews/planning-review/1.1-revision-2.json
commit=fix(contract): support results without an entity
coverage=entrypoint|change|app/placeholder.mjs|The placeholder owns the synthetic entry-point outcome.
coverage=contract|change|packages/shared/src/result.mjs|Repository inspection found the shared result contract required by the approved outcome.
coverage=consumer|preserve|app/consumer.mjs|The existing consumer remains compatible.
coverage=data-side-effect|not-applicable|none|The contract change performs no durable write.
coverage=test|change|packages/shared/src/result.test.mjs|The shared contract test proves the missing-identifier outcome.
coverage=operations|not-applicable|none|The contract change has no operational action.
allow=app/placeholder.mjs
allow=packages/shared/src/result.mjs
allow=packages/shared/src/result.test.mjs
coordinate=${target.state}
coordinate=docs/plans/reviews/planning-review/1.1-revision-2.json
coordinate=docs/plans/reviews/planning-review/1.1-revision-2.md
`,
    );
    write(
      target.root,
      correction,
      `${JSON.stringify(
        {
          $schema: "../../../../.parallel-slices/scope-correction.schema.json",
          version: 1,
          plan: target.plan,
          planCommit: target.planCommit,
          slice: "1.1",
          previousManifest: target.scope,
          replacementManifest: replacement,
          reason:
            "Repository inspection found that the approved no-entity result cannot be represented without the shared contract and its test.",
          discoveryEvidence: [
            "packages/shared/src/result.mjs requires an entity identifier in the current shared result.",
            "The Product Plan R1 explicitly requires the shared contract and its test.",
          ],
          addedAllow: [
            "packages/shared/src/result.mjs",
            "packages/shared/src/result.test.mjs",
          ],
          attestations: {
            requirementsUnchanged: true,
            observableUnchanged: true,
            subsystemsUnchanged: true,
            nonGoalsPreserved: true,
            securityAndPrivacyPolicyUnchanged: true,
            migrationUnchanged: true,
            deploymentAndExternalActionsUnchanged: true,
          },
        },
        null,
        2,
      )}\n`,
    );
    const stateValue = JSON.parse(
      readFileSync(join(target.root, target.state), "utf8"),
    );
    stateValue.slices["1.1"].manifest = replacement;
    stateValue.slices["1.1"].reviewArtifact =
      "docs/plans/reviews/planning-review/1.1-revision-2.json";
    write(
      target.root,
      target.state,
      `${JSON.stringify(stateValue, null, 2)}\n`,
    );
    run("git", ["add", replacement, correction, target.state], target.root);
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
        target.root,
      ),
      /Audited execution-map correction commit boundary passed/,
    );
    commit(target.root, "chore(plan): correct incomplete execution scope");
    assert.throws(
      () => validatePlanningReviewEvidence(target.root, target.state),
      /approval is stale/,
    );

    assert.match(
      invokePlanningReview(target.root, target.state, environment),
      /PARALLEL SLICES PLANNING REVIEW APPROVED/,
    );
    const renewed = validatePlanningReviewEvidence(target.root, target.state);
    assert.equal(renewed.ledger.attempts.length, 2);
    assert.equal(
      renewed.attempt.contractFingerprint,
      renewed.target.contractFingerprint,
    );
    assert.ok(renewed.attempt.changedPaths.includes(replacement));
    assert.ok(renewed.attempt.changedPaths.includes(correction));
    run("git", ["add", artifact, artifactMarkdown], target.root);
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
        target.root,
      ),
      /Independent planning-review commit boundary passed/,
    );
    commit(target.root, "chore(plan): renew independent planning review");

    const invocations = readFileSync(
      join(parent, "provider-order.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      invocations.map((item) => item.provider),
      ["codex", "claude", "agy", "codex", "claude", "agy"],
    );
  } finally {
    rmSync(target.root, { recursive: true, force: true });
    rmSync(parent, { recursive: true, force: true });
  }
});

test("non-interactive authentication failure exits without starting a review", () => {
  const parent = mkdtempSync(join(tmpdir(), "parallel-slices-review-auth-"));
  const log = join(parent, "provider-order.jsonl");
  const bin = installFakeProviders(parent);
  const root = createReviewTarget([{ id: "codex-review", provider: "codex" }]);
  try {
    write(parent, "codex-auth-fail", "1\n");
    assert.throws(
      () => invokeReview(root, reviewEnvironment(bin, parent)),
      (error) => {
        assert.equal(error.status, 20);
        assert.match(error.stdout, /PARALLEL SLICES REVIEW AUTH_REQUIRED/);
        return true;
      },
    );
    assert.equal(existsSync(log), false);
    assert.equal(
      existsSync(join(root, "docs/plans/reviews/review-engine/1.1.json")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(parent, { recursive: true, force: true });
  }
});

test("a potential secret in review input stops the run before any reviewer turn", () => {
  const parent = mkdtempSync(join(tmpdir(), "parallel-slices-review-secret-"));
  const log = join(parent, "provider-order.jsonl");
  const bin = installFakeProviders(parent);
  const root = createReviewTarget([{ id: "codex-review", provider: "codex" }]);
  try {
    write(
      root,
      "app/example.mjs",
      `export const token = "${["gh", "p_", "a1B2".repeat(9)].join("")}";\n`,
    );
    assert.throws(
      () => invokeReview(root, reviewEnvironment(bin, parent)),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(
          error.message,
          /review input was not sent to any reviewer: possible secret detected in review input: app\/example\.mjs/,
        );
        return true;
      },
    );
    assert.equal(existsSync(log), false);
    assert.equal(
      existsSync(join(root, "docs/plans/reviews/review-engine/1.1.json")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(parent, { recursive: true, force: true });
  }
});

test("a hanging provider is terminated and recorded as an operational failure", () => {
  const parent = mkdtempSync(join(tmpdir(), "parallel-slices-review-timeout-"));
  const bin = installFakeProviders(parent);
  const root = createReviewTarget(
    [{ id: "antigravity-review", provider: "antigravity" }],
    { turnTimeoutSeconds: 1, overallTimeoutSeconds: 3 },
  );
  try {
    const started = Date.now();
    write(parent, "agy-hang", "1\n");
    assert.throws(
      () => invokeReview(root, reviewEnvironment(bin, parent)),
      (error) => {
        assert.equal(error.status, 23);
        assert.match(error.stdout, /PARALLEL SLICES REVIEW PROVIDER_TIMEOUT/);
        return true;
      },
    );
    assert.ok(Date.now() - started < 5000);
    const artifact = JSON.parse(
      readFileSync(
        join(root, "docs/plans/reviews/review-engine/1.1.json"),
        "utf8",
      ),
    );
    assert.equal(artifact.attempts[0].status, "provider_timeout");
    assert.match(artifact.attempts[0].outcome, /timed out/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(parent, { recursive: true, force: true });
  }
});
