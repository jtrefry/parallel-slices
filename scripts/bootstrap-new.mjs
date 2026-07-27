#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  loadArchitecturePackage,
  resolveArchitectureOptions,
} from "./architecture-package.mjs";
import { loadCreationConfig } from "./creation-config.mjs";
import {
  agentDefinitions,
  validateAgent,
} from "../repo-overlay/scripts/parallel-slices/agent-profile.mjs";
import { recordGeneratedBaseline } from "../repo-overlay/scripts/parallel-slices/generated-baseline.mjs";

const parallelSlicesRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const initialBranch = "chore/initialize-project";

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env, CI: "1" },
    stdio: "inherit",
  });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.signal) {
    fail(`${command} was terminated by signal ${result.signal}`);
  }
  if (result.status !== 0) {
    fail(`${command} failed with exit code ${result.status}`);
  }
}

function selectedArchitectureId(argv) {
  let selected = "nextjs-gcp-postgres";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--architecture") {
      const value = argv[index + 1];
      if (!value) fail("--architecture requires a value");
      selected = value;
      index += 1;
    } else if (argument.startsWith("--architecture=")) {
      selected = argument.slice("--architecture=".length);
    }
  }
  return selected;
}

function selectedArchitectureProfile(argv) {
  let selected;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--profile") {
      const value = argv[index + 1];
      if (!value) fail("--profile requires a value");
      selected = value;
      index += 1;
    } else if (argument.startsWith("--profile=")) {
      selected = argument.slice("--profile=".length);
    }
  }
  return selected;
}

function parseConfigArguments(argv) {
  if (
    !argv.some(
      (argument) => argument === "--config" || argument.startsWith("--config="),
    )
  ) {
    return null;
  }
  let configPath;
  let target;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--config") {
      if (configPath) fail("--config may be provided only once");
      configPath = argv[index + 1];
      if (!configPath) fail("--config requires a value");
      index += 1;
    } else if (argument.startsWith("--config=")) {
      if (configPath) fail("--config may be provided only once");
      configPath = argument.slice("--config=".length);
      if (!configPath) fail("--config requires a value");
    } else if (argument.startsWith("--")) {
      fail("--config cannot be combined with architecture or controller flags");
    } else if (!target) target = argument;
    else fail(`unexpected argument: ${argument}`);
  }
  if (!target) {
    fail(
      "usage: npm run bootstrap -- --config /path/to/parallel-slices.create.json /absolute/path/to/project",
    );
  }
  if (!isAbsolute(target)) fail("target must be an absolute path");
  return {
    ...loadCreationConfig(configPath),
    target: resolve(target),
  };
}

function parseOptionValue(name, definition, raw) {
  if (definition.type === "string") return raw;
  if (definition.type === "boolean") {
    if (raw === true || raw === "true") return true;
    if (raw === false || raw === "false") return false;
    fail(`--${name} must be true or false`);
  }
  if (definition.type === "integer" && /^-?\d+$/.test(raw)) {
    return Number(raw);
  }
  fail(`--${name} must be an integer`);
}

export function parseArguments(argv) {
  const configured = parseConfigArguments(argv);
  if (configured) return configured;
  const architectureId = selectedArchitectureId(argv);
  const architectureProfile = selectedArchitectureProfile(argv);
  const architecture = loadArchitecturePackage(
    architectureId,
    undefined,
    architectureProfile,
  );
  const suppliedOptions = {};
  let defaultController = "cursor";
  let target;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--architecture") {
      index += 1;
      continue;
    }
    if (argument.startsWith("--architecture=")) continue;
    if (argument === "--profile") {
      index += 1;
      continue;
    }
    if (argument.startsWith("--profile=")) continue;
    if (["--agent", "--default-controller"].includes(argument)) {
      defaultController = argv[index + 1];
      if (!defaultController) fail(`${argument} requires a value`);
      validateAgent(defaultController);
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) {
      const equalIndex = argument.indexOf("=");
      let name = argument.slice(2, equalIndex < 0 ? undefined : equalIndex);
      let raw = equalIndex < 0 ? undefined : argument.slice(equalIndex + 1);
      let forcedFalse = false;
      if (name.startsWith("no-")) {
        name = name.slice(3);
        forcedFalse = true;
      }
      const definition = architecture.manifest.options[name];
      if (!definition) fail(`unknown option for ${architectureId}: --${name}`);
      if (forcedFalse) {
        if (definition.type !== "boolean" || raw !== undefined) {
          fail(`--no-${name} is valid only for a boolean option`);
        }
        raw = false;
      } else if (raw === undefined && definition.type === "boolean") {
        raw = true;
      } else if (raw === undefined) {
        raw = argv[index + 1];
        if (raw === undefined) fail(`--${name} requires a value`);
        index += 1;
      }
      if (Object.hasOwn(suppliedOptions, name)) {
        fail(`architecture option may be provided only once: --${name}`);
      }
      suppliedOptions[name] = parseOptionValue(name, definition, raw);
      continue;
    }
    if (!target) target = argument;
    else fail(`unexpected argument: ${argument}`);
  }

  if (!target) {
    fail(
      "usage: npm run bootstrap -- [--architecture <id>] " +
        "[--default-controller cursor|codex|claude-code] " +
        "[architecture options] /absolute/path/to/project",
    );
  }
  if (!isAbsolute(target)) fail("target must be an absolute path");
  return {
    architecture,
    architectureId,
    architectureOptions: resolveArchitectureOptions(
      architecture.manifest,
      suppliedOptions,
    ),
    defaultController,
    target: resolve(target),
  };
}

export async function bootstrapNewProject(options) {
  const execute = options.runCommand || run;
  const target = options.target;
  const architecture =
    options.architecture ||
    loadArchitecturePackage(
      options.architectureId || "nextjs-gcp-postgres",
      undefined,
      options.architectureProfile,
    );
  const legacyOptions = options.manager
    ? { "package-manager": options.manager }
    : {};
  const architectureOptions = resolveArchitectureOptions(
    architecture.manifest,
    options.architectureOptions || legacyOptions,
  );
  const selectedAgent = validateAgent(
    options.defaultController || options.agent || "cursor",
  );
  if (existsSync(target)) fail(`target already exists: ${target}`);
  const parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  const stagingRoot = mkdtempSync(join(parent, ".parallel-slices-create-"));
  const stagedProject = join(stagingRoot, basename(target));
  let stagingRemoved = false;
  const removeStagingRoot = () => {
    if (stagingRemoved) return;
    stagingRemoved = true;
    rmSync(stagingRoot, { recursive: true, force: true });
  };
  const handleTerminationSignal = (signal) => {
    removeStagingRoot();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.on("SIGINT", handleTerminationSignal);
  process.on("SIGTERM", handleTerminationSignal);

  try {
    const generator = await import(pathToFileURL(architecture.generatorPath));
    if (typeof generator.generateArchitecture !== "function") {
      fail(
        `${architecture.manifest.id} must export generateArchitecture(context)`,
      );
    }
    await generator.generateArchitecture({
      defaultController: selectedAgent,
      options: architectureOptions,
      packageRoot: architecture.packageRoot,
      profile: architecture.profile,
      parent,
      runCommand: execute,
      stagingRoot,
      target: stagedProject,
    });

    rmSync(join(stagedProject, ".git"), { recursive: true, force: true });
    execute("git", ["init", "-b", initialBranch], { cwd: stagedProject });
    execute(
      "bash",
      [
        join(parallelSlicesRoot, "scripts/install.sh"),
        "--architecture",
        architecture.manifest.id,
        "--architecture-package",
        architecture.packageRoot,
        "--architecture-profile",
        architecture.profile,
        "--architecture-source-json",
        JSON.stringify(architecture.source),
        "--architecture-options-json",
        JSON.stringify(architectureOptions),
        "--default-controller",
        selectedAgent,
        stagedProject,
      ],
      { cwd: parallelSlicesRoot },
    );

    if (
      existsSync(join(stagedProject, ".parallel-slices/curated-skills.json"))
    ) {
      const installSkills =
        options.installCuratedSkills ||
        ((project) =>
          execute(
            "node",
            [
              join(
                project,
                "scripts/parallel-slices/install-curated-skills.mjs",
              ),
              project,
            ],
            { cwd: project },
          ));
      await installSkills(stagedProject);
    }
    execute(
      "node",
      [
        join(stagedProject, "scripts/parallel-slices/setup-husky.mjs"),
        stagedProject,
      ],
      { cwd: stagedProject },
    );
    copyFileSync(
      architecture.rootInstructionsPath,
      join(stagedProject, "AGENTS.md"),
    );
    recordGeneratedBaseline(stagedProject);
    execute(
      "bash",
      [
        join(parallelSlicesRoot, "scripts/verify.sh"),
        "--architecture",
        architecture.manifest.id,
        "--architecture-package",
        architecture.packageRoot,
        "--architecture-profile",
        architecture.profile,
        stagedProject,
      ],
      { cwd: parallelSlicesRoot },
    );

    if (existsSync(target)) {
      fail(`destination appeared during generation: ${target}`);
    }
    try {
      renameSync(stagedProject, target);
    } catch (error) {
      if (error.code === "ENOTEMPTY") {
        fail(`destination appeared during generation: ${target}`);
      }
      throw error;
    }
    console.log(`\nCreated a Parallel Slices project at ${target}`);
    console.log(
      `Architecture: ${architecture.manifest.displayName} (${architecture.manifest.id}@${architecture.manifest.version})`,
    );
    console.log(`Architecture profile: ${architecture.profile}`);
    console.log(`Branch: ${initialBranch}`);
    console.log("Enabled controllers: Cursor, Codex, Claude Code");
    console.log(`Default controller: ${agentDefinitions[selectedAgent].label}`);
    console.log("Next: read README.md");
    console.log(
      `Default-tool initialize command: ${architecture.manifest.controllers[selectedAgent].initializeCommand}`,
    );
    console.log(
      "No commit, push, deployment, or external-system mutation was performed.",
    );
  } finally {
    process.removeListener("SIGINT", handleTerminationSignal);
    process.removeListener("SIGTERM", handleTerminationSignal);
    removeStagingRoot();
  }
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]));
if (isMain) {
  try {
    await bootstrapNewProject(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(`BOOTSTRAP FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
