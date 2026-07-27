import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  globToRegExp,
  parseManifestText,
  pathMatches,
  validateScopeCoverage,
} from "../repo-overlay/scripts/parallel-slices/gate.mjs";
import {
  runWithCorepackShim,
  spawnCorepack,
  windowsSafeCommand,
} from "../repo-overlay/scripts/parallel-slices/corepack-runner.mjs";
import {
  assertSafeRelativePath,
  findControlPlanePattern,
} from "../repo-overlay/scripts/parallel-slices/scope-policy.mjs";
import {
  entrypointStepIds,
  assertBranchAllowed,
  detectPackageManager,
  includesHuskyCommand,
  packageManagerCommand,
  parsePackageManagerSpec,
  pipelineCapabilities,
  resolveEntrypoint,
  resolvePipeline,
  resolveSliceCompilation,
  validateQualityConfig,
} from "../repo-overlay/scripts/parallel-slices/project-quality.mjs";
import {
  assertPushTargetsAllowed,
  readGitHubActionsContext,
} from "../repo-overlay/scripts/parallel-slices/quality.mjs";
import { resolveBranchBase } from "../repo-overlay/scripts/parallel-slices/branch-policy.mjs";
import {
  classifyDockerContext,
  evaluateHookInstallation,
  isSupportedNodeMajor,
  parseNodePinMajor,
} from "../repo-overlay/scripts/parallel-slices/doctor.mjs";
import { parseArguments } from "../scripts/bootstrap-new.mjs";
import {
  corepackShimCommand,
  createTurboVersion,
  createTurboCommand,
  packageManagerInstallCommand,
} from "../architectures/nextjs-gcp-postgres/generator.mjs";
import {
  advanceProjectState,
  ensureProjectState,
  hasInitializationMarker,
} from "../repo-overlay/scripts/parallel-slices/project-state.mjs";
import {
  readScopeCorrection,
  validateScopeReplacement,
} from "../repo-overlay/scripts/parallel-slices/scope-correction.mjs";

const parallelSlicesRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const nextjsGcpPostgresRoot = resolve(
  parallelSlicesRoot,
  "architectures/nextjs-gcp-postgres",
);
const qualityConfigPath = resolve(
  nextjsGcpPostgresRoot,
  "repo-overlay/.parallel-slices/config.json",
);
const architectureManifest = JSON.parse(
  readFileSync(resolve(nextjsGcpPostgresRoot, "architecture.json"), "utf8"),
);
const entrypointCapabilityFloors =
  architectureManifest.entrypointCapabilityFloors;

test("requires the complete Turborepo quality stack", () => {
  const config = JSON.parse(readFileSync(qualityConfigPath, "utf8"));
  const checks = Object.values(config.steps);
  assert.deepEqual(
    checks.map((check) => check.name),
    [
      "Prettier check",
      "lint",
      "type check",
      "SQL security scan",
      "production build",
      "unit tests",
      "integration tests",
      "end-to-end tests",
      "Trivy repository scan",
    ],
  );
  assert.equal(config.version, 5);
  assert.equal(config.$schema, "./config.schema.json");
  assert.deepEqual(resolveSliceCompilation(config), {
    sizingStrategy: "throughput-balanced",
  });
  assert.equal(
    checks.some((check) => "required" in check),
    false,
  );
  assert.equal(config.steps.format.scripts.includes("format"), false);
  assert.deepEqual(resolvePipeline(config, "core"), [
    "format",
    "lint",
    "types",
    "sql-security",
    "build",
    "unit",
  ]);
  assert.deepEqual(
    resolveEntrypoint(config, "generatedBaseline").pipelineId,
    "generated-baseline",
  );
  assert.deepEqual(resolvePipeline(config, "generated-baseline"), [
    "lint",
    "types",
    "build",
  ]);
  assert.deepEqual(resolveEntrypoint(config, "preCommit").pipelineId, "core");
  assert.deepEqual(resolveEntrypoint(config, "prePush").pipelineId, "full");
  assert.deepEqual(resolveEntrypoint(config, "ci").pipelineId, "full");
  assert.deepEqual(
    resolveEntrypoint(config, "loop").pipelineFrom,
    "scopeManifest",
  );
  assert.deepEqual(
    resolvePipeline(config, config.entrypoints.preCommit.pipeline),
    resolvePipeline(config, "core"),
  );
  assert.deepEqual(
    resolvePipeline(config, config.entrypoints.prePush.pipeline),
    resolvePipeline(config, "full"),
  );
  assert.deepEqual(
    pipelineCapabilities(config, "full").sort(),
    [...entrypointCapabilityFloors.prePush].sort(),
  );
  assert.deepEqual(
    pipelineCapabilities(config, "generated-baseline").sort(),
    [...entrypointCapabilityFloors.generatedBaseline].sort(),
  );
  config.steps["unused-diagnostic"] = {
    name: "unused diagnostic",
    runner: "package-script",
    scripts: ["diagnostic:unused"],
    timeoutSeconds: 30,
    provides: ["diagnostic:unused"],
  };
  assert.equal(entrypointStepIds(config).includes("unused-diagnostic"), false);
  assert.doesNotThrow(() =>
    validateQualityConfig(config, entrypointCapabilityFloors),
  );
});

test("composes, replaces, and validates configurable quality pipelines", () => {
  const config = JSON.parse(readFileSync(qualityConfigPath, "utf8"));
  config.steps.license = {
    name: "license policy",
    runner: "package-script",
    scripts: ["security:licenses"],
    timeoutSeconds: 60,
    provides: ["security:licenses"],
  };
  config.pipelines.full.append.push("license");
  assert.equal(resolvePipeline(config, "full").at(-1), "license");
  config.pipelines["database-change"] = {
    extends: "full",
    append: ["license"],
  };
  config.pipelines.full.append.pop();
  assert.doesNotThrow(() =>
    validateQualityConfig(config, entrypointCapabilityFloors),
  );

  const replacement = structuredClone(config);
  replacement.pipelines["custom-push"] = {
    extends: "full",
    append: ["license"],
  };
  replacement.entrypoints.prePush.pipeline = "custom-push";
  assert.equal(resolvePipeline(replacement, "custom-push").at(-1), "license");
  assert.doesNotThrow(() =>
    validateQualityConfig(replacement, entrypointCapabilityFloors),
  );

  const unknown = structuredClone(config);
  unknown.pipelines.full.append.push("missing-step");
  assert.throws(
    () => validateQualityConfig(unknown, entrypointCapabilityFloors),
    /unknown step/,
  );

  const cycle = structuredClone(config);
  cycle.pipelines.core = { extends: "full", append: [] };
  assert.throws(
    () => validateQualityConfig(cycle, entrypointCapabilityFloors),
    /inheritance cycle/,
  );

  const incomplete = structuredClone(config);
  incomplete.pipelines.core.steps = incomplete.pipelines.core.steps.filter(
    (id) => id !== "build",
  );
  assert.throws(
    () => validateQualityConfig(incomplete, entrypointCapabilityFloors),
    /missing capabilities.*build/,
  );

  const unsafe = structuredClone(config);
  unsafe.steps.license.name = "license\nforged output";
  assert.throws(
    () => validateQualityConfig(unsafe, entrypointCapabilityFloors),
    /requires a name/,
  );

  const obsoleteOptionalStep = structuredClone(config);
  obsoleteOptionalStep.steps.build.required = false;
  assert.throws(
    () =>
      validateQualityConfig(obsoleteOptionalStep, entrypointCapabilityFloors),
    /removed field required/,
  );

  const weakenedPush = structuredClone(config);
  weakenedPush.pipelines["weak"] = { steps: ["trivy"] };
  weakenedPush.entrypoints.prePush.pipeline = "weak";
  assert.throws(
    () => validateQualityConfig(weakenedPush, entrypointCapabilityFloors),
    /entrypoints\.prePush is missing capabilities/,
  );

  const renamedDefaults = structuredClone(config);
  renamedDefaults.pipelines.baseline = renamedDefaults.pipelines.core;
  delete renamedDefaults.pipelines.core;
  renamedDefaults.pipelines.full.extends = "baseline";
  renamedDefaults.entrypoints.preCommit.pipeline = "baseline";
  assert.doesNotThrow(() =>
    validateQualityConfig(renamedDefaults, entrypointCapabilityFloors),
  );
});

test("quality configuration accepts optional architecture-defined workspace metadata", () => {
  const config = JSON.parse(readFileSync(qualityConfigPath, "utf8"));
  config.workspaceMode = "single-project";
  assert.doesNotThrow(() =>
    validateQualityConfig(config, entrypointCapabilityFloors),
  );
  config.workspaceMode = "";
  assert.throws(
    () => validateQualityConfig(config, entrypointCapabilityFloors),
    /workspaceMode must be a non-empty architecture-defined string/,
  );
});

test("validates architecture-defaulted and user-selected slice sizing", () => {
  const config = JSON.parse(readFileSync(qualityConfigPath, "utf8"));
  config.sliceCompilation.sizingStrategy = "isolation-first";
  assert.deepEqual(resolveSliceCompilation(config), {
    sizingStrategy: "isolation-first",
  });
  assert.doesNotThrow(() =>
    validateQualityConfig(config, entrypointCapabilityFloors),
  );

  config.sliceCompilation.sizingStrategy = "fastest-possible";
  assert.throws(
    () => validateQualityConfig(config, entrypointCapabilityFloors),
    /sizingStrategy must be one of: isolation-first, throughput-balanced/,
  );

  config.sliceCompilation = {
    sizingStrategy: "throughput-balanced",
    targetMinutes: 30,
  };
  assert.throws(
    () => validateQualityConfig(config, entrypointCapabilityFloors),
    /sliceCompilation has unknown fields: targetMinutes/,
  );

  delete config.sliceCompilation;
  assert.throws(
    () => validateQualityConfig(config, entrypointCapabilityFloors),
    /sliceCompilation must be an object/,
  );
});

test("deploys only a successful main-branch push or an approved main dispatch", () => {
  const workflow = readFileSync(
    resolve(
      nextjsGcpPostgresRoot,
      "repo-overlay/.github/workflows/deploy-cloud-run.yml",
    ),
    "utf8",
  );
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /pull_request_target/);
});

test("CI installs the pinned Trivy release and runs the configured pipeline", () => {
  const workflow = readFileSync(
    resolve(
      parallelSlicesRoot,
      "architectures/nextjs-gcp-postgres/repo-overlay/.github/workflows/quality.yml",
    ),
    "utf8",
  );
  assert.match(workflow, /aquasecurity\/setup-trivy@[0-9a-f]{40}/);
  assert.match(workflow, /< \.trivy-version/);
  assert.match(workflow, /quality\.mjs entrypoint ci/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.doesNotMatch(workflow, /quality\.mjs ci-core/);
  assert.doesNotMatch(workflow, /quality\.mjs ci-full/);
  assert.doesNotMatch(workflow, /corepack enable/);
});

test("derives trusted CI branch and base values from GitHub event payloads", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-github-event-"));
  try {
    const eventPath = join(root, "event.json");
    writeFileSync(
      eventPath,
      JSON.stringify({
        pull_request: {
          head: { ref: "feature/example" },
          base: { sha: "1".repeat(40) },
        },
      }),
    );
    assert.deepEqual(
      readGitHubActionsContext({
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: eventPath,
      }),
      {
        branch: "feature/example",
        base: "1".repeat(40),
        protectedTarget: false,
      },
    );
    writeFileSync(
      eventPath,
      JSON.stringify({ ref: "refs/heads/main", before: "2".repeat(40) }),
    );
    assert.deepEqual(
      readGitHubActionsContext({
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "push",
        GITHUB_EVENT_PATH: eventPath,
      }),
      {
        branch: "main",
        base: "2".repeat(40),
        protectedTarget: true,
      },
    );
    assert.throws(
      () =>
        readGitHubActionsContext({
          GITHUB_ACTIONS: "true",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_EVENT_PATH: eventPath,
        }),
      /unsupported GitHub Actions event/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Husky delegates to policy-aware configured entry points", () => {
  const preCommit = readFileSync(
    resolve(parallelSlicesRoot, "repo-overlay/.husky/pre-commit"),
    "utf8",
  );
  const prePush = readFileSync(
    resolve(parallelSlicesRoot, "repo-overlay/.husky/pre-push"),
    "utf8",
  );
  assert.match(preCommit, /quality\.mjs entrypoint preCommit/);
  assert.match(prePush, /quality\.mjs entrypoint prePush --remote/);
  assert.doesNotMatch(preCommit, /quality\.mjs pipeline/);
  assert.doesNotMatch(prePush, /quality\.mjs pipeline/);
});

test("enforces protected and convention-compliant branch names", () => {
  const config = JSON.parse(readFileSync(qualityConfigPath, "utf8"));
  assert.doesNotThrow(() =>
    assertBranchAllowed("feature/add-settings", config),
  );
  assert.throws(() => assertBranchAllowed("main", config), /forbidden/);
  assert.throws(
    () => assertBranchAllowed("feature/Add_Settings", config),
    /does not match/,
  );
  assert.doesNotThrow(() =>
    assertBranchAllowed("dependabot/npm_and_yarn/example", config, {
      allowAutomation: true,
    }),
  );
});

test("recognizes Husky in a composed lifecycle script", () => {
  assert.equal(includesHuskyCommand("husky"), true);
  assert.equal(includesHuskyCommand("generate && husky"), true);
  assert.equal(includesHuskyCommand("echo husky"), false);
});

test("requires an exact supported package-manager specification", () => {
  assert.deepEqual(parsePackageManagerSpec("pnpm@10.15.1"), {
    manager: "pnpm",
    spec: "pnpm@10.15.1",
    version: "10.15.1",
  });
  assert.throws(() => parsePackageManagerSpec("pnpm@latest"), /exact version/);
  assert.throws(() => parsePackageManagerSpec("deno@2.0.0"), /exact version/);
});

test("runs pnpm and Yarn through Corepack without requiring global shims", () => {
  const runner = resolve(
    parallelSlicesRoot,
    "repo-overlay/scripts/parallel-slices/corepack-runner.mjs",
  );
  assert.deepEqual(packageManagerCommand("pnpm", ["run", "lint"]), [
    process.execPath,
    [runner, "pnpm", "run", "lint"],
  ]);
  assert.deepEqual(packageManagerCommand("yarn", ["--version"]), [
    process.execPath,
    [runner, "yarn", "--version"],
  ]);
  assert.deepEqual(packageManagerCommand("npm", ["ci"]), ["npm", ["ci"]]);
});

test("provides and cleans an isolated Corepack shim for child processes", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-corepack-runner-"));
  let shimDirectory;
  const calls = [];
  try {
    assert.equal(
      runWithCorepackShim("pnpm", ["run", "lint"], {
        environment: { PATH: "/example/bin" },
        temporaryDirectory: root,
        runCommand: (command, args, options) => {
          calls.push([command, args]);
          assert.equal(command, "corepack");
          if (args[0] === "enable") {
            shimDirectory = args[3];
            assert.equal(existsSync(shimDirectory), true);
          } else {
            assert.deepEqual(args, ["pnpm", "run", "lint"]);
            assert.equal(options.env.PATH.split(delimiter)[0], shimDirectory);
          }
          return { signal: null, status: 0 };
        },
      }),
      0,
    );
    assert.deepEqual(calls[0][1].slice(0, 3), [
      "enable",
      "pnpm",
      "--install-directory",
    ]);
    assert.equal(calls.length, 2);
    assert.equal(existsSync(shimDirectory), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runs Corepack through cmd.exe on Windows without shell mode", () => {
  const commandOptions = {
    cwd: "C:\\example",
    env: { PATH: "C:\\Windows\\System32" },
    stdio: "inherit",
  };
  const calls = [];
  const result = spawnCorepack(
    (command, args, options) => {
      calls.push({ command, args, options });
      return { signal: null, status: 0 };
    },
    ["pnpm", "--version"],
    commandOptions,
    "win32",
    { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
  );
  assert.equal(result.status, 0);
  assert.deepEqual(calls, [
    {
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "corepack.cmd", "pnpm", "--version"],
      options: commandOptions,
    },
  ]);
  assert.equal(Object.hasOwn(commandOptions, "shell"), false);
});

test("uses the Windows Corepack command for shim setup and manager execution", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-corepack-win32-"));
  const calls = [];
  try {
    assert.equal(
      runWithCorepackShim("pnpm", ["--version"], {
        environment: {
          ComSpec: "C:\\Windows\\System32\\cmd.exe",
          PATH: "C:\\Windows\\System32",
        },
        platform: "win32",
        temporaryDirectory: root,
        runCommand: (command, args, options) => {
          calls.push({ command, args, options });
          return { signal: null, status: 0 };
        },
      }),
      0,
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0].command, "C:\\Windows\\System32\\cmd.exe");
    assert.deepEqual(calls[0].args.slice(0, 7), [
      "/d",
      "/s",
      "/c",
      "corepack.cmd",
      "enable",
      "pnpm",
      "--install-directory",
    ]);
    assert.deepEqual(calls[1].args, [
      "/d",
      "/s",
      "/c",
      "corepack.cmd",
      "pnpm",
      "--version",
    ]);
    assert.equal(Object.hasOwn(calls[0].options, "shell"), false);
    assert.equal(Object.hasOwn(calls[1].options, "shell"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runs npm and bun through cmd.exe on Windows without shell mode", () => {
  assert.deepEqual(
    windowsSafeCommand("npm", ["run", "lint"], "win32", {
      ComSpec: "C:\\Windows\\System32\\cmd.exe",
    }),
    [
      "C:\\Windows\\System32\\cmd.exe",
      ["/d", "/s", "/c", "npm", "run", "lint"],
    ],
  );
  assert.deepEqual(windowsSafeCommand("npm", ["ci"], "win32", {}), [
    "cmd.exe",
    ["/d", "/s", "/c", "npm", "ci"],
  ]);
  assert.deepEqual(windowsSafeCommand("npm", ["ci"], "linux", {}), [
    "npm",
    ["ci"],
  ]);
  assert.deepEqual(
    packageManagerCommand("npm", ["run", "unit"], "win32", {
      ComSpec: "C:\\Windows\\System32\\cmd.exe",
    }),
    [
      "C:\\Windows\\System32\\cmd.exe",
      ["/d", "/s", "/c", "npm", "run", "unit"],
    ],
  );
  assert.deepEqual(packageManagerCommand("npm", ["--version"], "win32", {}), [
    "cmd.exe",
    ["/d", "/s", "/c", "npm", "--version"],
  ]);
  assert.deepEqual(
    packageManagerCommand("bun", ["install", "--frozen-lockfile"], "win32", {}),
    ["cmd.exe", ["/d", "/s", "/c", "bun", "install", "--frozen-lockfile"]],
  );
  assert.deepEqual(packageManagerCommand("npm", ["ci"], "darwin", {}), [
    "npm",
    ["ci"],
  ]);
});

test("repository containment guards use the platform path separator", () => {
  for (const path of [
    "repo-overlay/scripts/parallel-slices/doctor.mjs",
    "repo-overlay/scripts/parallel-slices/architecture-profile.mjs",
    "scripts/audit-repository.mjs",
  ]) {
    const source = readFileSync(resolve(parallelSlicesRoot, path), "utf8");
    assert.match(source, /startsWith\(`\$\{[^}]+\}\$\{sep\}`\)/);
    assert.doesNotMatch(source, /startsWith\(`\$\{[^}]*root[^}]*\}\/`\)/i);
  }
});

test("cleans the isolated shim when Corepack setup fails", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-corepack-failure-"));
  let shimDirectory;
  let calls = 0;
  try {
    assert.throws(
      () =>
        runWithCorepackShim("yarn", ["--version"], {
          temporaryDirectory: root,
          runCommand: (_command, args) => {
            calls += 1;
            shimDirectory = args[3];
            return { signal: null, status: 1 };
          },
        }),
      /Corepack shim setup failed with exit code 1/,
    );
    assert.equal(calls, 1);
    assert.equal(existsSync(shimDirectory), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a lockfile that conflicts with the declared package manager", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-manager-"));
  try {
    writeFileSync(
      join(root, "package.json"),
      `${JSON.stringify({ packageManager: "pnpm@10.15.1" })}\n`,
    );
    writeFileSync(join(root, "package-lock.json"), "{}\n");
    assert.throws(
      () => detectPackageManager(root),
      /conflicting lockfiles.*npm/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a direct push to a protected remote branch", () => {
  const config = JSON.parse(readFileSync(qualityConfigPath, "utf8"));
  const sha = "1".repeat(40);
  const zero = "0".repeat(40);
  assert.throws(
    () =>
      assertPushTargetsAllowed(
        `refs/heads/feature/example ${sha} refs/heads/main ${zero}`,
        config,
      ),
    /protected branch/,
  );
  assert.doesNotThrow(() =>
    assertPushTargetsAllowed(
      `refs/heads/feature/example ${sha} refs/heads/feature/example ${zero}`,
      config,
    ),
  );
});

test("resolves the pre-push base from the remote default branch", () => {
  const parent = mkdtempSync(join(tmpdir(), "parallel-slices-branch-base-"));
  const root = join(parent, "project");
  const remote = join(parent, "remote.git");
  const git = (args, cwd = root) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  try {
    mkdirSync(root);
    git(["init", "--bare", "--initial-branch=main", remote], parent);
    git(["init", "-b", "main"]);
    writeFileSync(join(root, "README.md"), "# Example\n");
    git(["add", "README.md"]);
    git([
      "-c",
      "user.name=Gate Test",
      "-c",
      "user.email=gate@example.test",
      "commit",
      "-m",
      "initialize",
    ]);
    const mainCommit = git(["rev-parse", "HEAD"]);
    git(["remote", "add", "origin", remote]);
    git(["push", "-u", "origin", "main"]);
    git(["remote", "set-head", "origin", "main"]);
    git(["switch", "-c", "feature/example"]);
    writeFileSync(join(root, "feature.txt"), "approved change\n");
    git(["add", "feature.txt"]);
    git([
      "-c",
      "user.name=Gate Test",
      "-c",
      "user.email=gate@example.test",
      "commit",
      "-m",
      "add feature",
    ]);
    const config = JSON.parse(readFileSync(qualityConfigPath, "utf8"));
    assert.equal(
      resolveBranchBase(root, config, { remote: "origin" }),
      mainCommit,
    );
    assert.throws(
      () => resolveBranchBase(root, config, { remote: "missing" }),
      /cannot determine the branch policy base/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("supports maintained Node.js LTS lines only", () => {
  assert.equal(isSupportedNodeMajor(22), true);
  assert.equal(isSupportedNodeMajor(24), true);
  assert.equal(isSupportedNodeMajor(23), false);
  assert.equal(isSupportedNodeMajor(20), false);
});

test("parses direct, nvm, and asdf-style Node.js pins", () => {
  assert.equal(parseNodePinMajor("24\n", ".node-version"), 24);
  assert.equal(parseNodePinMajor("v22.22.0\n", ".nvmrc"), 22);
  assert.equal(parseNodePinMajor("nodejs 24.4.1\n", ".tool-versions"), 24);
  assert.equal(parseNodePinMajor("lts/*\n", ".nvmrc"), null);
});

test("classifies supported and alternative desktop container contexts", () => {
  assert.equal(classifyDockerContext("desktop-linux"), "docker-desktop");
  assert.equal(classifyDockerContext("rancher-desktop"), "rancher-desktop");
  assert.equal(classifyDockerContext("default"), "other");
});

test("reports Husky hook installation as an actionable doctor finding", () => {
  assert.deepEqual(evaluateHookInstallation(".husky/_", []), {
    ok: true,
    message: "Husky hooks configured at .husky/_",
  });
  const unconfigured = evaluateHookInstallation("", [".husky/_/pre-commit"]);
  assert.equal(unconfigured.ok, false);
  assert.match(unconfigured.message, /core\.hooksPath is not configured/);
  assert.match(unconfigured.message, /package manager install/);
  const foreign = evaluateHookInstallation(".githooks", []);
  assert.equal(foreign.ok, false);
  assert.match(foreign.message, /core\.hooksPath is \.githooks/);
  const incomplete = evaluateHookInstallation(".husky/_", [
    ".husky/_/pre-push",
  ]);
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.message, /\.husky\/_\/pre-push/);
});

test("detects bootstrap instructions that AI must replace", () => {
  assert.equal(
    hasInitializationMarker("Status: INITIALIZATION_REQUIRED"),
    true,
  );
  assert.equal(hasInitializationMarker("Status: initialized"), false);
});

test("project stages advance sequentially and never move backward", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-state-"));
  try {
    mkdirSync(join(root, ".parallel-slices"));
    assert.equal(ensureProjectState(root).stage, "initialization-required");
    assert.throws(
      () => advanceProjectState(root, "foundation-ready"),
      /cannot skip/,
    );
    const outside = join(root, "outside-state.json");
    const temporary = join(root, ".parallel-slices/project-state.json.tmp");
    writeFileSync(outside, "outside remains unchanged\n");
    symlinkSync(outside, temporary);
    assert.equal(
      advanceProjectState(root, "contract-ready").stage,
      "contract-ready",
    );
    assert.equal(readFileSync(outside, "utf8"), "outside remains unchanged\n");
    unlinkSync(temporary);
    assert.equal(
      advanceProjectState(root, "foundation-ready").stage,
      "foundation-ready",
    );
    assert.throws(
      () => advanceProjectState(root, "contract-ready"),
      /cannot move backward/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("root package script forwards bootstrap arguments and rejects unsafe targets", () => {
  assert.throws(
    () =>
      execFileSync("npm", ["run", "bootstrap", "--", "relative-project"], {
        cwd: parallelSlicesRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(
        error.stderr,
        /BOOTSTRAP FAILED: target must be an absolute path/,
      );
      return true;
    },
  );
});

test("builds safe create-turbo commands and rejects relative targets", () => {
  assert.deepEqual(createTurboCommand("pnpm", "/tmp/example"), [
    "corepack",
    [
      "pnpm",
      "dlx",
      `create-turbo@${createTurboVersion}`,
      "/tmp/example",
      "--package-manager",
      "pnpm",
      "--skip-install",
      "--no-git",
    ],
  ]);
  assert.deepEqual(packageManagerInstallCommand("pnpm"), [
    "corepack",
    ["pnpm", "install", "--no-frozen-lockfile"],
  ]);
  assert.deepEqual(packageManagerInstallCommand("npm"), ["npm", ["install"]]);
  assert.deepEqual(corepackShimCommand("pnpm", "/tmp/corepack-bin"), [
    "corepack",
    ["enable", "pnpm", "--install-directory", "/tmp/corepack-bin"],
  ]);
  assert.equal(corepackShimCommand("npm", "/tmp/corepack-bin"), null);
  assert.match(createTurboVersion, /^\d+\.\d+\.\d+$/);
  const parsed = parseArguments([
    "--default-controller",
    "codex",
    "--package-manager",
    "npm",
    "/tmp/example",
  ]);
  assert.equal(parsed.architectureId, "nextjs-gcp-postgres");
  assert.equal(parsed.defaultController, "codex");
  assert.deepEqual(parsed.architectureOptions, { "package-manager": "npm" });
  assert.equal(parsed.target, "/tmp/example");
  assert.throws(() => parseArguments(["relative-project"]), /absolute path/);
  assert.throws(
    () => parseArguments(["--agent", "unknown", "/tmp/example"]),
    /agent must be one of/,
  );
  assert.throws(
    () => parseArguments(["--package-manager", "unknown", "/tmp/example"]),
    /package-manager/,
  );
  const configured = parseArguments([
    "--config",
    resolve(
      parallelSlicesRoot,
      "examples/create/nextjs-gcp-external-api-only.json",
    ),
    "/tmp/external-api-example",
  ]);
  assert.equal(configured.architecture.profile, "external-api-only");
  assert.deepEqual(configured.architectureOptions, {
    "package-manager": "pnpm",
  });
  assert.throws(
    () =>
      parseArguments([
        "--config",
        resolve(parallelSlicesRoot, "examples/create/nextjs-gcp-postgres.json"),
        "--package-manager",
        "npm",
        "/tmp/example",
      ]),
    /cannot be combined/,
  );
});

test("parses a complete scope manifest", () => {
  const parsed = parseManifestText(`
version=1
plan=docs/plans/example.md
slice=1.1
requirements=R1,R2
observable=The user can save settings.
minimum_stage=foundation-ready
release_notes=developer
gate=full
allow=app/settings/**
allow=docs/plans/example.md
  `);

  assert.equal(parsed.slice, "1.1");
  assert.deepEqual(parsed.allow, ["app/settings/**", "docs/plans/example.md"]);
});

test("rejects duplicate metadata", () => {
  assert.throws(
    () => parseManifestText("version=1\nversion=1\nallow=app/**"),
    /duplicate scope manifest key/,
  );
});

test("validates complete compiled scope coverage", () => {
  const coverage = validateScopeCoverage(
    {
      allow: [
        "app/example/route.ts",
        "packages/shared/example.schema.ts",
        "tests/example.test.ts",
      ],
      coverage: [
        "entrypoint|change|app/example/route.ts|The route invokes the approved behavior.",
        "contract|change|packages/shared/example.schema.ts|The schema represents the approved empty result.",
        "consumer|preserve|app/example/client.ts|The existing client contract remains compatible.",
        "data-side-effect|not-applicable|none|The behavior does not write durable data.",
        "test|change|tests/example.test.ts|The test proves success and refusal outcomes.",
        "operations|not-applicable|none|The behavior has no operational or release effect.",
      ],
    },
    { required: true },
  );

  assert.equal(coverage.length, 6);
  assert.equal(coverage[1].surface, "contract");
  assert.equal(coverage[1].disposition, "change");
});

test("rejects incomplete or inconsistent compiled scope coverage", () => {
  const complete = {
    allow: ["app/example/route.ts"],
    coverage: [
      "entrypoint|change|app/example/route.ts|The route invokes the approved behavior.",
      "contract|not-applicable|none|The behavior has no shared or public contract.",
      "consumer|not-applicable|none|No downstream consumer observes this behavior.",
      "data-side-effect|not-applicable|none|The behavior does not write durable data.",
      "test|not-applicable|none|This synthetic fixture has no executable behavior.",
      "operations|not-applicable|none|The behavior has no operational or release effect.",
    ],
  };

  assert.throws(
    () =>
      validateScopeCoverage(
        { allow: complete.allow, coverage: [] },
        { required: true },
      ),
    /scope coverage is required/,
  );
  assert.throws(
    () =>
      validateScopeCoverage({
        ...complete,
        coverage: complete.coverage.filter(
          (entry) => !entry.startsWith("contract|"),
        ),
      }),
    /missing impact surfaces: contract/,
  );
  assert.throws(
    () =>
      validateScopeCoverage({
        ...complete,
        coverage: complete.coverage.map((entry) =>
          entry.startsWith("contract|")
            ? "contract|change|packages/shared/result.ts|The result contract must change."
            : entry,
        ),
      }),
    /changed scope coverage path is outside worker allow scope/,
  );
  assert.throws(
    () =>
      validateScopeCoverage({
        ...complete,
        coverage: complete.coverage.map((entry) =>
          entry.startsWith("consumer|")
            ? "consumer|preserve|app/example/route.ts|The worker must preserve this existing consumer."
            : entry,
        ),
      }),
    /preserved scope coverage path must remain outside worker allow scope/,
  );
  assert.throws(
    () =>
      validateScopeCoverage({
        ...complete,
        allow: [...complete.allow, "docs/example.md"],
      }),
    /worker allow entries lack changed scope coverage: docs\/example.md/,
  );
});

test("rejects preservation coverage for a path that does not exist", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-coverage-"));
  try {
    assert.throws(
      () =>
        validateScopeCoverage(
          {
            allow: ["app/example/route.ts"],
            coverage: [
              "entrypoint|change|app/example/route.ts|The route invokes the approved behavior.",
              "contract|not-applicable|none|The behavior has no shared or public contract.",
              "consumer|preserve|app/example/missing-client.ts|The existing client must remain compatible.",
              "data-side-effect|not-applicable|none|The behavior does not write durable data.",
              "test|not-applicable|none|This synthetic fixture has no executable behavior.",
              "operations|not-applicable|none|The behavior has no operational or release effect.",
            ],
          },
          { root },
        ),
      /preserved scope coverage path does not exist/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scope corrections add exact paths without changing the approved outcome", () => {
  const previousPath = "docs/plans/scopes/example/1.1.scope";
  const replacementPath = "docs/plans/scopes/example/1.1-revision-2.scope";
  const correctionPath = "docs/plans/corrections/example/1.1-revision-2.json";
  const previous = {
    version: "2",
    revision: "1",
    plan: "docs/plans/example.md",
    state: "docs/plans/loop-runs/example-state.json",
    slice: "1.1",
    requirements: "R1",
    depends_on: "none",
    observable: "The approved empty result is represented.",
    minimum_stage: "contract-ready",
    release_notes: "none",
    gate: "core",
    parallel: "allowed",
    parallel_reason: undefined,
    commit: "fix(contract): represent the empty result",
    review: "docs/plans/reviews/example/1.1.json",
    allow: ["app/route.ts"],
    lock: [],
    coverage: [
      "entrypoint|change|app/route.ts|The route returns the approved result.",
      "contract|not-applicable|none|The initial compiler missed the contract.",
      "consumer|preserve|app/client.ts|The current client remains compatible.",
      "data-side-effect|not-applicable|none|The result performs no durable write.",
      "test|not-applicable|none|The initial compiler missed the contract test.",
      "operations|not-applicable|none|The result has no operational action.",
    ],
    coordinate: [
      "docs/plans/loop-runs/example-state.json",
      "docs/plans/reviews/example/1.1.json",
      "docs/plans/reviews/example/1.1.md",
    ],
  };
  const replacement = {
    ...previous,
    revision: "2",
    supersedes: previousPath,
    correction: correctionPath,
    review: "docs/plans/reviews/example/1.1-revision-2.json",
    allow: [
      ...previous.allow,
      "packages/shared/result.ts",
      "packages/shared/result.test.ts",
    ],
    coverage: [
      previous.coverage[0],
      "contract|change|packages/shared/result.ts|The approved result requires the shared contract.",
      previous.coverage[2],
      previous.coverage[3],
      "test|change|packages/shared/result.test.ts|The contract test proves the approved result.",
      previous.coverage[5],
    ],
    coordinate: [
      previous.state,
      "docs/plans/reviews/example/1.1-revision-2.json",
      "docs/plans/reviews/example/1.1-revision-2.md",
    ],
  };
  const record = {
    plan: previous.plan,
    planCommit: "a".repeat(40),
    slice: previous.slice,
    previousManifest: previousPath,
    replacementManifest: replacementPath,
    addedAllow: replacement.allow.slice(1),
  };
  const options = {
    previous,
    previousPath,
    replacement,
    replacementPath,
    correctionPath,
    record,
    state: { planCommit: record.planCommit },
  };
  assert.deepEqual(validateScopeReplacement(options).addedAllow, [
    "packages/shared/result.ts",
    "packages/shared/result.test.ts",
  ]);
  assert.throws(
    () =>
      validateScopeReplacement({
        ...options,
        replacement: { ...replacement, requirements: "R1,R2" },
      }),
    /cannot change manifest requirements/,
  );
  assert.throws(
    () =>
      validateScopeReplacement({
        ...options,
        replacement: {
          ...replacement,
          coverage: replacement.coverage.filter(
            (entry) => !entry.startsWith("entrypoint|"),
          ),
        },
      }),
    /may replace only a not-applicable surface/,
  );
  for (const controlPath of [
    ".parallel-slices/review.json",
    ".parallel-slices/runtime/workers/example.json",
    ".husky/pre-commit",
    ".github/workflows/quality.yml",
    "scripts/parallel-slices/gate.mjs",
    "docs/plans/scopes/example/1.2.scope",
  ]) {
    assert.throws(
      () =>
        validateScopeReplacement({
          ...options,
          replacement: {
            ...replacement,
            allow: [...previous.allow, controlPath],
          },
          record: { ...record, addedAllow: [controlPath] },
        }),
      new RegExp(
        `cannot add a planning control path: ${controlPath.replaceAll(".", "\\.").replaceAll("/", "\\/")}`,
      ),
    );
  }
});

test("worker manifests cannot claim orchestration control-plane paths", () => {
  assert.equal(
    findControlPlanePattern(["app/example/**", "tests/example/**"]),
    undefined,
  );
  assert.equal(findControlPlanePattern(["scripts/db/**"]), undefined);
  assert.equal(
    findControlPlanePattern([".parallel-slices/review.json"]),
    ".parallel-slices/review.json",
  );
  assert.equal(findControlPlanePattern([".husky/**"]), ".husky/**");
  assert.equal(
    findControlPlanePattern(["app/**", ".github/workflows/deploy.yml"]),
    ".github/workflows/deploy.yml",
  );
  assert.equal(
    findControlPlanePattern([".git*/workflows/deploy.yml"]),
    ".git*/workflows/deploy.yml",
  );
  assert.equal(
    findControlPlanePattern(["scripts/parallel-slices/gate.mjs"]),
    "scripts/parallel-slices/gate.mjs",
  );
  assert.equal(findControlPlanePattern(["scripts/**"]), "scripts/**");
});

test("scope correction records refuse false attestations and wildcard expansion", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-correction-"));
  const path = "docs/plans/corrections/example/1.1-revision-2.json";
  const absolute = join(root, path);
  try {
    mkdirSync(dirname(absolute), { recursive: true });
    const record = {
      $schema: "../../../../.parallel-slices/scope-correction.schema.json",
      version: 1,
      plan: "docs/plans/example.md",
      planCommit: "a".repeat(40),
      slice: "1.1",
      previousManifest: "docs/plans/scopes/example/1.1.scope",
      replacementManifest: "docs/plans/scopes/example/1.1-revision-2.scope",
      reason: "Repository inspection found one omitted contract path.",
      discoveryEvidence: ["The current schema contradicts requirement R1."],
      addedAllow: ["packages/shared/**"],
      attestations: {
        requirementsUnchanged: true,
        observableUnchanged: true,
        subsystemsUnchanged: true,
        nonGoalsPreserved: true,
        securityAndPrivacyPolicyUnchanged: true,
        migrationUnchanged: true,
        deploymentAndExternalActionsUnchanged: true,
      },
    };
    writeFileSync(absolute, `${JSON.stringify(record, null, 2)}\n`);
    assert.throws(
      () => readScopeCorrection(root, path),
      /must use exact paths/,
    );
    record.addedAllow = ["packages/shared/result.ts"];
    record.attestations.migrationUnchanged = false;
    writeFileSync(absolute, `${JSON.stringify(record, null, 2)}\n`);
    assert.throws(
      () => readScopeCorrection(root, path),
      /attestation must be true: migrationUnchanged/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("supports Next.js route groups and dynamic segments", () => {
  assert.equal(
    pathMatches("app/(dashboard)/accounts/[accountId]/page.tsx", [
      "app/(dashboard)/accounts/**",
    ]),
    true,
  );
  assert.equal(
    pathMatches("app/api/accounts/[accountId]/route.ts", [
      "app/(dashboard)/**",
    ]),
    false,
  );
});

test("single star does not cross a directory boundary", () => {
  const pattern = globToRegExp("components/*.tsx");
  assert.equal(pattern.test("components/Button.tsx"), true);
  assert.equal(pattern.test("components/forms/Button.tsx"), false);
});

test("rejects repository-wide and traversal patterns", () => {
  assert.throws(() => globToRegExp("**"), /catchalls are forbidden/);
  assert.throws(() => globToRegExp("../app/**"), /unsafe path segment/);
});

test("rejects Windows drive-qualified paths as repository-relative", () => {
  assert.throws(() => globToRegExp("C:/evil/**"), /repository-relative/);
  assert.throws(
    () => assertSafeRelativePath("C:/evil", "test path"),
    /repository-relative/,
  );
  assert.throws(
    () => assertSafeRelativePath("c:evil", "test path"),
    /repository-relative/,
  );
  assert.doesNotThrow(() =>
    assertSafeRelativePath("app/c:file.ts", "test path"),
  );
});
