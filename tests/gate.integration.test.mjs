import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  parallelSlicesRoot,
  run,
  write,
  writeInitializedContract,
  writeScaffold,
} from "./helpers/fixture.mjs";

test("installs and enforces a full Turborepo slice", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-turbo-"));
  try {
    run("git", ["init", "-b", "feature/test-loop"], root);
    writeScaffold(root, { qualityScripts: true });

    run(
      "bash",
      [join(parallelSlicesRoot, "scripts/setup.sh"), root],
      parallelSlicesRoot,
    );
    const secondSetup = run(
      "bash",
      [join(parallelSlicesRoot, "scripts/setup.sh"), root],
      parallelSlicesRoot,
    ).toString();
    assert.match(secondSetup, /current: \.parallel-slices\/config\.json/);
    const verifyOutput = run(
      "bash",
      [join(parallelSlicesRoot, "scripts/verify.sh"), root],
      parallelSlicesRoot,
    ).toString();
    assert.match(verifyOutput, /Parallel Slices prerequisites verified/);
    assert.equal(existsSync(join(root, "docs/AGENTS.md")), true);
    assert.equal(existsSync(join(root, "docs/testing/manual/AGENTS.md")), true);
    assert.equal(
      existsSync(
        join(root, "docs/testing/manual/_MANUAL-TEST-SCRIPT-TEMPLATE.md"),
      ),
      true,
    );
    assert.equal(
      existsSync(join(root, ".parallel-slices/config.schema.json")),
      true,
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
    assert.throws(
      () =>
        run(
          "bash",
          [join(parallelSlicesRoot, "scripts/install.sh"), root],
          parallelSlicesRoot,
        ),
      /refusing to overwrite existing file: .*\.github\/dependabot\.yml/,
    );
    assert.equal(
      JSON.parse(
        readFileSync(join(root, ".parallel-slices/project-state.json"), "utf8"),
      ).stage,
      "foundation-ready",
    );
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "validate"],
        root,
      ).toString(),
      /quality configuration valid/,
    );
    const explained = JSON.parse(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "explain", "prePush", "--json"],
        root,
      ).toString(),
    );
    assert.equal(explained.pipeline, "full");
    assert.equal(explained.steps.at(-1).id, "trivy");
    assert.equal(
      explained.steps.every((step) => step.status === "ready"),
      true,
    );

    const preCommitOutput = run(
      "node",
      ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
      root,
    ).toString();
    assert.match(preCommitOutput, /preCommit entry point passed/);
    assert.match(
      preCommitOutput,
      /pipeline core: format -> lint -> types -> sql-security -> build -> unit/,
    );
    assert.match(preCommitOutput, /production build/);
    assert.match(preCommitOutput, /SQL security scan/);

    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/quality.mjs", "check-branch", "main"],
          root,
          { quiet: true },
        ),
      /Command failed/,
    );
    run("git", ["add", "."], root);
    run(
      "git",
      [
        "-c",
        "user.name=Loop Test",
        "-c",
        "user.email=loop@example.test",
        "commit",
        "-m",
        "install Parallel Slices",
      ],
      root,
    );
    const installCommit = run("git", ["rev-parse", "HEAD"], root).trim();
    const prePushOutput = run(
      "node",
      [
        "scripts/parallel-slices/quality.mjs",
        "entrypoint",
        "prePush",
        "--base",
        "HEAD",
      ],
      root,
    ).toString();
    assert.match(prePushOutput, /prePush entry point passed/);
    assert.match(prePushOutput, /end-to-end tests/);
    assert.match(prePushOutput, /Trivy repository scan/);

    write(
      root,
      "staged-secret.txt",
      ["-----BEGIN ", "PRIVATE KEY-----\nsynthetic\n"].join(""),
    );
    run("git", ["add", "staged-secret.txt"], root);
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
          root,
          { quiet: true },
        ),
      /Command failed/,
    );
    rmSync(join(root, "staged-secret.txt"));
    run("git", ["add", "-u"], root);

    write(
      root,
      "docs/plans/example.md",
      "# Example plan\n\nStatus: APPROVED\n",
    );
    write(
      root,
      "docs/plans/loop-runs/example-state.md",
      "# Example state\n\nStatus: in_progress\n",
    );
    write(
      root,
      "docs/plans/scopes/example/1.1.scope",
      `
version=1
plan=docs/plans/example.md
slice=1.1
requirements=R1
observable=The example page renders.
minimum_stage=foundation-ready
release_notes=developer
gate=full
allow=app/page.tsx
allow=docs/releases/developer/unreleased/2026-07-15-example-1-1.md
allow=docs/plans/example.md
allow=docs/plans/loop-runs/example-state.md
allow=docs/plans/scopes/example/1.1.scope
`.trimStart(),
    );
    run("git", ["add", "docs/plans"], root);
    run(
      "git",
      [
        "-c",
        "user.name=Loop Test",
        "-c",
        "user.email=loop@example.test",
        "commit",
        "-m",
        "approve slice",
      ],
      root,
    );

    write(
      root,
      "app/page.tsx",
      "export default function Page() { return <main>Example</main>; }\n",
    );
    write(
      root,
      "docs/plans/loop-runs/example-state.md",
      "# Example state\n\nStatus: in_progress\nGate: pending\n",
    );
    write(
      root,
      "docs/releases/developer/unreleased/2026-07-15-example-1-1.md",
      `
# Example page
Type: Added
Area: Frontend

## Summary

Added the planned example page.

## Technical impact

The web workspace exposes one new route.

## Validation

Lint, formatting, types, tests, and the production build passed.

## Rollout and monitoring

Use the normal web release and monitor route errors.
`.trimStart(),
    );

    const gateOutput = run(
      "node",
      [
        "scripts/parallel-slices/gate.mjs",
        "--scope-file",
        "docs/plans/scopes/example/1.1.scope",
      ],
      root,
    ).toString();
    assert.match(gateOutput, /GATE GREEN: slice 1\.1/);

    run("git", ["add", "."], root);
    run(
      "git",
      [
        "-c",
        "user.name=Loop Test",
        "-c",
        "user.email=loop@example.test",
        "commit",
        "-m",
        "implement approved slice",
      ],
      root,
    );
    const branchGateOutput = run(
      "node",
      [
        "scripts/parallel-slices/quality.mjs",
        "entrypoint",
        "prePush",
        "--base",
        installCommit,
      ],
      root,
    ).toString();
    assert.match(branchGateOutput, /branch policy passed: 5 paths covered/);

    write(root, "README.md", "# Out of scope\n");
    assert.throws(
      () =>
        run(
          "node",
          [
            "scripts/parallel-slices/gate.mjs",
            "--scope-file",
            "docs/plans/scopes/example/1.1.scope",
            "--scope-check-only",
          ],
          root,
          { quiet: true },
        ),
      /Command failed/,
    );
    run("git", ["add", "README.md"], root);
    run(
      "git",
      [
        "-c",
        "user.name=Loop Test",
        "-c",
        "user.email=loop@example.test",
        "commit",
        "-m",
        "add unapproved branch change",
      ],
      root,
    );
    assert.throws(
      () =>
        run(
          "node",
          [
            "scripts/parallel-slices/quality.mjs",
            "entrypoint",
            "prePush",
            "--base",
            installCommit,
          ],
          root,
          { quiet: true },
        ),
      /Command failed/,
    );

    const stagedPlan = "docs/plans/2026-07-16-staged-boundary.md";
    write(root, stagedPlan, "# Staged boundary plan\n\nStatus: DRAFT\n");
    run("git", ["add", stagedPlan], root);
    write(root, stagedPlan, "# Staged boundary plan\n\nStatus: APPROVED\n");
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
          root,
          { quiet: true },
        ),
      /staged planning contract does not match the working tree/,
    );
    run("git", ["add", stagedPlan], root);
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
        root,
      ).toString(),
      /Product Plan approval commit boundary passed/,
    );
    run(
      "git",
      [
        "-c",
        "user.name=Loop Test",
        "-c",
        "user.email=loop@example.test",
        "commit",
        "-m",
        "approve staged boundary plan",
      ],
      root,
    );

    const workerWorktree = join(
      root,
      ".parallel-slices/runtime/worktrees/run-1-1.1-abcdef12",
    );
    run("git", ["worktree", "add", "--detach", workerWorktree, "HEAD"], root);
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
        workerWorktree,
      ).toString(),
      /preCommit entry point passed/,
    );
    const strayParent = mkdtempSync(join(tmpdir(), "parallel-slices-stray-"));
    try {
      const strayWorktree = join(strayParent, "detached");
      run("git", ["worktree", "add", "--detach", strayWorktree, "HEAD"], root);
      assert.throws(
        () =>
          run(
            "node",
            ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
            strayWorktree,
            { quiet: true },
          ),
        /detached HEAD is not allowed/,
      );
    } finally {
      rmSync(strayParent, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
