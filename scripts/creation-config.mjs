#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgent } from "../repo-overlay/scripts/parallel-slices/agent-profile.mjs";
import {
  loadArchitecturePackageSource,
  resolveArchitectureOptions,
} from "./architecture-package.mjs";

const allowedSchemaReferences = new Set([
  "./schemas/create-config.schema.json",
  "https://parallelslices.com/schemas/create-config.schema.json",
]);
const profilePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  if (unknown.length) {
    fail(`${label} has unknown fields: ${unknown.join(", ")}`);
  }
}

export function validateCreationConfig(config) {
  assertObject(config, "creation config");
  assertKnownKeys(
    config,
    new Set(["$schema", "version", "architecture", "defaultController"]),
    "creation config",
  );
  if (!allowedSchemaReferences.has(config.$schema)) {
    fail("creation config must reference create-config.schema.json");
  }
  if (config.version !== 1) fail("creation config version must be 1");
  assertObject(config.architecture, "creation config architecture");
  assertKnownKeys(
    config.architecture,
    new Set(["source", "profile", "options"]),
    "creation config architecture",
  );
  assertObject(
    config.architecture.source,
    "creation config architecture source",
  );
  if (
    config.architecture.profile !== undefined &&
    !profilePattern.test(config.architecture.profile)
  ) {
    fail("creation config architecture profile is invalid");
  }
  if (config.architecture.options !== undefined) {
    assertObject(
      config.architecture.options,
      "creation config architecture options",
    );
  }
  if (config.defaultController !== undefined) {
    validateAgent(config.defaultController);
  }
  return config;
}

export function loadCreationConfig(path) {
  const configPath = resolve(path);
  if (!existsSync(configPath)) fail(`creation config does not exist: ${path}`);
  if (lstatSync(configPath).isSymbolicLink()) {
    fail(`refusing symlinked creation config: ${path}`);
  }
  if (!lstatSync(configPath).isFile()) {
    fail(`creation config must be a file: ${path}`);
  }
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    fail(`cannot read creation config: ${error.message}`);
  }
  validateCreationConfig(config);
  const architecture = loadArchitecturePackageSource(
    config.architecture.source,
    dirname(configPath),
    config.architecture.profile,
  );
  return {
    architecture,
    architectureId: architecture.manifest.id,
    architectureOptions: resolveArchitectureOptions(
      architecture.manifest,
      config.architecture.options || {},
    ),
    config,
    configPath,
    defaultController: validateAgent(config.defaultController || "cursor"),
  };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]));
if (isMain) {
  try {
    if (process.argv.length !== 3) {
      fail("usage: creation-config.mjs /path/to/parallel-slices.create.json");
    }
    const loaded = loadCreationConfig(process.argv[2]);
    console.log(
      `creation config valid: ${loaded.architecture.manifest.id}@${loaded.architecture.manifest.version} profile=${loaded.architecture.profile}`,
    );
  } catch (error) {
    console.error(`CREATION CONFIG ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
