#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadArchitecturePackage } from "./architecture-package.mjs";
import { readArchitectureProfile } from "../repo-overlay/scripts/parallel-slices/architecture-profile.mjs";
import {
  assertBranchAllowed,
  detectPackageManager,
  entrypointStepIds,
  includesHuskyCommand,
  validateQualityConfig,
} from "../repo-overlay/scripts/parallel-slices/project-quality.mjs";
import { validateReviewConfig } from "../repo-overlay/scripts/parallel-slices/review-config.mjs";

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  let architectureId = "nextjs-gcp-postgres";
  let architecturePackage;
  let architectureProfile;
  let strict = false;
  let target;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--strict") strict = true;
    else if (argument === "--architecture") {
      architectureId = argv[index + 1];
      if (!architectureId) fail("--architecture requires a value");
      index += 1;
    } else if (argument === "--architecture-package") {
      architecturePackage = argv[index + 1];
      if (!architecturePackage) {
        fail("--architecture-package requires a value");
      }
      index += 1;
    } else if (argument === "--architecture-profile") {
      architectureProfile = argv[index + 1];
      if (!architectureProfile) {
        fail("--architecture-profile requires a value");
      }
      index += 1;
    } else if (!target) target = argument;
    else fail(`unexpected argument: ${argument}`);
  }
  return {
    architectureId,
    architecturePackage,
    architectureProfile,
    strict,
    target: resolve(target || "."),
  };
}

export function inspectTarget(options) {
  const target = options.target;
  const strict = Boolean(options.strict);
  const architecture =
    options.architecture ||
    loadArchitecturePackage(
      options.architecturePackage || options.architectureId,
      undefined,
      options.architectureProfile,
    );
  let failed = false;

  function problem(message, required = true) {
    const label = required || strict ? "error" : "warning";
    console.error(`${label}: ${message}`);
    if (required || strict) failed = true;
  }

  function readJson(path) {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      problem(`cannot read ${path}: ${error.message}`);
      return null;
    }
  }

  function packageFiles(directory, depth = 0) {
    if (depth > 5) return [];
    const ignored = new Set([
      ".git",
      ".next",
      ".turbo",
      "node_modules",
      "dist",
      "build",
      "coverage",
    ]);
    const files = [];
    for (const entry of readdirSync(directory)) {
      if (ignored.has(entry)) continue;
      const path = join(directory, entry);
      if (!statSync(path).isDirectory()) continue;
      const packagePath = join(path, "package.json");
      if (existsSync(packagePath)) files.push(packagePath);
      files.push(...packageFiles(path, depth + 1));
    }
    return files;
  }

  const rootPackagePath = join(target, "package.json");
  if (!existsSync(rootPackagePath)) {
    problem(
      "package.json is missing; the Parallel Slices control plane requires a package-script adapter",
    );
  }
  if (!existsSync(join(target, "AGENTS.md"))) {
    problem(
      "root AGENTS.md is missing; setup creates the selected architecture template",
      false,
    );
  }

  const rootPackage = existsSync(rootPackagePath)
    ? readJson(rootPackagePath)
    : null;
  const packagePaths = existsSync(target)
    ? [rootPackagePath, ...packageFiles(target)]
    : [];
  const packages = packagePaths
    .filter(existsSync)
    .map(readJson)
    .filter(Boolean);

  const installedArchitecturePath = join(
    target,
    ".parallel-slices",
    "architecture.json",
  );
  if (existsSync(installedArchitecturePath)) {
    try {
      const installed = readArchitectureProfile(target);
      if (
        installed.id !== architecture.manifest.id ||
        installed.packageName !== architecture.manifest.packageName ||
        installed.packageVersion !== architecture.manifest.version ||
        installed.manifestSha256 !== architecture.manifestSha256 ||
        installed.packageSha256 !== architecture.packageSha256 ||
        (installed.profile || "default") !== architecture.profile
      ) {
        problem(
          "installed architecture selection does not match the selected package",
        );
      }
    } catch (error) {
      problem(error.message);
    }
  }

  const configPath = join(target, ".parallel-slices", "config.json");
  const defaultConfigPath = architecture.projectConfigPath;
  const config = readJson(
    existsSync(configPath) ? configPath : defaultConfigPath,
  );
  if (config) {
    try {
      validateQualityConfig(
        config,
        architecture.manifest.entrypointCapabilityFloors,
      );
      if (existsSync(configPath)) {
        const schemaPath = join(
          dirname(configPath),
          config.$schema || "config.schema.json",
        );
        if (!existsSync(schemaPath)) {
          problem("installed .parallel-slices/config.schema.json is missing");
        }
      }
    } catch (error) {
      problem(`invalid .parallel-slices/config.json: ${error.message}`);
    }
  }

  const reviewConfigPath = join(target, ".parallel-slices", "review.json");
  if (existsSync(reviewConfigPath)) {
    const review = readJson(reviewConfigPath);
    if (review) {
      try {
        validateReviewConfig(review);
      } catch (error) {
        problem(`invalid .parallel-slices/review.json: ${error.message}`);
      }
    }
  }

  try {
    const branch = execFileSync("git", ["branch", "--show-current"], {
      cwd: target,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    assertBranchAllowed(branch, config);
    console.log(`ok: branch ${branch}`);
  } catch (error) {
    problem(
      `target must use a convention-compliant, non-protected branch: ${error.message}`,
    );
  }

  if (rootPackage && config) {
    if (!rootPackage.packageManager) {
      problem(
        "root package.json should pin packageManager for the Parallel Slices control plane",
        false,
      );
    }
    try {
      const manager = detectPackageManager(target, config.packageManager);
      const huskyScript = manager === "yarn" ? "postinstall" : "prepare";
      const hasHusky = Boolean(
        rootPackage.dependencies?.husky || rootPackage.devDependencies?.husky,
      );
      if (!hasHusky) problem("root package.json should declare husky", false);
      if (!includesHuskyCommand(rootPackage.scripts?.[huskyScript])) {
        problem(
          `root package.json should run husky from ${huskyScript}`,
          false,
        );
      }
    } catch (error) {
      problem(error.message);
    }

    for (const id of entrypointStepIds(config)) {
      const step = config.steps[id];
      const found = step.scripts.find(
        (candidate) => rootPackage.scripts?.[candidate],
      );
      if (found) console.log(`ok: ${step.name} -> ${found}`);
      else {
        problem(
          `no root script found for ${step.name}; expected ${step.scripts.join(" or ")}`,
          false,
        );
      }
    }
  }

  const dependencies = new Set();
  for (const pkg of packages) {
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
    ]) {
      for (const name of Object.keys(pkg[field] || {})) dependencies.add(name);
    }
  }
  if (dependencies.size === 0 && strict) {
    problem("no project dependencies were discovered");
  }

  try {
    execFileSync(
      process.execPath,
      [
        architecture.verifierPath,
        strict ? "foundation" : "inspect",
        target,
        architecture.profile,
      ],
      { cwd: target, stdio: "inherit" },
    );
  } catch {
    problem(`${architecture.manifest.id} architecture verification failed`);
  }

  if (failed) return false;
  console.log(
    `${architecture.manifest.displayName} target ${strict ? "verified" : "inspected"}: ${target}`,
  );
  return true;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]));
if (isMain) {
  const options = parseArguments(process.argv.slice(2));
  if (!inspectTarget(options)) process.exitCode = 1;
}
