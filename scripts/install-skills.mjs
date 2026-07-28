#!/usr/bin/env node

// Install the parallel-slices skills into a target repository for Claude
// Code, Cursor, and Codex.
//
//   node scripts/install-skills.mjs <target-repo> [--tools claude,cursor,codex]
//
// The canonical skill content is copied to `.claude/skills/<name>/`, which
// Claude Code reads natively (including automatic invocation from the skill
// description). Cursor and Codex get thin adapters pointing at that same
// copy, so there is exactly one canonical text per skill inside the target:
//
//   .cursor/commands/<name>.md      Cursor slash command
//   .agents/skills/<name>.md        Codex pointer
//   AGENTS.md                       marker-delimited index block (created or
//                                   updated in place; the rest of the file is
//                                   never touched)
//
// Re-running the installer is safe: copies are refreshed and the AGENTS.md
// block is replaced between its markers rather than appended again.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const START_MARKER = "<!-- parallel-slices skills: start -->";
const END_MARKER = "<!-- parallel-slices skills: end -->";
const ALL_TOOLS = ["claude", "cursor", "codex"];

function fail(message) {
  console.error(`install-skills: ${message}`);
  process.exit(1);
}

export function parseFrontmatter(markdown) {
  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== "---") return {};
  const fields = {};
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") break;
    const separator = lines[index].indexOf(":");
    if (separator === -1) continue;
    fields[lines[index].slice(0, separator).trim()] = lines[index]
      .slice(separator + 1)
      .trim();
  }
  return fields;
}

export function discoverSkills(skillsRoot) {
  if (!existsSync(skillsRoot)) fail(`skills directory missing: ${skillsRoot}`);
  const skills = [];
  for (const entry of readdirSync(skillsRoot).sort()) {
    const skillPath = join(skillsRoot, entry, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    const { name, description } = parseFrontmatter(
      readFileSync(skillPath, "utf8"),
    );
    if (!name || !description) {
      fail(`SKILL.md is missing name or description frontmatter: ${skillPath}`);
    }
    if (name !== entry) {
      fail(`skill directory ${entry} declares mismatched name ${name}`);
    }
    skills.push({ name, description, directory: join(skillsRoot, entry) });
  }
  if (!skills.length) fail(`no skills found under ${skillsRoot}`);
  return skills;
}

function pointerText(skill) {
  return `Read \`.claude/skills/${skill.name}/SKILL.md\` in this repository completely and follow it as the authoritative workflow. Its supporting templates and scripts live beside it in \`.claude/skills/${skill.name}/files/\`.\n`;
}

export function updateAgentsIndex(existing, skills) {
  const block = [
    START_MARKER,
    "",
    "## Agent skills",
    "",
    "Installed by parallel-slices. When a task matches one of these, read its",
    "SKILL.md completely and follow it as the authoritative workflow:",
    "",
    ...skills.map(
      (skill) =>
        `- **${skill.name}** (\`.claude/skills/${skill.name}/SKILL.md\`): ${skill.description}`,
    ),
    "",
    END_MARKER,
  ].join("\n");
  if (existing === null) return `${block}\n`;
  const start = existing.indexOf(START_MARKER);
  const end = existing.indexOf(END_MARKER);
  if (start !== -1 && end !== -1 && end > start) {
    return (
      existing.slice(0, start) + block + existing.slice(end + END_MARKER.length)
    );
  }
  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  return `${existing}${separator}${block}\n`;
}

export function installSkills(target, tools, skillsRoot) {
  const skills = discoverSkills(skillsRoot);
  const installed = [];
  if (
    tools.includes("claude") ||
    tools.includes("cursor") ||
    tools.includes("codex")
  ) {
    // Claude's copy is the canonical text inside the target; the other
    // adapters point at it, so it installs whenever any tool is selected.
    for (const skill of skills) {
      const destination = join(target, ".claude", "skills", skill.name);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(skill.directory, destination, { recursive: true });
    }
    installed.push(`.claude/skills (${skills.length} skills)`);
  }
  if (tools.includes("cursor")) {
    const commands = join(target, ".cursor", "commands");
    mkdirSync(commands, { recursive: true });
    for (const skill of skills) {
      writeFileSync(join(commands, `${skill.name}.md`), pointerText(skill));
    }
    installed.push(".cursor/commands");
  }
  if (tools.includes("codex")) {
    const pointers = join(target, ".agents", "skills");
    mkdirSync(pointers, { recursive: true });
    for (const skill of skills) {
      writeFileSync(join(pointers, `${skill.name}.md`), pointerText(skill));
    }
    const agentsPath = join(target, "AGENTS.md");
    const existing = existsSync(agentsPath)
      ? readFileSync(agentsPath, "utf8")
      : null;
    writeFileSync(agentsPath, updateAgentsIndex(existing, skills));
    installed.push(".agents/skills and the AGENTS.md index block");
  }
  return { skills, installed };
}

const executedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (executedDirectly) {
  const argv = process.argv.slice(2);
  let target = null;
  let tools = [...ALL_TOOLS];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--tools") {
      const value = argv[index + 1];
      if (!value) fail("--tools requires a comma-separated list");
      tools = value.split(",").map((tool) => tool.trim());
      for (const tool of tools) {
        if (!ALL_TOOLS.includes(tool)) fail(`unknown tool: ${tool}`);
      }
      index += 1;
    } else if (argv[index].startsWith("--")) {
      fail(`unknown option: ${argv[index]}`);
    } else if (target === null) {
      target = resolve(argv[index]);
    } else {
      fail("exactly one target repository is expected");
    }
  }
  if (!target)
    fail(
      "usage: install-skills.mjs <target-repo> [--tools claude,cursor,codex]",
    );
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    fail(`target is not a directory: ${target}`);
  }
  const skillsRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "skills",
  );
  const { skills, installed } = installSkills(target, tools, skillsRoot);
  console.log(`installed ${skills.map((skill) => skill.name).join(", ")}`);
  for (const line of installed) console.log(`  ${line}`);
}
