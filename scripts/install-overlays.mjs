#!/usr/bin/env node

import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { loadArchitecturePackage } from "./architecture-package.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(message);
}

function collectFiles(root, directory = root, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      fail(`overlay must not contain symbolic links: ${relative(root, path)}`);
    }
    if (entry.isDirectory()) collectFiles(root, path, files);
    else if (entry.isFile()) {
      files.push({
        mode: lstatSync(path).mode & 0o777,
        relativePath: relative(root, path).split(sep).join("/"),
        sourcePath: path,
      });
    }
  }
  return files;
}

function assertNoTargetSymlink(target, relativePath) {
  let current = target;
  for (const segment of relativePath.split("/")) {
    current = resolve(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      fail(`refusing to write through a target symlink: ${current}`);
    }
  }
}

export function buildOverlayPlan(architecture, target) {
  const coreFiles = collectFiles(resolve(repositoryRoot, "repo-overlay"));
  const architectureFiles = architecture.overlayLayers
    ? architecture.overlayLayers.flatMap((layer) => {
        const required = new Set(layer.requiredFiles);
        return collectFiles(layer.root).filter((file) =>
          required.has(file.relativePath),
        );
      })
    : collectFiles(architecture.overlayRoot);
  const corePaths = new Set(coreFiles.map((file) => file.relativePath));
  const conflicts = architectureFiles
    .map((file) => file.relativePath)
    .filter((path) => corePaths.has(path));
  if (conflicts.length) {
    fail(
      `architecture overlay conflicts with core files: ${conflicts.join(", ")}`,
    );
  }
  const plan = [...coreFiles, ...architectureFiles].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  for (const file of plan) {
    assertNoTargetSymlink(target, file.relativePath);
  }
  return plan;
}

export function installOverlays(options) {
  const target = resolve(options.target);
  if (!existsSync(target) || !lstatSync(target).isDirectory()) {
    fail(`target repository does not exist: ${target}`);
  }
  const architecture =
    options.architecture ||
    loadArchitecturePackage(
      options.architecturePackage || options.architectureId,
      undefined,
      options.architectureProfile,
    );
  const plan = buildOverlayPlan(architecture, target);

  const writes = [];
  for (const file of plan) {
    const targetPath = resolve(target, file.relativePath);
    if (!targetPath.startsWith(`${target}${sep}`)) {
      fail(`overlay target escapes the repository: ${file.relativePath}`);
    }
    if (existsSync(targetPath)) {
      const targetStat = lstatSync(targetPath);
      if (!targetStat.isFile()) {
        fail(`refusing to replace non-file target: ${targetPath}`);
      }
      const same =
        realpathSync(file.sourcePath) === realpathSync(targetPath) ||
        (targetStat.size === lstatSync(file.sourcePath).size &&
          Buffer.compare(
            readFileSync(file.sourcePath),
            readFileSync(targetPath),
          ) === 0);
      if (same) {
        writes.push({ file, targetPath, current: true });
        continue;
      }
      if (!options.force) {
        fail(
          `refusing to overwrite existing file: ${targetPath}\n` +
            "merge it manually or rerun with --force after reviewing the diff",
        );
      }
    }
    writes.push({ file, targetPath, current: false });
  }

  for (const { file, targetPath, current } of writes) {
    if (current) {
      console.log(`current: ${file.relativePath}`);
      continue;
    }
    const targetStat = lstatSync(targetPath, { throwIfNoEntry: false });
    if (targetStat && !targetStat.isFile()) {
      fail(`refusing to replace non-file target: ${targetPath}`);
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(file.sourcePath, targetPath);
    chmodSync(targetPath, file.mode);
    console.log(`installed: ${file.relativePath}`);
  }
  return { architecture, files: plan.map((file) => file.relativePath) };
}

function runCli(argv) {
  let force = false;
  let architectureId = "nextjs-gcp-postgres";
  let architecturePackage;
  let architectureProfile;
  let target;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force") force = true;
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
  if (!target) {
    fail(
      "usage: install-overlays.mjs [--force] [--architecture <id>] /absolute/path/to/repository",
    );
  }
  installOverlays({
    architectureId,
    architecturePackage,
    architectureProfile,
    force,
    target,
  });
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]));
if (isMain) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`OVERLAY INSTALL FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
