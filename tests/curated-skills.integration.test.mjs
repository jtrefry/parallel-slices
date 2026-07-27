import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  hashSkillTree,
  installCuratedSkills,
} from "../repo-overlay/scripts/parallel-slices/install-curated-skills.mjs";
import { configureAgent } from "../repo-overlay/scripts/parallel-slices/agent-profile.mjs";
import { run, write } from "./helpers/fixture.mjs";

const selectedSkills = [
  {
    source: "skills/react-best-practices",
    name: "vercel-react-best-practices",
  },
  {
    source: "skills/composition-patterns",
    name: "vercel-composition-patterns",
  },
];

function createSkillSource(root, options = {}) {
  run("git", ["init", "-b", "main"], root);
  for (const skill of selectedSkills) {
    write(
      root,
      `${skill.source}/SKILL.md`,
      `---\nname: ${skill.name}\nlicense: MIT\n---\n\n# ${skill.name}\n`,
    );
    write(root, `${skill.source}/rules/example.md`, "# Example\n");
  }
  if (options.unsafeFile) {
    const unsafeSkill = selectedSkills[options.unsafeSkillIndex ?? 0];
    write(root, `${unsafeSkill.source}/scripts/run.sh`, "#!/bin/sh\nexit 0\n");
  }
  if (options.executableFile) {
    const executableSkill = selectedSkills[0];
    const path = `${executableSkill.source}/rules/tool.md`;
    write(root, path, "# Tool\n");
    chmodSync(join(root, path), 0o755);
  }
  run("git", ["add", "."], root);
  run(
    "git",
    [
      "-c",
      "user.name=Skill Test",
      "-c",
      "user.email=skills@example.test",
      "commit",
      "-m",
      "add fixture skills",
    ],
    root,
  );
  return run("git", ["rev-parse", "HEAD"], root).trim();
}

function writeManifest(target, source, commit, options = {}) {
  const manifestPath = join(target, ".parallel-slices/curated-skills.json");
  const skills = selectedSkills.map((skill) => ({
    ...skill,
    license: "MIT",
    treeSha256: hashSkillTree(join(source, skill.source)),
  }));
  if (options.invalidHash) skills[0].treeSha256 = "0".repeat(64);
  write(
    target,
    ".parallel-slices/curated-skills.json",
    `${JSON.stringify(
      {
        schema: 1,
        source: {
          repository: pathToFileURL(source).href,
          commit,
          reviewedAt: "2026-07-15",
        },
        skills,
      },
      null,
      2,
    )}\n`,
  );
  return manifestPath;
}

test("installs only pinned curated skills and is idempotent", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-skills-test-"));
  const source = join(root, "source");
  const target = join(root, "target");
  try {
    mkdirSync(source);
    mkdirSync(target);
    const commit = createSkillSource(source);
    const manifestPath = writeManifest(target, source, commit);

    installCuratedSkills({ target, manifestPath, agent: "cursor" });
    installCuratedSkills({ target, manifestPath, agent: "cursor" });

    for (const skill of selectedSkills) {
      const installed = join(target, ".cursor/skills", skill.name);
      assert.equal(existsSync(join(installed, "SKILL.md")), true);
      assert.equal(
        existsSync(join(installed, ".parallel-slices-upstream.json")),
        true,
      );
      if (process.platform !== "win32") {
        assert.equal(statSync(join(installed, "SKILL.md")).mode & 0o777, 0o644);
      }
    }
    assert.equal(
      existsSync(join(target, ".cursor/skills/deploy-to-vercel")),
      false,
    );
    assert.equal(
      existsSync(join(target, ".cursor/skills/THIRD_PARTY.md")),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses to overwrite a modified curated skill", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-skills-modified-"));
  const source = join(root, "source");
  const target = join(root, "target");
  try {
    mkdirSync(source);
    mkdirSync(target);
    const commit = createSkillSource(source);
    const manifestPath = writeManifest(target, source, commit);
    installCuratedSkills({ target, manifestPath, agent: "cursor" });
    write(
      target,
      ".cursor/skills/vercel-react-best-practices/SKILL.md",
      "locally modified\n",
    );

    assert.throws(
      () => installCuratedSkills({ target, manifestPath, agent: "cursor" }),
      /refusing to overwrite a modified curated skill/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects executable content before installing a curated skill", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-skills-unsafe-"));
  const source = join(root, "source");
  const target = join(root, "target");
  try {
    mkdirSync(source);
    mkdirSync(target);
    const commit = createSkillSource(source, {
      unsafeFile: true,
      unsafeSkillIndex: 1,
    });
    const manifestPath = writeManifest(target, source, commit);

    assert.throws(
      () => installCuratedSkills({ target, manifestPath, agent: "cursor" }),
      /executable or unsupported content/,
    );
    assert.equal(
      existsSync(join(target, ".cursor/skills/vercel-react-best-practices")),
      false,
    );
    assert.equal(
      existsSync(join(target, ".cursor/skills/vercel-composition-patterns")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a curated skill file carrying an executable bit", (t) => {
  if (process.platform === "win32") {
    t.skip("executable bits are not represented on Windows");
    return;
  }
  const root = mkdtempSync(
    join(tmpdir(), "parallel-slices-skills-executable-"),
  );
  const source = join(root, "source");
  const target = join(root, "target");
  try {
    mkdirSync(source);
    mkdirSync(target);
    const commit = createSkillSource(source, { executableFile: true });
    const manifestPath = writeManifest(target, source, commit);

    assert.throws(
      () => installCuratedSkills({ target, manifestPath, agent: "cursor" }),
      /executable or unsupported content/,
    );
    assert.equal(
      existsSync(join(target, ".cursor/skills/vercel-react-best-practices")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects content that does not match the reviewed tree hash", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-skills-hash-"));
  const source = join(root, "source");
  const target = join(root, "target");
  try {
    mkdirSync(source);
    mkdirSync(target);
    const commit = createSkillSource(source);
    const manifestPath = writeManifest(target, source, commit, {
      invalidHash: true,
    });

    assert.throws(
      () => installCuratedSkills({ target, manifestPath, agent: "cursor" }),
      /curated skill hash mismatch/,
    );
    assert.equal(
      existsSync(join(target, ".cursor/skills/vercel-react-best-practices")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installs skills in every enabled native skill directory by default", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-agent-skills-"));
  const source = join(root, "source");
  try {
    mkdirSync(source);
    const commit = createSkillSource(source);
    const directories = {
      cursor: ".cursor/skills",
      codex: ".agents/skills",
      "claude-code": ".claude/skills",
    };
    const target = join(root, "target");
    mkdirSync(target);
    configureAgent(target, "cursor");
    const manifestPath = writeManifest(target, source, commit);
    installCuratedSkills({ target, manifestPath });
    for (const directory of Object.values(directories)) {
      for (const skill of selectedSkills) {
        assert.equal(
          existsSync(join(target, directory, skill.name, "SKILL.md")),
          true,
        );
      }
      assert.equal(
        existsSync(join(target, directory, "deploy-to-vercel")),
        false,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
