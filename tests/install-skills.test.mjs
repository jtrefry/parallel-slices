import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  updateAgentsIndex,
  parseFrontmatter,
} from "../scripts/install-skills.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installer = join(repoRoot, "scripts", "install-skills.mjs");
const SKILLS = ["build-parallel", "plan-milestone", "review-and-decide"];

function runInstaller(args) {
  return spawnSync(process.execPath, [installer, ...args], {
    encoding: "utf8",
  });
}

test("installs all three adapters into a target repository", () => {
  const target = mkdtempSync(join(tmpdir(), "ps-install-"));
  try {
    const result = runInstaller([target]);
    assert.equal(result.status, 0, result.stderr);
    for (const name of SKILLS) {
      const skill = join(target, ".claude", "skills", name, "SKILL.md");
      assert.ok(existsSync(skill), `missing ${skill}`);
      const frontmatter = parseFrontmatter(readFileSync(skill, "utf8"));
      assert.equal(frontmatter.name, name);
      assert.ok(frontmatter.description.length > 40);
      assert.ok(
        existsSync(join(target, ".cursor", "commands", `${name}.md`)),
        `missing cursor command for ${name}`,
      );
      assert.ok(
        existsSync(join(target, ".agents", "skills", `${name}.md`)),
        `missing codex pointer for ${name}`,
      );
    }
    // Bundled files travel with the skill.
    assert.ok(
      existsSync(
        join(
          target,
          ".claude",
          "skills",
          "build-parallel",
          "files",
          "scope-check.mjs",
        ),
      ),
    );
    const agents = readFileSync(join(target, "AGENTS.md"), "utf8");
    for (const name of SKILLS)
      assert.match(agents, new RegExp(`\\*\\*${name}\\*\\*`));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("re-running replaces the AGENTS.md block instead of appending", () => {
  const target = mkdtempSync(join(tmpdir(), "ps-install-"));
  try {
    writeFileSync(
      join(target, "AGENTS.md"),
      "# Existing instructions\n\nKeep me.\n",
    );
    assert.equal(runInstaller([target]).status, 0);
    assert.equal(runInstaller([target]).status, 0);
    const agents = readFileSync(join(target, "AGENTS.md"), "utf8");
    assert.match(agents, /Keep me\./);
    assert.equal(agents.split("parallel-slices skills: start").length, 2);
    assert.equal(agents.split("parallel-slices skills: end").length, 2);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("--tools cursor installs the canonical copy and the cursor adapter only", () => {
  const target = mkdtempSync(join(tmpdir(), "ps-install-"));
  try {
    const result = runInstaller([target, "--tools", "cursor"]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      existsSync(
        join(target, ".claude", "skills", "plan-milestone", "SKILL.md"),
      ),
    );
    assert.ok(
      existsSync(join(target, ".cursor", "commands", "plan-milestone.md")),
    );
    assert.ok(!existsSync(join(target, ".agents")));
    assert.ok(!existsSync(join(target, "AGENTS.md")));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("refuses an unknown tool and a missing target", () => {
  const unknown = runInstaller(["/tmp", "--tools", "emacs"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /unknown tool/);
  const missing = runInstaller([]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /usage/);
});

test("updateAgentsIndex creates, appends, and replaces correctly", () => {
  const skills = [{ name: "a-skill", description: "Does a thing." }];
  const created = updateAgentsIndex(null, skills);
  assert.match(created, /a-skill/);
  const appended = updateAgentsIndex("# Mine\n", skills);
  assert.ok(appended.startsWith("# Mine\n"));
  const replaced = updateAgentsIndex(appended, [
    { name: "b-skill", description: "Does another thing." },
  ]);
  assert.match(replaced, /b-skill/);
  assert.ok(!replaced.includes("a-skill"));
  assert.ok(replaced.startsWith("# Mine\n"));
});
