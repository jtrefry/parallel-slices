import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parallelSlicesRoot } from "./helpers/fixture.mjs";

function runCheckTarget(scriptPath, target) {
  return spawnSync(process.execPath, [scriptPath, target], {
    encoding: "utf8",
  });
}

test("exits nonzero for an invalid target", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-check-target-"));
  try {
    const result = runCheckTarget(
      join(parallelSlicesRoot, "scripts/check-target.mjs"),
      join(root, "missing-project"),
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /error: package\.json is missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inspects the target when invoked through a symlinked repository path", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-check-symlink-"));
  try {
    const linkedRepository = join(root, "linked-repository");
    symlinkSync(parallelSlicesRoot, linkedRepository, "dir");
    const result = runCheckTarget(
      join(linkedRepository, "scripts/check-target.mjs"),
      join(root, "missing-project"),
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /error: package\.json is missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
