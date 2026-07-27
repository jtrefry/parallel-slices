#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import {
  containsMachineSpecificPath,
  containsPotentialSecret,
} from "../repo-overlay/scripts/parallel-slices/content-safety.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const ignoredDirectories = new Set(["node_modules"]);
const forbiddenNames = new Set([".DS_Store", "Thumbs.db", "skills-lock.json"]);
const forbiddenDirectories = new Set([
  "coverage",
  "dist",
  "playwright-report",
  "test-results",
]);
const legacyAppNamespace = ["app", "fac" + "tory"];
const staleBrandingPatterns = [
  {
    label: "legacy internal namespace",
    pattern: new RegExp(
      `${legacyAppNamespace[0]}[-_ ]${legacyAppNamespace[1]}`,
      "i",
    ),
  },
  {
    label: "legacy repository name",
    pattern: new RegExp(
      ["nextjs", "gcp", ...legacyAppNamespace].join("-"),
      "i",
    ),
  },
  {
    label: "non-canonical website domain",
    pattern: new RegExp(`${["parallel", "slice"].join("-")}\\.com`, "i"),
  },
];

function fail(message) {
  failures.push(message);
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    const path = relative(root, absolute).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (forbiddenDirectories.has(entry.name))
        fail(`generated directory is forbidden: ${path}`);
      files.push(...walk(absolute));
    } else {
      if (forbiddenNames.has(entry.name))
        fail(`generated file is forbidden: ${path}`);
      files.push(path);
    }
  }
  return files;
}

function checkRequiredFiles() {
  const required = [
    ".editorconfig",
    ".github/CODEOWNERS",
    ".github/pull_request_template.md",
    ".github/workflows/quality.yml",
    ".gitattributes",
    ".gitignore",
    "AGENTS.md",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "docs/README.md",
    "docs/creating-architecture-packages.md",
    "docs/assets/parallel-slices-workflow.svg",
    "docs/curated-agent-skills.md",
    "docs/mechanism-map.md",
    "eslint.config.js",
    "LICENSE",
    "package-lock.json",
    "README.md",
    "SECURITY.md",
    "SUPPORT.md",
    "package.json",
    "schemas/architecture-package.schema.json",
    "schemas/architecture-package-authoring.schema.json",
    "schemas/create-config.schema.json",
    "tsconfig.json",
    "architectures/nextjs-gcp-postgres/architecture.json",
    "architectures/nextjs-gcp-postgres/package.json",
    "architectures/nextjs-gcp-postgres/README.md",
    "architectures/nextjs-gcp-postgres/generator.mjs",
    "architectures/nextjs-gcp-postgres/configure-scaffold.mjs",
    "architectures/nextjs-gcp-postgres/templates/root-AGENTS.md",
    "architectures/nextjs-gcp-postgres/scaffold/package.json",
    "architectures/nextjs-gcp-postgres/scaffold/templates/project-README.md",
    "architectures/nextjs-gcp-postgres/repo-overlay/.parallel-slices/config.json",
    "architectures/nextjs-gcp-postgres/repo-overlay/.parallel-slices/curated-skills.json",
    "architectures/nextjs-gcp-postgres/repo-overlay/.parallel-slices/sql-security.json",
    "architectures/nextjs-gcp-postgres/repo-overlay/scripts/architecture/nextjs-gcp-postgres/verify.mjs",
    "architectures/nextjs-cloudflare-supabase/architecture.json",
    "architectures/nextjs-cloudflare-supabase/package.json",
    "architectures/nextjs-cloudflare-supabase/README.md",
    "architectures/nextjs-cloudflare-supabase/generator.mjs",
    "architectures/nextjs-cloudflare-supabase/configure-scaffold.mjs",
    "architectures/nextjs-cloudflare-supabase/templates/root-AGENTS.md",
    "architectures/nextjs-cloudflare-supabase/scaffold/package.json",
    "architectures/nextjs-cloudflare-supabase/scaffold/templates/project-README.md",
    "architectures/nextjs-cloudflare-supabase/repo-overlay/.parallel-slices/config.json",
    "architectures/nextjs-cloudflare-supabase/repo-overlay/.parallel-slices/curated-skills.json",
    "architectures/nextjs-cloudflare-supabase/repo-overlay/.parallel-slices/sql-security.json",
    "architectures/nextjs-cloudflare-supabase/repo-overlay/scripts/architecture/nextjs-cloudflare-supabase/verify.mjs",
    "repo-overlay/.parallel-slices/agent.json",
    "repo-overlay/.parallel-slices/agent.schema.json",
    "repo-overlay/.parallel-slices/config.schema.json",
    "repo-overlay/.parallel-slices/architecture.schema.json",
    "repo-overlay/.parallel-slices/loop-state.schema.json",
    "repo-overlay/.parallel-slices/runtime/.gitignore",
    "repo-overlay/.parallel-slices/review.json",
    "repo-overlay/.parallel-slices/review.schema.json",
    "repo-overlay/.parallel-slices/review-response.schema.json",
    "repo-overlay/.parallel-slices/scope-correction.schema.json",
    "repo-overlay/.parallel-slices/repository.json",
    "repo-overlay/.parallel-slices/repository.schema.json",
    "repo-overlay/.agents/skills/parallel-slices-next/SKILL.md",
    "repo-overlay/.agents/skills/parallel-slices-plan/SKILL.md",
    "repo-overlay/.agents/skills/parallel-slices-plan/agents/openai.yaml",
    "repo-overlay/.agents/skills/parallel-slices-prepare/SKILL.md",
    "repo-overlay/.agents/skills/parallel-slices-status/SKILL.md",
    "repo-overlay/.agents/skills/slices-next/SKILL.md",
    "repo-overlay/.agents/skills/slices-plan/SKILL.md",
    "repo-overlay/.agents/skills/slices-prepare/SKILL.md",
    "repo-overlay/.agents/skills/slices-status/SKILL.md",
    "repo-overlay/.claude/skills/parallel-slices-next/SKILL.md",
    "repo-overlay/.claude/skills/parallel-slices-plan/SKILL.md",
    "repo-overlay/.claude/skills/parallel-slices-prepare/SKILL.md",
    "repo-overlay/.claude/skills/parallel-slices-status/SKILL.md",
    "repo-overlay/.claude/skills/slices-next/SKILL.md",
    "repo-overlay/.claude/skills/slices-plan/SKILL.md",
    "repo-overlay/.claude/skills/slices-prepare/SKILL.md",
    "repo-overlay/.claude/skills/slices-status/SKILL.md",
    "repo-overlay/.cursor/rules/parallel-slices-controller.mdc",
    "repo-overlay/.cursor/skills/parallel-slices-next/SKILL.md",
    "repo-overlay/.cursor/commands/parallel-slices-next.md",
    "repo-overlay/.cursor/commands/parallel-slices-plan.md",
    "repo-overlay/.cursor/commands/parallel-slices-prepare.md",
    "repo-overlay/.cursor/commands/parallel-slices-status.md",
    "repo-overlay/.cursor/commands/slices-next.md",
    "repo-overlay/.cursor/commands/slices-plan.md",
    "repo-overlay/.cursor/commands/slices-prepare.md",
    "repo-overlay/.cursor/commands/slices-status.md",
    "repo-overlay/.cursor/skills/parallel-slices-plan/SKILL.md",
    "repo-overlay/docs/AGENTS.md",
    "repo-overlay/docs/parallel-slices/run-sliced-plan.md",
    "repo-overlay/docs/parallel-slices/README.md",
    "repo-overlay/docs/parallel-slices/check-run-status.md",
    "repo-overlay/docs/parallel-slices/robust-recovery.md",
    "repo-overlay/docs/parallel-slices/run-slice-worker.md",
    "repo-overlay/docs/parallel-slices/planning-and-optimized-slices.md",
    "repo-overlay/docs/parallel-slices/plan-milestone.md",
    "repo-overlay/docs/parallel-slices/using-codex.md",
    "repo-overlay/docs/parallel-slices/using-cursor.md",
    "repo-overlay/docs/parallel-slices/using-claude-code.md",
    "repo-overlay/docs/parallel-slices/github-automation.md",
    "repo-overlay/docs/parallel-slices/multi-agent-review.md",
    "repo-overlay/docs/parallel-slices/assets/multi-agent-review.svg",
    "repo-overlay/docs/plans/corrections/AGENTS.md",
    "repo-overlay/docs/plans/reviews/AGENTS.md",
    "repo-overlay/docs/plans/_LOOP-STATE-TEMPLATE.json",
    "repo-overlay/docs/plans/_PRODUCT-PLAN-TEMPLATE.md",
    "repo-overlay/docs/plans/scopes/_PLANNING-SCOPE-TEMPLATE.scope",
    "repo-overlay/scripts/parallel-slices/agent-profile.mjs",
    "repo-overlay/scripts/parallel-slices/architecture-profile.mjs",
    "repo-overlay/scripts/parallel-slices/branch-policy.mjs",
    "repo-overlay/scripts/parallel-slices/content-safety.mjs",
    "repo-overlay/scripts/parallel-slices/corepack-runner.mjs",
    "repo-overlay/scripts/parallel-slices/doctor.mjs",
    "repo-overlay/scripts/parallel-slices/generated-baseline.mjs",
    "repo-overlay/scripts/parallel-slices/install-curated-skills.mjs",
    "repo-overlay/scripts/parallel-slices/project-state.mjs",
    "repo-overlay/scripts/parallel-slices/planning-review.mjs",
    "repo-overlay/scripts/parallel-slices/repository-profile.mjs",
    "repo-overlay/scripts/parallel-slices/review.mjs",
    "repo-overlay/scripts/parallel-slices/review-artifact.mjs",
    "repo-overlay/scripts/parallel-slices/review-config.mjs",
    "repo-overlay/scripts/parallel-slices/review-contract.mjs",
    "repo-overlay/scripts/parallel-slices/review-process.mjs",
    "repo-overlay/scripts/parallel-slices/review-providers.mjs",
    "repo-overlay/scripts/parallel-slices/review-snapshot.mjs",
    "repo-overlay/scripts/parallel-slices/review-state.mjs",
    "repo-overlay/scripts/parallel-slices/run-lock.mjs",
    "repo-overlay/scripts/parallel-slices/run-status.mjs",
    "repo-overlay/scripts/parallel-slices/run-state.mjs",
    "repo-overlay/scripts/parallel-slices/run-tracking.mjs",
    "repo-overlay/scripts/parallel-slices/scope-policy.mjs",
    "repo-overlay/scripts/parallel-slices/scope-correction.mjs",
    "repo-overlay/scripts/parallel-slices/slice-compilation.mjs",
    "repo-overlay/scripts/parallel-slices/slice-graph.mjs",
    "repo-overlay/scripts/parallel-slices/slice-worktree.mjs",
    "repo-overlay/docs/testing/manual/AGENTS.md",
    "repo-overlay/docs/testing/manual/_MANUAL-TEST-SCRIPT-TEMPLATE.md",
    "repo-overlay/docs/testing/manual/multi-agent-review-test-script.md",
    "architectures/nextjs-gcp-postgres/repo-overlay/apps/backend/migrations/AGENTS.md",
    "architectures/nextjs-gcp-postgres/repo-overlay/apps/backend/migrations/README.md",
    "architectures/nextjs-gcp-postgres/repo-overlay/apps/backend/migrations/_MIGRATION_TEMPLATE.sql",
    "architectures/nextjs-gcp-postgres/repo-overlay/scripts/database/postgres-migration-runner.ts",
    "architectures/nextjs-gcp-postgres/repo-overlay/scripts/security/sql-security-scanner.ts",
    "architectures/nextjs-gcp-postgres/repo-overlay/scripts/security/trivy-security-scanner.mjs",
    "architectures/nextjs-gcp-postgres/repo-overlay/.github/dependabot.yml",
    "architectures/nextjs-gcp-postgres/repo-overlay/.github/workflows/quality.yml",
    "architectures/nextjs-gcp-postgres/repo-overlay/.trivy-version",
    "architectures/nextjs-gcp-postgres/repo-overlay/trivy.yaml",
    "architectures/nextjs-gcp-postgres/profiles/external-api-only/repo-overlay/.parallel-slices/config.json",
    "architectures/nextjs-gcp-postgres/profiles/external-api-only/repo-overlay/.github/workflows/quality.yml",
    "architectures/nextjs-gcp-postgres/profiles/external-api-only/repo-overlay/.github/workflows/deploy-cloud-run.yml",
    "architectures/nextjs-gcp-postgres/profiles/external-api-only/repo-overlay/docs/parallel-slices/initialize-nextjs-gcp-postgres-project.md",
    "architectures/nextjs-gcp-postgres/profiles/external-api-only/templates/root-AGENTS.md",
    "examples/architecture-packages/company-web-app.json",
    "examples/create/nextjs-gcp-postgres.json",
    "examples/create/nextjs-gcp-external-api-only.json",
    "scripts/architecture-package-authoring.mjs",
    "scripts/bootstrap-new.mjs",
    "scripts/architecture-package.mjs",
    "scripts/creation-config.mjs",
    "scripts/install-overlays.mjs",
    "tests/command-adapters.test.mjs",
    "tests/curated-skills.integration.test.mjs",
    "tests/review.test.mjs",
    "tests/review.integration.test.mjs",
    "tests/slice-orchestration.test.mjs",
  ];
  for (const path of required) {
    if (!existsSync(resolve(root, path)))
      fail(`required repository file is missing: ${path}`);
  }
}

export function commandNamespaceProblems(commands, directory) {
  const problems = [];
  for (const command of commands) {
    const canonical = command.startsWith("parallel-slices-");
    const alias = command.startsWith("slices-");
    if (!canonical && !alias) {
      problems.push(
        `custom command lacks a Parallel Slices namespace: ${directory}/${command}`,
      );
      continue;
    }
    const suffix = command.slice(
      canonical ? "parallel-slices-".length : "slices-".length,
    );
    const counterpart = `${canonical ? "slices" : "parallel-slices"}-${suffix}`;
    if (!commands.includes(counterpart)) {
      problems.push(
        `custom command is missing its ${canonical ? "short alias" : "canonical entry"}: ${directory}/${command}`,
      );
    }
  }
  return problems;
}

function checkCommandNamespaces() {
  const architectureOverlays = readdirSync(resolve(root, "architectures"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `architectures/${entry.name}/repo-overlay`)
    .filter((overlay) => existsSync(resolve(root, overlay)));
  const surfaces = ["repo-overlay", ...architectureOverlays].flatMap(
    (overlay) =>
      [
        {
          directory: `${overlay}/.cursor/commands`,
          names: (entry) => entry.isFile() && entry.name.endsWith(".md"),
          normalize: (name) => name.slice(0, -3),
        },
        ...[".agents/skills", ".claude/skills"].map((suffix) => ({
          directory: `${overlay}/${suffix}`,
          names: (entry) =>
            entry.isDirectory() &&
            existsSync(resolve(root, overlay, suffix, entry.name, "SKILL.md")),
          normalize: (name) => name,
        })),
      ].filter((surface) => existsSync(resolve(root, surface.directory))),
  );
  for (const surface of surfaces) {
    const directory = resolve(root, surface.directory);
    const commands = readdirSync(directory, { withFileTypes: true })
      .filter(surface.names)
      .map((entry) => surface.normalize(entry.name));
    for (const problem of commandNamespaceProblems(commands, surface.directory))
      fail(problem);
  }
}

function checkJson(files) {
  for (const path of files.filter((candidate) => candidate.endsWith(".json"))) {
    try {
      JSON.parse(readFileSync(resolve(root, path), "utf8"));
    } catch (error) {
      fail(`invalid JSON in ${path}: ${error.message}`);
    }
  }
}

export function markdownAnchors(content) {
  const anchors = new Set();
  const occurrences = new Map();
  for (const line of content.split("\n")) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const base = match[1]
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/<[^>]*>/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s+/g, "-");
    if (!base) continue;
    const count = occurrences.get(base) || 0;
    occurrences.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function checkMarkdownLinks(files) {
  const anchorCache = new Map();
  for (const path of files.filter((candidate) => candidate.endsWith(".md"))) {
    const content = readFileSync(resolve(root, path), "utf8");
    const pattern = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;
    for (const match of content.matchAll(pattern)) {
      const raw = match[1].trim().replace(/^<|>$/g, "");
      if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
      const [encodedPath, encodedFragment] = raw.split("#", 2);
      const localPath = decodeURIComponent(encodedPath);
      const fragment = encodedFragment
        ? decodeURIComponent(encodedFragment).toLowerCase()
        : "";
      // A bundled architecture's project README is written for the generated
      // repository, so its links resolve against the installed overlays rather
      // than against the package directory that holds the template.
      const generatedReadme =
        /^architectures\/[^/]+\/scaffold\/templates\/project-README\.md$/.test(
          path,
        );
      const architectureRoot = generatedReadme
        ? path.slice(0, path.indexOf("/scaffold/"))
        : "";
      const targets = localPath
        ? generatedReadme
          ? [
              resolve(root, "repo-overlay", localPath),
              resolve(root, `${architectureRoot}/repo-overlay`, localPath),
            ]
          : [resolve(root, dirname(path), localPath)]
        : [resolve(root, path)];
      const target = targets.find(existsSync);
      if (!target) {
        fail(`broken local Markdown link in ${path}: ${raw}`);
        continue;
      }
      if (!fragment || !target.endsWith(".md")) continue;
      let anchors = anchorCache.get(target);
      if (!anchors) {
        anchors = markdownAnchors(readFileSync(target, "utf8"));
        anchorCache.set(target, anchors);
      }
      if (!anchors.has(fragment))
        fail(`broken local Markdown anchor in ${path}: ${raw}`);
    }
  }
}

function checkSensitiveContent(files) {
  for (const path of files) {
    const absolute = resolve(root, path);
    if (statSync(absolute).size > 2_000_000) continue;
    const content = readFileSync(absolute);
    if (content.includes(0)) continue;
    const text = content.toString("utf8");
    if (containsPotentialSecret(text)) {
      fail(`possible secret found in ${path}`);
    }
    if (containsMachineSpecificPath(text)) {
      fail(`absolute user path found in ${path}`);
    }
  }
}

function checkStaleBranding(files) {
  for (const path of files) {
    for (const { label, pattern } of staleBrandingPatterns) {
      if (pattern.test(path)) fail(`${label} remains in path: ${path}`);
    }
    const absolute = resolve(root, path);
    if (statSync(absolute).size > 2_000_000) continue;
    const content = readFileSync(absolute);
    if (content.includes(0)) continue;
    const text = content.toString("utf8");
    for (const { label, pattern } of staleBrandingPatterns) {
      if (pattern.test(text)) fail(`${label} remains in ${path}`);
    }
  }
}

function checkWorkflowPins(files) {
  const workflows = files
    .filter((path) => /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(path))
    .concat(
      files.filter((path) => /^examples\/github-actions-.+\.ya?ml$/.test(path)),
    );
  for (const path of [...new Set(workflows)]) {
    const content = readFileSync(resolve(root, path), "utf8");
    for (const match of content.matchAll(
      /^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm,
    )) {
      const reference = match[1];
      if (reference.startsWith("./") || reference.startsWith("docker://"))
        continue;
      const separator = reference.lastIndexOf("@");
      const revision = separator >= 0 ? reference.slice(separator + 1) : "";
      if (!/^[0-9a-f]{40}$/.test(revision)) {
        fail(
          `GitHub Action is not pinned to a full commit SHA in ${path}: ${reference}`,
        );
      }
    }
  }
}

export function dependabotCoverageProblems(updates, requirements) {
  if (!Array.isArray(updates)) return ["Dependabot updates must be an array"];
  const configured = new Set(
    updates.map(
      (entry) =>
        `${entry?.["package-ecosystem"] || ""}:${entry?.directory || ""}`,
    ),
  );
  return requirements
    .filter((requirement) => !configured.has(requirement))
    .map((requirement) => `Dependabot is missing ${requirement}`);
}

function dependabotUpdate(updates, ecosystem, directory) {
  return updates.find(
    (entry) =>
      entry?.["package-ecosystem"] === ecosystem &&
      entry?.directory === directory,
  );
}

function dependabotIgnoreKey(rule) {
  const name = rule?.["dependency-name"];
  const versions = Array.isArray(rule?.versions)
    ? [...rule.versions].sort()
    : [];
  return `${name || ""}:${versions.join(",")}`;
}

export function dependabotIgnoreProblems(
  updates,
  ecosystem,
  directory,
  requiredIgnores,
) {
  const update = dependabotUpdate(updates, ecosystem, directory);
  if (!update) return [];
  const configured = new Set((update.ignore || []).map(dependabotIgnoreKey));
  return requiredIgnores
    .filter((rule) => !configured.has(dependabotIgnoreKey(rule)))
    .map((rule) => {
      const versions = Array.isArray(rule?.versions) ? rule.versions : [];
      return `Dependabot ${ecosystem}:${directory} is missing the reviewed ignore for ${rule?.["dependency-name"] || "an unnamed dependency"} (${versions.join(", ") || "all versions"})`;
    });
}

function checkDependabotCoverage() {
  const configPath = resolve(root, ".github/dependabot.yml");
  let config;
  try {
    config = parseYaml(readFileSync(configPath, "utf8"));
  } catch (error) {
    fail(`invalid YAML in .github/dependabot.yml: ${error.message}`);
    return;
  }
  const updates = config?.updates;
  if (!Array.isArray(updates)) {
    fail("Dependabot updates must be an array");
    return;
  }
  const requirements = ["npm:/", "github-actions:/"];
  const architecturesRoot = resolve(root, "architectures");
  for (const entry of readdirSync(architecturesRoot, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const prefix = `/architectures/${entry.name}`;
    if (
      existsSync(
        resolve(architecturesRoot, entry.name, "scaffold/package.json"),
      )
    ) {
      const sourceRequirement = `npm:${prefix}/scaffold`;
      requirements.push(sourceRequirement);
      const policyPath = resolve(
        architecturesRoot,
        entry.name,
        "repo-overlay/.github/dependabot.yml",
      );
      if (existsSync(policyPath)) {
        let policy;
        try {
          policy = parseYaml(readFileSync(policyPath, "utf8"));
        } catch (error) {
          fail(
            `invalid YAML in ${relative(root, policyPath)}: ${error.message}`,
          );
        }
        const reviewedIgnores = dependabotUpdate(
          policy?.updates || [],
          "npm",
          "/",
        )?.ignore;
        if (Array.isArray(reviewedIgnores)) {
          for (const problem of dependabotIgnoreProblems(
            updates,
            "npm",
            `${prefix}/scaffold`,
            reviewedIgnores,
          )) {
            fail(problem);
          }
        }
      }
    }
    // Overlay workflows are templates installed into generated repositories,
    // not workflows this repository runs, and Dependabot cannot service them.
    // Its github-actions ecosystem resolves `directory` to a composite action's
    // own yml file, so a nested `.github/workflows` tree is invisible to it: a
    // profile overlay aborts the job with "<anything>.yml not found", and a base
    // overlay only avoids that because an unrelated trivy.yaml happens to sit at
    // the same level. Neither has ever produced an update. Requiring the entries
    // produced configuration that fails on every Dependabot run, so root
    // coverage is the only github-actions requirement. Overlay action pins are
    // refreshed by hand and enforced by checkWorkflowPins.
  }
  for (const problem of dependabotCoverageProblems(updates, requirements)) {
    fail(problem);
  }
  for (const entry of updates) {
    const directory = entry?.directory;
    if (
      typeof directory !== "string" ||
      !directory.startsWith("/") ||
      directory.includes("..")
    ) {
      fail(`Dependabot has an unsafe directory: ${directory || "missing"}`);
      continue;
    }
    const target = resolve(root, directory.slice(1));
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      fail(`Dependabot directory escapes the repository: ${directory}`);
    } else if (!existsSync(target)) {
      fail(`Dependabot directory does not exist: ${directory}`);
    }
  }
}

function main() {
  checkRequiredFiles();
  checkCommandNamespaces();
  const files = walk(root);
  checkJson(files);
  checkMarkdownLinks(files);
  checkSensitiveContent(files);
  checkStaleBranding(files);
  checkWorkflowPins(files);
  checkDependabotCoverage();
  if (failures.length) {
    for (const message of failures) console.error(`AUDIT ERROR: ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`repository audit passed: ${files.length} files`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
