#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^\d+\.\d+\.\d+$/;
const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const capabilityPattern = /^[a-z][a-z0-9]*(?::[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

function fail(message) {
  throw new Error(message);
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertKnownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length)
    fail(`${label} has unknown fields: ${unknown.join(", ")}`);
}

export function validateArchitectureAuthoringConfig(config) {
  assertObject(config, "architecture authoring config");
  assertKnownKeys(
    config,
    new Set([
      "$schema",
      "version",
      "id",
      "packageName",
      "packageVersion",
      "displayName",
      "description",
      "components",
      "capabilities",
      "defaultProfile",
    ]),
    "architecture authoring config",
  );
  if (
    ![
      "./schemas/architecture-package-authoring.schema.json",
      "https://parallelslices.com/schemas/architecture-package-authoring.schema.json",
    ].includes(config.$schema)
  ) {
    fail(
      "architecture authoring config must reference architecture-package-authoring.schema.json",
    );
  }
  if (config.version !== 1)
    fail("architecture authoring config version must be 1");
  if (!idPattern.test(config.id || "")) fail("architecture id is invalid");
  if (!packageNamePattern.test(config.packageName || "")) {
    fail("architecture packageName is invalid");
  }
  if (!versionPattern.test(config.packageVersion || "")) {
    fail("architecture packageVersion must be an exact semantic version");
  }
  for (const field of ["displayName", "description"]) {
    if (typeof config[field] !== "string" || !config[field].trim()) {
      fail(`architecture ${field} must be a non-empty string`);
    }
  }
  if (!idPattern.test(config.defaultProfile || "")) {
    fail("architecture defaultProfile is invalid");
  }
  if (!Array.isArray(config.components) || config.components.length === 0) {
    fail("architecture authoring config requires components");
  }
  const componentIds = new Set();
  for (const component of config.components) {
    assertObject(component, "architecture authoring component");
    assertKnownKeys(
      component,
      new Set(["id", "kind", "technology", "attributes"]),
      "architecture authoring component",
    );
    if (
      !idPattern.test(component.id || "") ||
      !idPattern.test(component.kind || "") ||
      typeof component.technology !== "string" ||
      !component.technology.trim()
    ) {
      fail("architecture authoring component is invalid");
    }
    assertObject(
      component.attributes || {},
      `component ${component.id}.attributes`,
    );
    if (componentIds.has(component.id)) {
      fail(`duplicate architecture component: ${component.id}`);
    }
    componentIds.add(component.id);
  }
  if (
    !Array.isArray(config.capabilities) ||
    config.capabilities.length === 0 ||
    config.capabilities.some(
      (capability) =>
        typeof capability !== "string" || !capabilityPattern.test(capability),
    ) ||
    new Set(config.capabilities).size !== config.capabilities.length
  ) {
    fail("architecture authoring capabilities are invalid");
  }
  return config;
}

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, { flag: "wx" });
}

function qualityConfig() {
  const step = (name, scripts, timeoutSeconds, provides) => ({
    name,
    runner: "package-script",
    scripts,
    timeoutSeconds,
    provides,
  });
  return {
    $schema: "./config.schema.json",
    version: 5,
    workspaceMode: "single-package",
    sliceCompilation: { sizingStrategy: "throughput-balanced" },
    packageManager: "auto",
    protectedBranches: ["main", "master"],
    branchPolicy: {
      pattern:
        "^(?:feature|feat|fix|bugfix|hotfix|chore|release|docs|test|refactor|perf|ci|build)/[a-z0-9]+(?:-[a-z0-9]+)*$",
      example: "feature/add-example",
      automationPatterns: ["^dependabot/", "^renovate/"],
    },
    steps: {
      format: step("format check", ["format:check"], 300, ["format"]),
      lint: step("lint", ["lint"], 600, ["lint"]),
      types: step("type check", ["typecheck"], 900, ["types"]),
      build: step("build", ["build"], 1200, ["build"]),
      unit: step("unit tests", ["test:unit", "test"], 1200, ["unit"]),
      integration: step("integration tests", ["test:integration"], 1800, [
        "integration",
      ]),
      e2e: step("end-to-end tests", ["test:e2e"], 1800, ["e2e"]),
    },
    pipelines: {
      "generated-baseline": { steps: ["lint", "types", "build"] },
      core: { steps: ["format", "lint", "types", "build", "unit"] },
      full: { extends: "core", append: ["integration", "e2e"] },
    },
    entrypoints: {
      generatedBaseline: { pipeline: "generated-baseline" },
      preCommit: { pipeline: "core" },
      prePush: { pipeline: "full" },
      ci: { pipeline: "full" },
      loop: { pipelineFrom: "scopeManifest" },
    },
  };
}

function architectureManifest(config) {
  const verifier = `scripts/architecture/${config.id}/verify.mjs`;
  const floors = {
    generatedBaseline: ["lint", "types", "build"],
    preCommit: ["format", "lint", "types", "build", "unit"],
    prePush: ["format", "lint", "types", "build", "unit", "integration", "e2e"],
    ci: ["format", "lint", "types", "build", "unit", "integration", "e2e"],
    loop: ["format", "lint", "types", "build", "unit"],
  };
  return {
    $schema:
      "https://parallelslices.com/schemas/architecture-package.schema.json",
    contractVersion: 1,
    id: config.id,
    packageName: config.packageName,
    version: config.packageVersion,
    displayName: config.displayName,
    description: config.description,
    components: config.components.map((component) => ({
      ...component,
      optional: false,
      attributes: component.attributes || {},
    })),
    capabilities: config.capabilities,
    options: {
      "package-manager": {
        type: "string",
        description: "Package manager used by the generated repository.",
        default: "pnpm",
        enum: ["npm", "pnpm", "yarn", "bun"],
      },
    },
    entrypointCapabilityFloors: floors,
    generator: { module: "generator.mjs" },
    overlay: {
      directory: "repo-overlay",
      requiredFiles: [".parallel-slices/config.json", verifier],
    },
    verification: {
      module: `repo-overlay/${verifier}`,
      installedModule: verifier,
    },
    templates: { rootInstructions: "templates/root-AGENTS.md" },
    projectDocuments: [
      "docs/project/product-brief.md",
      "docs/project/architecture.md",
      "docs/project/security-and-privacy.md",
      "docs/project/testing-strategy.md",
      "docs/project/local-development.md",
      "docs/project/decision-log.md",
    ],
    controllers: {
      cursor: { initializeCommand: "/parallel-slices-init" },
      codex: { initializeCommand: "$parallel-slices-init" },
      "claude-code": { initializeCommand: "/parallel-slices-init" },
    },
    profiles: {
      default: config.defaultProfile,
      definitions: {
        [config.defaultProfile]: {
          description: `Default ${config.displayName} generation profile.`,
        },
      },
    },
  };
}

function generatorSource() {
  return `#!/usr/bin/env node

import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

export function generateArchitecture(context) {
  if (existsSync(context.target)) {
    throw new Error(\`generator target already exists: \${context.target}\`);
  }
  cpSync(join(context.packageRoot, "scaffold"), context.target, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
}
`;
}

function verifierSource(id) {
  return `#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function inspectArchitecture(root) {
  if (!existsSync(resolve(root, "package.json"))) {
    throw new Error("${id} requires package.json");
  }
  return { architecture: "${id}", status: "verified" };
}

const command = process.argv[2];
const target = resolve(process.argv[3] || process.cwd());
if (!["inspect", "foundation"].includes(command)) {
  console.error("usage: verify.mjs <inspect|foundation> [/absolute/path]");
  process.exitCode = 1;
} else {
  try {
    inspectArchitecture(target);
    console.log("${id} architecture verified");
  } catch (error) {
    console.error(\`${id} ARCHITECTURE FAILED: \${error.message}\`);
    process.exitCode = 1;
  }
}
`;
}

function generatorTestSource() {
  return `import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generateArchitecture } from "../generator.mjs";

test("generates the package scaffold into a new target", () => {
  const root = mkdtempSync(join(tmpdir(), "architecture-package-"));
  const target = join(root, "generated");
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  try {
    generateArchitecture({
      packageRoot,
      target,
    });
    assert.equal(existsSync(join(target, "package.json")), true);
    assert.throws(
      () =>
        generateArchitecture({
          packageRoot,
          target,
        }),
      /target already exists/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
`;
}

export function loadArchitectureAuthoringConfig(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    fail(`architecture authoring config does not exist: ${path}`);
  }
  let config;
  try {
    config = JSON.parse(readFileSync(resolved, "utf8"));
  } catch (error) {
    fail(`cannot read architecture authoring config: ${error.message}`);
  }
  return validateArchitectureAuthoringConfig(config);
}

export function createArchitecturePackage(target, config, validatePackage) {
  if (!isAbsolute(target)) fail("architecture package target must be absolute");
  if (typeof validatePackage !== "function") {
    fail("architecture package creation requires a conformance validator");
  }
  target = resolve(target);
  if (existsSync(target)) fail(`architecture package target exists: ${target}`);
  const parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  const stagingRoot = mkdtempSync(join(parent, ".parallel-slices-package-"));
  const staged = join(stagingRoot, basename(target));
  mkdirSync(staged);
  const manifest = architectureManifest(config);
  try {
    write(
      staged,
      "architecture.json",
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    write(
      staged,
      "package.json",
      `${JSON.stringify(
        {
          name: config.packageName,
          version: config.packageVersion,
          private: true,
          type: "module",
          exports: { "./architecture.json": "./architecture.json" },
          scripts: {
            test: "node --test tests/*.test.mjs",
          },
        },
        null,
        2,
      )}\n`,
    );
    write(staged, "generator.mjs", generatorSource());
    write(
      staged,
      `repo-overlay/scripts/architecture/${config.id}/verify.mjs`,
      verifierSource(config.id),
    );
    write(
      staged,
      "repo-overlay/.parallel-slices/config.json",
      `${JSON.stringify(qualityConfig(), null, 2)}\n`,
    );
    write(
      staged,
      "templates/root-AGENTS.md",
      `# ${config.displayName} project instructions

This repository uses the \`${config.id}\` architecture package. Preserve its
recorded profile, capabilities, quality floors, and verifier. Follow the
installed Parallel Slices planning, scope, review, Git, and safety contracts.
`,
    );
    write(
      staged,
      "scaffold/package.json",
      `${JSON.stringify(
        {
          name: `${config.id}-application`,
          version: "0.1.0",
          private: true,
          scripts: {
            build: "node --check index.mjs",
            "format:check": "node --check index.mjs",
            lint: "node --check index.mjs",
            typecheck: "node --check index.mjs",
            test: "node --test",
            "test:unit": "node --test",
            "test:integration": "node --test",
            "test:e2e": "node --test",
          },
        },
        null,
        2,
      )}\n`,
    );
    write(
      staged,
      "scaffold/index.mjs",
      "export const replaceWithYourArchitecture = true;\n",
    );
    write(
      staged,
      "scaffold/README.md",
      `# ${config.displayName}\n\nReplace this minimal scaffold with the reviewed architecture output.\n`,
    );
    write(staged, "tests/generator.test.mjs", generatorTestSource());
    write(
      staged,
      "README.md",
      `# ${config.displayName} architecture package

This package implements the Parallel Slices architecture-package contract.

Before publishing it:

1. Replace the minimal scaffold and verifier with the real architecture.
2. Declare every installed file in \`architecture.json\`.
3. Add behavior-focused generator, verifier, refusal, and installation tests.
4. Run Parallel Slices architecture-package validation and conformance tests.
5. Publish an exact immutable version without credentials or private examples.
`,
    );
    write(
      staged,
      "AGENTS.md",
      `# Architecture package contributor instructions

Keep architecture assumptions inside this package. Update the manifest,
generator, overlays, verifier, documentation, and tests together. Validate
inputs before writes, reject symlinks and path escape, generate atomically, and
never deploy or mutate production systems during generation or tests.
`,
    );
    validatePackage(staged);
    renameSync(staged, target);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
  return target;
}
