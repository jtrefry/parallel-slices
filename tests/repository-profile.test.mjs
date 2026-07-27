import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  readRepositoryProfile,
  validateRepositoryProfile,
} from "../repo-overlay/scripts/parallel-slices/repository-profile.mjs";
import { parallelSlicesRoot } from "./helpers/fixture.mjs";

test("accepts local-only and fully specified GitHub publication profiles", () => {
  const local = readRepositoryProfile(join(parallelSlicesRoot, "repo-overlay"));
  assert.equal(local.mode, "local-only");

  const github = validateRepositoryProfile({
    $schema: "./repository.schema.json",
    version: 1,
    mode: "github",
    remote: "origin",
    baseBranch: "main",
    repository: "example/example-app",
    account: "example-developer",
    visibility: "private",
    createIfMissing: true,
  });
  assert.equal(github.repository, "example/example-app");
});

test("rejects ambiguous or malformed GitHub publication profiles", () => {
  assert.throws(
    () =>
      validateRepositoryProfile({
        $schema: "./repository.schema.json",
        version: 1,
        mode: "github",
        remote: "origin",
        baseBranch: "main",
        repository: "not-a-repository",
        account: "example-developer",
        visibility: "private",
        createIfMissing: true,
      }),
    /OWNER\/NAME/,
  );
  assert.throws(
    () =>
      validateRepositoryProfile({
        $schema: "./repository.schema.json",
        version: 1,
        mode: "local-only",
        remote: "origin",
        baseBranch: "main",
        repository: "example/example-app",
        account: "example-developer",
      }),
    /local-only repository profile forbids repository/,
  );
});

test("refuses a symlinked repository publication profile", () => {
  const root = mkdtempSync(
    join(tmpdir(), "parallel-slices-repository-profile-"),
  );
  try {
    mkdirSync(join(root, ".parallel-slices"));
    const outside = join(root, "outside.json");
    writeFileSync(outside, "{}\n");
    symlinkSync(outside, join(root, ".parallel-slices/repository.json"));
    assert.throws(
      () => readRepositoryProfile(root),
      /refusing symlinked repository profile/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
