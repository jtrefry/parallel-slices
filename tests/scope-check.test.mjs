import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { globToRegExp } from "../skills/build-parallel/files/scope-check.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scopeCheck = join(
  repoRoot,
  "skills",
  "build-parallel",
  "files",
  "scope-check.mjs",
);

function git(cwd, args) {
  return execFileSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args],
    { cwd, encoding: "utf8" },
  );
}

function temporaryRepository() {
  const root = mkdtempSync(join(tmpdir(), "ps-scope-"));
  git(root, ["init", "-q"]);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "owned.txt"), "base\n");
  writeFileSync(join(root, "README.md"), "base\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "base"]);
  return root;
}

function runScopeCheck(cwd, args) {
  return spawnSync(process.execPath, [scopeCheck, ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("glob semantics: ** crosses directories, * does not", () => {
  assert.ok(globToRegExp("src/**").test("src/a/b/c.ts"));
  assert.ok(globToRegExp("src/*.ts").test("src/a.ts"));
  assert.ok(!globToRegExp("src/*.ts").test("src/a/b.ts"));
  assert.ok(!globToRegExp("*.md").test("docs/a.md"));
  assert.ok(globToRegExp("a?c.txt").test("abc.txt"));
  assert.ok(!globToRegExp("a?c.txt").test("a/c.txt"));
});

test("passes when every change is inside the allowed set", () => {
  const root = temporaryRepository();
  try {
    writeFileSync(join(root, "src", "owned.txt"), "changed\n");
    writeFileSync(join(root, "src", "new.txt"), "added\n");
    const result = runScopeCheck(root, ["--base", "HEAD", "--allow", "src/**"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /scope check passed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails and names paths outside the allowed set, including untracked files", () => {
  const root = temporaryRepository();
  try {
    writeFileSync(join(root, "src", "owned.txt"), "changed\n");
    writeFileSync(join(root, "README.md"), "drifted\n");
    writeFileSync(join(root, "stray.txt"), "untracked\n");
    const result = runScopeCheck(root, ["--base", "HEAD", "--allow", "src/**"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /README\.md/);
    assert.match(result.stderr, /stray\.txt/);
    assert.ok(!result.stderr.includes("owned.txt"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("requires a base and at least one allow pattern", () => {
  const root = temporaryRepository();
  try {
    const missingAllow = runScopeCheck(root, ["--base", "HEAD"]);
    assert.equal(missingAllow.status, 2);
    const missingBase = runScopeCheck(root, ["--allow", "src/**"]);
    assert.equal(missingBase.status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
