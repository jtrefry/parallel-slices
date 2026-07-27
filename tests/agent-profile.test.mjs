import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertAgentEnabled,
  assertSelectedAgent,
  configureAgent,
  readAgentProfile,
  skillDirectoryForAgent,
} from "../repo-overlay/scripts/parallel-slices/agent-profile.mjs";
import { switchAgent } from "../repo-overlay/scripts/parallel-slices/switch-agent.mjs";
import {
  loadArchitecturePackage,
  writeArchitectureSelection,
} from "../scripts/architecture-package.mjs";
import { parallelSlicesRoot, run, write } from "./helpers/fixture.mjs";

test("agent profiles enable every native controller and record one default", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-profile-"));
  try {
    assert.equal(configureAgent(root, "codex"), true);
    assert.equal(configureAgent(root, "codex"), false);
    assert.equal(readAgentProfile(root).defaultController, "codex");
    assert.deepEqual(readAgentProfile(root).enabledControllers, [
      "cursor",
      "codex",
      "claude-code",
    ]);
    assert.equal(assertSelectedAgent("codex", root), "codex");
    assert.equal(assertAgentEnabled("cursor", root), "cursor");
    assert.equal(assertAgentEnabled("claude-code", root), "claude-code");
    assert.equal(configureAgent(root, "claude-code"), true);
    assert.equal(readAgentProfile(root).defaultController, "claude-code");
    assert.equal(skillDirectoryForAgent("cursor"), ".cursor/skills");
    assert.equal(skillDirectoryForAgent("codex"), ".agents/skills");
    assert.equal(skillDirectoryForAgent("claude-code"), ".claude/skills");

    const unsafe = join(root, "unsafe");
    const outside = join(root, "outside");
    mkdirSync(unsafe);
    mkdirSync(outside);
    symlinkSync(outside, join(unsafe, ".parallel-slices"));
    assert.throws(
      () => configureAgent(unsafe, "cursor"),
      /symlinked agent profile directory/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("agent profiles migrate the legacy exclusive selection", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-profile-v1-"));
  try {
    write(
      root,
      ".parallel-slices/agent.json",
      '{"schema":1,"agent":"cursor"}\n',
    );
    const legacy = readAgentProfile(root);
    assert.equal(legacy.defaultController, "cursor");
    assert.deepEqual(legacy.enabledControllers, [
      "cursor",
      "codex",
      "claude-code",
    ]);
    assert.equal(configureAgent(root, "cursor"), true);
    assert.equal(readAgentProfile(root).version, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("default-controller changes require a clean branch and install skills first", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-switch-"));
  try {
    run("git", ["init", "-b", "chore/select-agent"], root);
    mkdirSync(join(root, ".parallel-slices"));
    cpSync(
      join(
        parallelSlicesRoot,
        "architectures/nextjs-gcp-postgres/repo-overlay/.parallel-slices/config.json",
      ),
      join(root, ".parallel-slices/config.json"),
      { recursive: true },
    );
    writeArchitectureSelection(
      root,
      loadArchitecturePackage("nextjs-gcp-postgres"),
    );
    configureAgent(root, "cursor");
    run("git", ["add", "."], root);
    run(
      "git",
      [
        "-c",
        "user.name=Agent Test",
        "-c",
        "user.email=agent@example.test",
        "commit",
        "-m",
        "configure cursor",
      ],
      root,
    );

    let installedAgent = null;
    assert.equal(
      switchAgent(root, "codex", {
        installCuratedSkills: ({ agent }) => {
          installedAgent = agent;
        },
      }),
      true,
    );
    assert.equal(installedAgent, "codex");
    assert.equal(readAgentProfile(root).defaultController, "codex");
    assert.deepEqual(readAgentProfile(root).enabledControllers, [
      "cursor",
      "codex",
      "claude-code",
    ]);

    run("git", ["add", ".parallel-slices/agent.json"], root);
    run(
      "git",
      [
        "-c",
        "user.name=Agent Test",
        "-c",
        "user.email=agent@example.test",
        "commit",
        "-m",
        "select codex",
      ],
      root,
    );
    assert.throws(
      () =>
        switchAgent(root, "claude-code", {
          installCuratedSkills: () => {
            throw new Error("synthetic skill install failure");
          },
        }),
      /synthetic skill install failure/,
    );
    assert.equal(readAgentProfile(root).defaultController, "codex");

    write(root, "dirty.txt", "uncommitted\n");
    assert.throws(
      () =>
        switchAgent(root, "claude-code", {
          installCuratedSkills: () => {},
        }),
      /clean working tree/,
    );
    assert.equal(readAgentProfile(root).defaultController, "codex");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
