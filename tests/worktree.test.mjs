import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const worktree = join(
  repoRoot,
  "skills",
  "build-parallel",
  "files",
  "worktree.mjs",
);

function git(cwd, args) {
  return execFileSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args],
    { cwd, encoding: "utf8" },
  ).trim();
}

function runWorktree(cwd, args) {
  return spawnSync(process.execPath, [worktree, ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("create makes a detached worktree at the ref, remove cleans it up", () => {
  const parent = mkdtempSync(join(tmpdir(), "ps-worktree-"));
  const root = join(parent, "repo");
  try {
    execFileSync("git", ["init", "-q", root]);
    writeFileSync(join(root, "file.txt"), "base\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "base"]);
    const head = git(root, ["rev-parse", "HEAD"]);

    const created = runWorktree(root, [
      "create",
      "--at",
      "HEAD",
      "--name",
      "worker-a",
    ]);
    assert.equal(created.status, 0, created.stderr);
    const path = created.stdout.trim();
    assert.ok(existsSync(join(path, "file.txt")), "worktree checkout missing");
    // Detached at the requested commit, and isolated from the source repo.
    assert.equal(git(path, ["rev-parse", "HEAD"]), head);
    assert.equal(git(path, ["branch", "--show-current"]), "");
    // Lives outside the repository so it never dirties the repo's status.
    assert.ok(
      !path.startsWith(root + "/"),
      `worktree ${path} is inside the repo`,
    );
    assert.equal(git(root, ["status", "--porcelain"]), "");

    const duplicate = runWorktree(root, [
      "create",
      "--at",
      "HEAD",
      "--name",
      "worker-a",
    ]);
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /already exists/);

    const removed = runWorktree(root, ["remove", path]);
    assert.equal(removed.status, 0, removed.stderr);
    assert.ok(!existsSync(path));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("create requires --at and a resolvable ref", () => {
  const parent = mkdtempSync(join(tmpdir(), "ps-worktree-"));
  const root = join(parent, "repo");
  try {
    execFileSync("git", ["init", "-q", root]);
    writeFileSync(join(root, "file.txt"), "base\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "base"]);
    const missingAt = runWorktree(root, ["create"]);
    assert.notEqual(missingAt.status, 0);
    assert.match(missingAt.stderr, /--at/);
    const badRef = runWorktree(root, ["create", "--at", "no-such-ref"]);
    assert.notEqual(badRef.status, 0);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
