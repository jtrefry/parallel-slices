import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = join(repoRoot, "skills");

// Instruction files are read in full, by an agent, on every run, in every
// repository the installer touches. Nothing else in this project bounds their
// growth: the Receipts rule decides whether a rule is justified, never how many
// rules there are, and "prefer deleting over adding" is a preference no check
// enforces. These budgets are that check. They do not decide what to cut; they
// force the choice to happen at a threshold instead of never.
//
// Raising a budget is allowed and is sometimes right. It has to be a deliberate
// edit, visible in the diff and reviewable on its own, rather than a side effect
// of adding one more rule.
const SKILL_WORD_BUDGET = 1500;
const AGENTS_WORD_BUDGET = 600;

// A skill's description is the most expensive text in the repository per word:
// it sits in the agent's context for every request, whether or not the skill is
// ever invoked. The body is only read when the skill fires.
const DESCRIPTION_CHAR_BUDGET = 500;

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function readDescription(markdown) {
  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== "---") return "";
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") break;
    if (lines[index].startsWith("description:")) {
      return lines[index].slice("description:".length).trim();
    }
  }
  return "";
}

function skillFiles() {
  return readdirSync(skillsRoot)
    .sort()
    .map((name) => ({ name, path: join(skillsRoot, name, "SKILL.md") }))
    .filter((skill) => {
      try {
        readFileSync(skill.path);
        return true;
      } catch {
        return false;
      }
    });
}

function overBudget(label, actual, budget, unit) {
  return `${label} is ${actual} ${unit}, over its ${budget}-${unit} budget by ${actual - budget}. Delete something, or raise the budget in tests/instruction-budget.test.mjs as its own reviewed change.`;
}

test("every skill stays inside its instruction budget", () => {
  const skills = skillFiles();
  assert.ok(skills.length > 0, "no skills found");
  for (const skill of skills) {
    const words = countWords(readFileSync(skill.path, "utf8"));
    assert.ok(
      words <= SKILL_WORD_BUDGET,
      overBudget(`${skill.name}/SKILL.md`, words, SKILL_WORD_BUDGET, "words"),
    );
  }
});

test("every skill description stays inside its budget", () => {
  for (const skill of skillFiles()) {
    const description = readDescription(readFileSync(skill.path, "utf8"));
    assert.ok(description.length > 0, `${skill.name} has no description`);
    assert.ok(
      description.length <= DESCRIPTION_CHAR_BUDGET,
      overBudget(
        `${skill.name} description`,
        description.length,
        DESCRIPTION_CHAR_BUDGET,
        "characters",
      ),
    );
  }
});

test("contributor instructions stay inside their budget", () => {
  const words = countWords(readFileSync(join(repoRoot, "AGENTS.md"), "utf8"));
  assert.ok(
    words <= AGENTS_WORD_BUDGET,
    overBudget("AGENTS.md", words, AGENTS_WORD_BUDGET, "words"),
  );
});
