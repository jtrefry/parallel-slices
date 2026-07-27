#!/usr/bin/env node

import { readFileSync, mkdirSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  configureScaffold,
  loadScaffoldBaseline,
} from "./configure-scaffold.mjs";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const packageManifest = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
);
export const createTurboVersion =
  packageManifest.dependencies?.["create-turbo"];
if (!/^\d+\.\d+\.\d+$/.test(createTurboVersion || "")) {
  throw new Error(
    "the nextjs-cloudflare-supabase architecture package must pin create-turbo exactly",
  );
}

function fail(message) {
  throw new Error(message);
}

export function createTurboCommand(manager, projectPath, managerVersion) {
  const packageSpec = `create-turbo@${createTurboVersion}`;
  const managerSpec = managerVersion ? `${manager}@${managerVersion}` : manager;
  const commands = {
    npm: ["npx", ["--yes", packageSpec]],
    pnpm: ["corepack", [managerSpec, "dlx", packageSpec]],
    yarn: ["corepack", [managerSpec, "dlx", packageSpec]],
    bun: ["bunx", [packageSpec]],
  };
  const [command, prefix] = commands[manager] || [];
  if (!command) fail("package-manager must be npm, pnpm, yarn, or bun");
  return [
    command,
    [
      ...prefix,
      projectPath,
      "--package-manager",
      manager,
      "--skip-install",
      "--no-git",
    ],
  ];
}

export function packageManagerInstallCommand(manager, managerVersion) {
  const managerSpec = managerVersion ? `${manager}@${managerVersion}` : manager;
  const commands = {
    npm: ["npm", ["install"]],
    pnpm: ["corepack", [managerSpec, "install", "--no-frozen-lockfile"]],
    yarn: ["corepack", [managerSpec, "install"]],
    bun: ["bun", ["install"]],
  };
  const command = commands[manager];
  if (!command) fail("package-manager must be npm, pnpm, yarn, or bun");
  return command;
}

export function corepackShimCommand(manager, shimDirectory) {
  if (!["pnpm", "yarn"].includes(manager)) return null;
  return [
    "corepack",
    ["enable", manager, "--install-directory", shimDirectory],
  ];
}

function preparePackageManagerEnvironment(
  manager,
  stagingRoot,
  execute,
  workingDirectory,
) {
  const shimDirectory = join(stagingRoot, "corepack-bin");
  const command = corepackShimCommand(manager, shimDirectory);
  if (!command) return {};
  mkdirSync(shimDirectory);
  execute(command[0], command[1], { cwd: workingDirectory });
  return {
    COREPACK_DEFAULT_TO_LATEST: "0",
    PATH: process.env.PATH
      ? `${shimDirectory}${delimiter}${process.env.PATH}`
      : shimDirectory,
  };
}

export function generateArchitecture(context) {
  const manager = context.options["package-manager"];
  const managerVersion =
    loadScaffoldBaseline().parallelSlices.packageManagers[manager];
  const commandEnvironment = preparePackageManagerEnvironment(
    manager,
    context.stagingRoot,
    context.runCommand,
    context.parent,
  );
  const [createCommand, createArgs] = createTurboCommand(
    manager,
    context.target,
    managerVersion,
  );
  context.runCommand(createCommand, createArgs, {
    cwd: context.parent,
    env: commandEnvironment,
  });

  configureScaffold(context.target, {
    agent: context.defaultController,
    createTurboVersion,
    dataLayer:
      context.profile === "external-api-only"
        ? "external-api-only"
        : "postgres",
    manager,
  });

  const [installCommand, installArgs] = packageManagerInstallCommand(
    manager,
    managerVersion,
  );
  context.runCommand(installCommand, installArgs, {
    cwd: context.target,
    env: commandEnvironment,
  });
  return {
    packageManager: manager,
    scaffoldProfile: ".parallel-slices/scaffold-profile.json",
  };
}
