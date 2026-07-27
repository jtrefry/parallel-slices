#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateQualityConfig } from "../repo-overlay/scripts/parallel-slices/project-quality.mjs";
import {
  createArchitecturePackage,
  loadArchitectureAuthoringConfig,
} from "./architecture-package-authoring.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const architecturesRoot = resolve(repositoryRoot, "architectures");
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^\d+\.\d+\.\d+$/;
const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const capabilityPattern = /^[a-z][a-z0-9]*(?::[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const safeRelativePathPattern =
  /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\/$)[A-Za-z0-9._/-]+$/;
const controllers = Object.freeze(["cursor", "codex", "claude-code"]);
const entrypoints = Object.freeze([
  "generatedBaseline",
  "preCommit",
  "prePush",
  "ci",
  "loop",
]);
const reservedOptions = new Set([
  "architecture",
  "config",
  "default-controller",
  "profile",
]);

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

function assertUniqueStrings(values, pattern, label, options = {}) {
  if (!Array.isArray(values) || (options.nonEmpty && values.length === 0)) {
    fail(`${label} must be ${options.nonEmpty ? "a non-empty " : "an "}array`);
  }
  if (
    values.some((value) => typeof value !== "string" || !pattern.test(value))
  ) {
    fail(`${label} contains an invalid value`);
  }
  if (new Set(values).size !== values.length) {
    fail(`${label} must not contain duplicates`);
  }
}

function assertSafeRelativePath(path, label) {
  if (
    typeof path !== "string" ||
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    fail(`${label} must be a safe package-relative path`);
  }
  return path;
}

function assertPublicHttpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid public HTTPS URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    fail(
      `${label} must be a valid public HTTPS URL without credentials, query, or fragment`,
    );
  }
  return value;
}

function assertSchemaReference(value) {
  if (
    typeof value !== "string" ||
    !value.endsWith("architecture-package.schema.json")
  ) {
    fail(
      "architecture manifest must reference architecture-package.schema.json",
    );
  }
  if (/^https:\/\//.test(value)) {
    assertPublicHttpsUrl(value, "architecture manifest $schema");
    return value;
  }
  if (isAbsolute(value) || value.includes("\\") || value.includes("\0")) {
    fail("architecture manifest $schema must be relative or public HTTPS");
  }
  return value;
}

function resolvePackagePath(packageRoot, path, label, expectedType) {
  assertSafeRelativePath(path, label);
  const absolute = resolve(packageRoot, path);
  if (
    absolute !== packageRoot &&
    !absolute.startsWith(`${packageRoot}${sep}`)
  ) {
    fail(`${label} escapes the architecture package`);
  }
  const segments = relative(packageRoot, absolute).split(sep);
  let current = packageRoot;
  for (const segment of segments) {
    current = resolve(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      fail(`${label} must not traverse a symbolic link: ${path}`);
    }
  }
  if (!existsSync(absolute)) fail(`${label} does not exist: ${path}`);
  const stat = lstatSync(absolute);
  if (expectedType === "file" && !stat.isFile()) {
    fail(`${label} must be a file: ${path}`);
  }
  if (expectedType === "directory" && !stat.isDirectory()) {
    fail(`${label} must be a directory: ${path}`);
  }
  return absolute;
}

function collectOverlayFiles(root, directory = root, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      fail(
        `architecture overlay must not contain symbolic links: ${relative(root, path)}`,
      );
    }
    if (entry.isDirectory()) collectOverlayFiles(root, path, files);
    else if (entry.isFile()) {
      files.push(relative(root, path).split(sep).join("/"));
    }
  }
  return files;
}

function collectPackageFiles(root, directory = root, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      fail(
        `architecture package must not contain symbolic links: ${relative(root, path)}`,
      );
    }
    if (entry.isDirectory()) collectPackageFiles(root, path, files);
    else if (entry.isFile()) {
      files.push({
        path,
        relativePath: relative(root, path).split(sep).join("/"),
      });
    }
  }
  return files;
}

function architecturePackageSha256(packageRoot) {
  const hash = createHash("sha256");
  for (const file of collectPackageFiles(packageRoot).sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  )) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(readFileSync(file.path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function validateOption(name, definition) {
  if (!idPattern.test(name) || reservedOptions.has(name)) {
    fail(`invalid or reserved architecture option: ${name}`);
  }
  if (name.startsWith("no-")) {
    fail(
      `architecture option ${name} must not use the no- prefix; it is reserved for boolean negation on the command line`,
    );
  }
  assertObject(definition, `option ${name}`);
  assertKnownKeys(
    definition,
    new Set([
      "type",
      "description",
      "required",
      "default",
      "enum",
      "minimum",
      "maximum",
    ]),
    `option ${name}`,
  );
  if (!["string", "boolean", "integer"].includes(definition.type)) {
    fail(`option ${name} has an unsupported type`);
  }
  if (typeof definition.description !== "string" || !definition.description) {
    fail(`option ${name} requires a description`);
  }
  if (
    Object.hasOwn(definition, "required") &&
    typeof definition.required !== "boolean"
  ) {
    fail(`option ${name}.required must be a boolean`);
  }
  if (definition.required && Object.hasOwn(definition, "default")) {
    fail(`required option ${name} must not define a default`);
  }
  if (definition.enum) {
    if (!Array.isArray(definition.enum) || definition.enum.length === 0) {
      fail(`option ${name}.enum must be a non-empty array`);
    }
    if (new Set(definition.enum).size !== definition.enum.length) {
      fail(`option ${name}.enum must not contain duplicates`);
    }
  }
  for (const key of ["default", ...(definition.enum ? ["enum"] : [])]) {
    const values = key === "enum" ? definition.enum : [definition.default];
    if (!Object.hasOwn(definition, key)) continue;
    for (const value of values) validateOptionValue(name, definition, value);
  }
  if (
    Object.hasOwn(definition, "minimum") ||
    Object.hasOwn(definition, "maximum")
  ) {
    if (definition.type !== "integer") {
      fail(`option ${name} bounds require type=integer`);
    }
    if (
      (Object.hasOwn(definition, "minimum") &&
        !Number.isInteger(definition.minimum)) ||
      (Object.hasOwn(definition, "maximum") &&
        !Number.isInteger(definition.maximum)) ||
      definition.minimum > definition.maximum
    ) {
      fail(`option ${name} has invalid integer bounds`);
    }
  }
}

function validateOptionValue(name, definition, value) {
  const typeMatches =
    (definition.type === "string" && typeof value === "string") ||
    (definition.type === "boolean" && typeof value === "boolean") ||
    (definition.type === "integer" && Number.isInteger(value));
  if (!typeMatches) fail(`option ${name} must be ${definition.type}`);
  if (definition.enum && !definition.enum.includes(value)) {
    fail(`option ${name} must be one of: ${definition.enum.join(", ")}`);
  }
  if (definition.type === "integer") {
    if (definition.minimum !== undefined && value < definition.minimum) {
      fail(`option ${name} must be at least ${definition.minimum}`);
    }
    if (definition.maximum !== undefined && value > definition.maximum) {
      fail(`option ${name} must be at most ${definition.maximum}`);
    }
  }
  return value;
}

function validateComponents(components, label) {
  if (!Array.isArray(components) || components.length === 0) {
    fail(`${label} must be a non-empty array`);
  }
  const componentIds = new Set();
  for (const component of components) {
    assertObject(component, label);
    assertKnownKeys(
      component,
      new Set(["id", "kind", "technology", "optional", "attributes"]),
      label,
    );
    if (
      !idPattern.test(component.id || "") ||
      !idPattern.test(component.kind || "") ||
      typeof component.technology !== "string" ||
      !component.technology.trim() ||
      typeof component.optional !== "boolean"
    ) {
      fail(`${label} has invalid identity or metadata`);
    }
    assertObject(component.attributes, `component ${component.id}.attributes`);
    if (componentIds.has(component.id)) {
      fail(`duplicate architecture component: ${component.id}`);
    }
    componentIds.add(component.id);
  }
}

function validateCapabilityFloors(
  floors,
  label = "entrypoint capability floors",
) {
  assertObject(floors, label);
  assertKnownKeys(floors, new Set(entrypoints), label);
  for (const entrypoint of entrypoints) {
    assertUniqueStrings(
      floors[entrypoint],
      capabilityPattern,
      `${entrypoint} capability floor`,
      { nonEmpty: true },
    );
  }
}

function validateOverlay(overlay, label, options = {}) {
  assertObject(overlay, label);
  const allowed = new Set(["directory", "requiredFiles"]);
  if (options.profile) allowed.add("excludeFiles");
  assertKnownKeys(overlay, allowed, label);
  if (options.profile) {
    assertUniqueStrings(
      overlay.excludeFiles || [],
      safeRelativePathPattern,
      `${label}.excludeFiles`,
    );
    const hasDirectory = Object.hasOwn(overlay, "directory");
    const hasRequiredFiles = Object.hasOwn(overlay, "requiredFiles");
    if (hasDirectory !== hasRequiredFiles) {
      fail(
        `${label} must define directory and requiredFiles together when adding files`,
      );
    }
    if (!hasDirectory) return;
  }
  assertSafeRelativePath(overlay.directory, `${label}.directory`);
  assertUniqueStrings(
    overlay.requiredFiles,
    safeRelativePathPattern,
    `${label}.requiredFiles`,
  );
}

function validateTemplates(templates, label) {
  assertObject(templates, label);
  assertKnownKeys(templates, new Set(["rootInstructions"]), label);
  assertSafeRelativePath(
    templates.rootInstructions,
    `${label}.rootInstructions`,
  );
}

function validateArchitectureProfiles(profiles, manifest) {
  if (!profiles) return;
  assertObject(profiles, "architecture profiles");
  assertKnownKeys(
    profiles,
    new Set(["default", "definitions"]),
    "architecture profiles",
  );
  if (!idPattern.test(profiles.default || "")) {
    fail("architecture profiles.default must be a valid profile id");
  }
  assertObject(profiles.definitions, "architecture profile definitions");
  if (!Object.hasOwn(profiles.definitions, profiles.default)) {
    fail("architecture profiles.default must name a defined profile");
  }
  for (const [name, profile] of Object.entries(profiles.definitions)) {
    if (!idPattern.test(name)) fail(`invalid architecture profile id: ${name}`);
    assertObject(profile, `architecture profile ${name}`);
    assertKnownKeys(
      profile,
      new Set([
        "description",
        "displayName",
        "components",
        "capabilities",
        "entrypointCapabilityFloors",
        "overlay",
        "templates",
        "projectDocuments",
      ]),
      `architecture profile ${name}`,
    );
    if (
      typeof profile.description !== "string" ||
      !profile.description.trim()
    ) {
      fail(`architecture profile ${name} requires a description`);
    }
    if (
      profile.displayName !== undefined &&
      (typeof profile.displayName !== "string" || !profile.displayName.trim())
    ) {
      fail(`architecture profile ${name} displayName must be non-empty`);
    }
    if (profile.components) {
      validateComponents(
        profile.components,
        `architecture profile ${name} components`,
      );
    }
    if (profile.capabilities) {
      assertUniqueStrings(
        profile.capabilities,
        capabilityPattern,
        `architecture profile ${name} capabilities`,
        { nonEmpty: true },
      );
    }
    if (profile.entrypointCapabilityFloors) {
      validateCapabilityFloors(
        profile.entrypointCapabilityFloors,
        `architecture profile ${name} entrypoint capability floors`,
      );
    }
    if (profile.overlay) {
      validateOverlay(profile.overlay, `architecture profile ${name} overlay`, {
        profile: true,
      });
      for (const excluded of profile.overlay.excludeFiles || []) {
        if (!manifest.overlay.requiredFiles.includes(excluded)) {
          fail(
            `architecture profile ${name} excludes undeclared base overlay file: ${excluded}`,
          );
        }
      }
    }
    if (profile.templates) {
      validateTemplates(
        profile.templates,
        `architecture profile ${name} templates`,
      );
    }
    if (profile.projectDocuments) {
      assertUniqueStrings(
        profile.projectDocuments,
        safeRelativePathPattern,
        `architecture profile ${name} projectDocuments`,
        { nonEmpty: true },
      );
    }
  }
}

export function validateArchitectureManifest(manifest, expectedId) {
  assertObject(manifest, "architecture manifest");
  assertKnownKeys(
    manifest,
    new Set([
      "$schema",
      "contractVersion",
      "id",
      "packageName",
      "version",
      "displayName",
      "description",
      "starter",
      "components",
      "capabilities",
      "options",
      "entrypointCapabilityFloors",
      "generator",
      "overlay",
      "verification",
      "templates",
      "projectDocuments",
      "controllers",
      "profiles",
    ]),
    "architecture manifest",
  );
  assertSchemaReference(manifest.$schema);
  if (manifest.contractVersion !== 1) {
    fail("architecture package contractVersion must be 1");
  }
  if (
    !idPattern.test(manifest.id || "") ||
    (expectedId && manifest.id !== expectedId)
  ) {
    fail(
      expectedId
        ? `architecture manifest id must match its directory: ${expectedId}`
        : "architecture manifest id is invalid",
    );
  }
  if (!packageNamePattern.test(manifest.packageName || "")) {
    fail("architecture packageName must be a valid npm package name");
  }
  if (!versionPattern.test(manifest.version || "")) {
    fail("architecture version must be an exact semantic version");
  }
  for (const field of ["displayName", "description"]) {
    if (typeof manifest[field] !== "string" || !manifest[field].trim()) {
      fail(`architecture ${field} must be a non-empty string`);
    }
  }
  if (Object.hasOwn(manifest, "starter")) {
    assertObject(manifest.starter, "architecture starter");
    assertKnownKeys(
      manifest.starter,
      new Set(["repositoryUrl", "templateUrl"]),
      "architecture starter",
    );
    assertPublicHttpsUrl(
      manifest.starter.repositoryUrl,
      "architecture starter.repositoryUrl",
    );
    assertPublicHttpsUrl(
      manifest.starter.templateUrl,
      "architecture starter.templateUrl",
    );
  }
  validateComponents(manifest.components, "architecture components");
  assertUniqueStrings(
    manifest.capabilities,
    capabilityPattern,
    "architecture capabilities",
    { nonEmpty: true },
  );
  assertObject(manifest.options, "architecture options");
  for (const [name, definition] of Object.entries(manifest.options)) {
    validateOption(name, definition);
  }
  validateCapabilityFloors(manifest.entrypointCapabilityFloors);
  assertObject(manifest.generator, "architecture generator");
  assertKnownKeys(manifest.generator, new Set(["module"]), "generator");
  assertSafeRelativePath(manifest.generator.module, "generator.module");
  validateOverlay(manifest.overlay, "architecture overlay");
  assertObject(manifest.verification, "architecture verification");
  assertKnownKeys(
    manifest.verification,
    new Set(["module", "installedModule"]),
    "verification",
  );
  assertSafeRelativePath(manifest.verification.module, "verification.module");
  assertSafeRelativePath(
    manifest.verification.installedModule,
    "verification.installedModule",
  );
  if (
    manifest.verification.module !==
    `${manifest.overlay.directory}/${manifest.verification.installedModule}`
  ) {
    fail(
      "verification.module must identify the installed verifier inside the architecture overlay",
    );
  }
  validateTemplates(manifest.templates, "architecture templates");
  assertUniqueStrings(
    manifest.projectDocuments,
    safeRelativePathPattern,
    "projectDocuments",
    { nonEmpty: true },
  );
  validateArchitectureProfiles(manifest.profiles, manifest);

  const profileDefinitions = Object.values(
    manifest.profiles?.definitions || {},
  );
  const selectableInstalledFiles = (profile) => {
    const excluded = new Set(profile.overlay?.excludeFiles || []);
    return [
      ...manifest.overlay.requiredFiles.filter((path) => !excluded.has(path)),
      ...(profile.overlay?.requiredFiles || []),
    ];
  };
  for (const [name, profile] of Object.entries(
    manifest.profiles?.definitions || { default: {} },
  )) {
    const installedFiles = selectableInstalledFiles(profile);
    if (new Set(installedFiles).size !== installedFiles.length) {
      fail(`architecture profile ${name} overlay has target path collisions`);
    }
    for (const requiredPath of [
      ".parallel-slices/config.json",
      manifest.verification.installedModule,
    ]) {
      if (!installedFiles.includes(requiredPath)) {
        fail(`architecture profile ${name} must install ${requiredPath}`);
      }
    }
    if (
      (profile.overlay?.excludeFiles || []).includes(
        manifest.verification.installedModule,
      )
    ) {
      fail(
        `architecture profile ${name} must not exclude its installed verifier`,
      );
    }
  }
  if (
    profileDefinitions.length === 0 &&
    !manifest.overlay.requiredFiles.includes(".parallel-slices/config.json")
  ) {
    fail("architecture overlay must install .parallel-slices/config.json");
  }
  if (
    profileDefinitions.length === 0 &&
    !manifest.overlay.requiredFiles.includes(
      manifest.verification.installedModule,
    )
  ) {
    fail(
      `architecture overlay must install ${manifest.verification.installedModule}`,
    );
  }

  assertObject(manifest.controllers, "architecture controllers");
  assertKnownKeys(
    manifest.controllers,
    new Set(controllers),
    "architecture controllers",
  );
  for (const controller of controllers) {
    const value = manifest.controllers[controller];
    assertObject(value, `${controller} controller`);
    assertKnownKeys(
      value,
      new Set(["initializeCommand"]),
      `${controller} controller`,
    );
    if (
      typeof value.initializeCommand !== "string" ||
      !value.initializeCommand.trim()
    ) {
      fail(`${controller} controller requires initializeCommand`);
    }
    const commandPrefix =
      controller === "codex" ? "$parallel-slices-" : "/parallel-slices-";
    if (
      !value.initializeCommand.startsWith(commandPrefix) ||
      !/^[/$]parallel-slices-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
        value.initializeCommand,
      )
    ) {
      fail(
        `${controller} initializeCommand must use the ${commandPrefix} namespace`,
      );
    }
  }
  return manifest;
}

export function validateArchitectureProjectConfig(config, manifest) {
  try {
    validateQualityConfig(config, manifest.entrypointCapabilityFloors);
  } catch (error) {
    fail(`architecture project config is invalid: ${error.message}`);
  }
  return config;
}

function resolveArchitectureProfile(manifest, requestedProfile) {
  const profiles = manifest.profiles;
  if (!profiles) {
    if (requestedProfile && requestedProfile !== "default") {
      fail(
        `architecture ${manifest.id} does not define profile ${requestedProfile}`,
      );
    }
    return {
      definition: {},
      manifest: { ...manifest },
      name: "default",
    };
  }
  const name = requestedProfile || profiles.default;
  const definition = profiles.definitions[name];
  if (!definition) {
    fail(
      `architecture profile must be one of: ${Object.keys(
        profiles.definitions,
      ).join(", ")}`,
    );
  }
  return {
    definition,
    manifest: {
      ...manifest,
      description: definition.description,
      displayName: definition.displayName || manifest.displayName,
      components: definition.components || manifest.components,
      capabilities: definition.capabilities || manifest.capabilities,
      entrypointCapabilityFloors:
        definition.entrypointCapabilityFloors ||
        manifest.entrypointCapabilityFloors,
      projectDocuments:
        definition.projectDocuments || manifest.projectDocuments,
      templates: definition.templates || manifest.templates,
    },
    name,
  };
}

function loadArchitecturePackageRoot(packageRoot, options = {}) {
  packageRoot = resolve(packageRoot);
  if (!existsSync(packageRoot) || !lstatSync(packageRoot).isDirectory()) {
    fail(`architecture package directory does not exist: ${packageRoot}`);
  }
  if (lstatSync(packageRoot).isSymbolicLink()) {
    fail(`architecture package must not be a symbolic link: ${packageRoot}`);
  }
  const manifestPath = resolvePackagePath(
    packageRoot,
    "architecture.json",
    "architecture manifest",
    "file",
  );
  let raw;
  let manifest;
  try {
    raw = readFileSync(manifestPath, "utf8");
    manifest = JSON.parse(raw);
  } catch (error) {
    fail(`cannot read architecture manifest: ${error.message}`);
  }
  validateArchitectureManifest(manifest, options.expectedId);
  const selected = resolveArchitectureProfile(manifest, options.profile);
  const resolvedManifest = selected.manifest;
  const packageManifest = JSON.parse(
    readFileSync(
      resolvePackagePath(
        packageRoot,
        "package.json",
        "package manifest",
        "file",
      ),
      "utf8",
    ),
  );
  if (
    packageManifest.name !== manifest.packageName ||
    packageManifest.version !== manifest.version
  ) {
    fail("architecture package.json identity must match architecture.json");
  }
  const generatorPath = resolvePackagePath(
    packageRoot,
    resolvedManifest.generator.module,
    "architecture generator",
    "file",
  );
  const overlayRoot = resolvePackagePath(
    packageRoot,
    manifest.overlay.directory,
    "architecture overlay",
    "directory",
  );
  const verifierPath = resolvePackagePath(
    packageRoot,
    resolvedManifest.verification.module,
    "architecture verifier",
    "file",
  );
  const rootInstructionsPath = resolvePackagePath(
    packageRoot,
    resolvedManifest.templates.rootInstructions,
    "root instructions template",
    "file",
  );
  for (const path of manifest.overlay.requiredFiles) {
    resolvePackagePath(
      overlayRoot,
      path,
      `required overlay file ${path}`,
      "file",
    );
  }
  const excludedFiles = new Set(
    selected.definition.overlay?.excludeFiles || [],
  );
  const overlayLayers = [
    {
      requiredFiles: manifest.overlay.requiredFiles.filter(
        (path) => !excludedFiles.has(path),
      ),
      root: overlayRoot,
    },
  ];
  if (selected.definition.overlay?.directory) {
    const profileOverlayRoot = resolvePackagePath(
      packageRoot,
      selected.definition.overlay.directory,
      `architecture profile ${selected.name} overlay`,
      "directory",
    );
    for (const path of selected.definition.overlay.requiredFiles) {
      resolvePackagePath(
        profileOverlayRoot,
        path,
        `required profile overlay file ${path}`,
        "file",
      );
    }
    const installedProfileFiles =
      collectOverlayFiles(profileOverlayRoot).sort();
    const requiredProfileFiles = [
      ...selected.definition.overlay.requiredFiles,
    ].sort();
    if (
      JSON.stringify(installedProfileFiles) !==
      JSON.stringify(requiredProfileFiles)
    ) {
      const undeclared = installedProfileFiles.filter(
        (path) => !requiredProfileFiles.includes(path),
      );
      const missing = requiredProfileFiles.filter(
        (path) => !installedProfileFiles.includes(path),
      );
      fail(
        `architecture profile ${selected.name} requiredFiles must exactly match its overlay` +
          `${
            undeclared.length ? `; undeclared: ${undeclared.join(", ")}` : ""
          }${missing.length ? `; missing: ${missing.join(", ")}` : ""}`,
      );
    }
    overlayLayers.push({
      requiredFiles: selected.definition.overlay.requiredFiles,
      root: profileOverlayRoot,
    });
  }
  const installedFiles = overlayLayers
    .flatMap((layer) => layer.requiredFiles)
    .sort();
  const projectConfigLayer = overlayLayers.find((layer) =>
    layer.requiredFiles.includes(".parallel-slices/config.json"),
  );
  const configPath = resolvePackagePath(
    projectConfigLayer.root,
    ".parallel-slices/config.json",
    "architecture project config",
    "file",
  );
  let projectConfig;
  try {
    projectConfig = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    fail(`cannot read architecture project config: ${error.message}`);
  }
  validateArchitectureProjectConfig(projectConfig, resolvedManifest);
  const allInstalledFiles = collectOverlayFiles(overlayRoot).sort();
  const requiredFiles = [...manifest.overlay.requiredFiles].sort();
  if (JSON.stringify(allInstalledFiles) !== JSON.stringify(requiredFiles)) {
    const undeclared = allInstalledFiles.filter(
      (path) => !requiredFiles.includes(path),
    );
    const missing = requiredFiles.filter(
      (path) => !allInstalledFiles.includes(path),
    );
    fail(
      "architecture requiredFiles must exactly match its overlay" +
        `${undeclared.length ? `; undeclared: ${undeclared.join(", ")}` : ""}` +
        `${missing.length ? `; missing: ${missing.join(", ")}` : ""}`,
    );
  }
  return {
    generatorPath,
    manifest: resolvedManifest,
    manifestPath,
    manifestSha256: createHash("sha256").update(raw).digest("hex"),
    overlayLayers,
    overlayRoot,
    packageSha256: architecturePackageSha256(packageRoot),
    packageRoot,
    profile: selected.name,
    projectConfigPath: configPath,
    rootInstructionsPath,
    source: options.source || {
      type: "local",
      packageName: resolvedManifest.packageName,
      packageVersion: resolvedManifest.version,
    },
    verifierPath,
    installedFiles,
  };
}

export function loadArchitecturePackage(
  id = "nextjs-gcp-postgres",
  root = architecturesRoot,
  profile,
) {
  if (isAbsolute(id)) {
    return loadArchitecturePackageRoot(id, { profile });
  }
  if (!idPattern.test(id || "")) fail(`invalid architecture id: ${id}`);
  const packageRoot = resolve(root, id);
  if (!packageRoot.startsWith(`${resolve(root)}${sep}`)) {
    fail("architecture package escapes the package root");
  }
  if (!existsSync(packageRoot)) fail(`unknown architecture package: ${id}`);
  return loadArchitecturePackageRoot(packageRoot, {
    expectedId: id,
    profile,
    source: { id, type: "bundled" },
  });
}

export function loadArchitecturePackageSource(
  source,
  baseDirectory = process.cwd(),
  profile,
) {
  assertObject(source, "architecture source");
  if (source.type === "bundled") {
    assertKnownKeys(source, new Set(["type", "id"]), "bundled source");
    return loadArchitecturePackage(source.id, architecturesRoot, profile);
  }
  if (source.type === "local") {
    assertKnownKeys(source, new Set(["type", "path"]), "local source");
    if (
      typeof source.path !== "string" ||
      !source.path.trim() ||
      isAbsolute(source.path) ||
      source.path.includes("\0")
    ) {
      fail("local architecture source path must be a relative path");
    }
    return loadArchitecturePackageRoot(resolve(baseDirectory, source.path), {
      profile,
      source: { type: "local" },
    });
  }
  if (source.type === "npm") {
    assertKnownKeys(
      source,
      new Set(["type", "package", "version"]),
      "npm source",
    );
    if (
      !packageNamePattern.test(source.package || "") ||
      !versionPattern.test(source.version || "")
    ) {
      fail("npm architecture source requires a package name and exact version");
    }
    const require = createRequire(resolve(baseDirectory, "package.json"));
    let manifestPath;
    try {
      manifestPath = require.resolve(`${source.package}/architecture.json`);
    } catch {
      fail(
        `npm architecture package is unavailable: install ${source.package}@${source.version} and export architecture.json; architecture packages execute code at generation time, so install only trusted packages`,
      );
    }
    const architecture = loadArchitecturePackageRoot(dirname(manifestPath), {
      profile,
      source: {
        package: source.package,
        type: "npm",
        version: source.version,
      },
    });
    if (
      architecture.manifest.packageName !== source.package ||
      architecture.manifest.version !== source.version
    ) {
      fail(
        `resolved npm architecture must match ${source.package}@${source.version}`,
      );
    }
    return architecture;
  }
  fail("architecture source type must be bundled, local, or npm");
}

function parseArchitectureSourceMetadata(value, manifest) {
  if (!value) return undefined;
  let source;
  try {
    source = JSON.parse(value);
  } catch (error) {
    fail(`invalid architecture source JSON: ${error.message}`);
  }
  assertObject(source, "architecture source metadata");
  if (source.type === "bundled") {
    assertKnownKeys(
      source,
      new Set(["type", "id"]),
      "architecture source metadata",
    );
    if (source.id !== manifest.id) {
      fail("bundled architecture source id must match the manifest");
    }
  } else if (source.type === "local") {
    assertKnownKeys(source, new Set(["type"]), "architecture source metadata");
  } else if (source.type === "npm") {
    assertKnownKeys(
      source,
      new Set(["type", "package", "version"]),
      "architecture source metadata",
    );
    if (
      source.package !== manifest.packageName ||
      source.version !== manifest.version
    ) {
      fail("npm architecture source metadata must match the manifest");
    }
  } else {
    fail("architecture source metadata type must be bundled, local, or npm");
  }
  return source;
}

export function resolveArchitectureOptions(manifest, supplied = {}) {
  assertObject(supplied, "architecture option values");
  const unknown = Object.keys(supplied).filter(
    (name) => !Object.hasOwn(manifest.options, name),
  );
  if (unknown.length) {
    fail(`unknown architecture options: ${unknown.join(", ")}`);
  }
  const resolvedOptions = {};
  for (const [name, definition] of Object.entries(manifest.options)) {
    if (Object.hasOwn(supplied, name)) {
      resolvedOptions[name] = validateOptionValue(
        name,
        definition,
        supplied[name],
      );
    } else if (Object.hasOwn(definition, "default")) {
      resolvedOptions[name] = definition.default;
    } else if (definition.required) {
      fail(`missing required architecture option: --${name}`);
    }
  }
  return resolvedOptions;
}

function buildArchitectureSelection(architecture, supplied) {
  const options = resolveArchitectureOptions(architecture.manifest, supplied);
  return {
    $schema: "./architecture.schema.json",
    version: 2,
    id: architecture.manifest.id,
    packageName: architecture.manifest.packageName,
    packageVersion: architecture.manifest.version,
    manifestSha256: architecture.manifestSha256,
    packageSha256: architecture.packageSha256,
    profile: architecture.profile,
    source: architecture.source,
    components: architecture.manifest.components,
    capabilities: architecture.manifest.capabilities,
    options,
    entrypointCapabilityFloors:
      architecture.manifest.entrypointCapabilityFloors,
    projectDocuments: architecture.manifest.projectDocuments,
    installedFiles: architecture.installedFiles,
    installedVerifier: architecture.manifest.verification.installedModule,
    controllerCommands: Object.fromEntries(
      controllers.map((controller) => [
        controller,
        architecture.manifest.controllers[controller].initializeCommand,
      ]),
    ),
  };
}

export function preflightArchitectureSelection(
  target,
  architecture,
  supplied = {},
) {
  if (!isAbsolute(target)) fail("target must be an absolute path");
  const selection = buildArchitectureSelection(architecture, supplied);
  const directory = resolve(target, ".parallel-slices");
  const path = resolve(directory, "architecture.json");
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) {
    fail(`refusing symlinked architecture profile directory: ${directory}`);
  }
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    fail(`refusing symlinked architecture profile: ${path}`);
  }
  if (existsSync(path)) {
    let current;
    try {
      current = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      fail(`cannot read existing architecture profile: ${error.message}`);
    }
    if (JSON.stringify(current) === JSON.stringify(selection)) {
      return { current: true, selection };
    }
    fail(
      "refusing to replace a different architecture selection; use an explicit, reviewed migration",
    );
  }
  return { current: false, selection };
}

export function writeArchitectureSelection(
  target,
  architecture,
  supplied = {},
) {
  const { current, selection } = preflightArchitectureSelection(
    target,
    architecture,
    supplied,
  );
  if (current) return selection;
  const directory = resolve(target, ".parallel-slices");
  const path = resolve(directory, "architecture.json");
  mkdirSync(directory, { recursive: true });
  if (lstatSync(directory).isSymbolicLink()) {
    fail(`refusing symlinked architecture profile directory: ${directory}`);
  }
  const temporary = `${path}.incoming-${process.pid}`;
  if (existsSync(temporary))
    fail(`stale architecture profile exists: ${temporary}`);
  writeFileSync(temporary, `${JSON.stringify(selection, null, 2)}\n`, {
    flag: "wx",
  });
  renameSync(temporary, path);
  return selection;
}

function parseOptionsJson(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    assertObject(parsed, "architecture options JSON");
    return parsed;
  } catch (error) {
    fail(`invalid architecture options JSON: ${error.message}`);
  }
}

async function runCli(argv) {
  const [command, reference = "nextjs-gcp-postgres", ...rest] = argv;
  if (command === "create") {
    if (reference !== "--config" || rest.length !== 2 || !isAbsolute(rest[1])) {
      fail(
        "usage: architecture-package.mjs create --config /path/to/architecture-package-authoring.json /absolute/path/to/package",
      );
    }
    const config = loadArchitectureAuthoringConfig(rest[0]);
    const target = createArchitecturePackage(
      rest[1],
      config,
      loadArchitecturePackage,
    );
    const architecture = loadArchitecturePackage(target);
    console.log(
      `created architecture package: ${architecture.manifest.packageName}@${architecture.manifest.version} at ${target}`,
    );
    console.log(
      `next: replace the minimal scaffold, extend the verifier, add package tests, then run architecture-package.mjs test ${target}`,
    );
    return;
  }
  const load = (profile) =>
    loadArchitecturePackage(reference, undefined, profile);
  if (command === "validate" && rest.length <= 1) {
    const architecture = load(rest[0]);
    console.log(
      `architecture package valid: ${architecture.manifest.id}@${architecture.manifest.version} profile=${architecture.profile}`,
    );
    return;
  }
  if (command === "inspect" && rest.length <= 1) {
    const architecture = load(rest[0]);
    console.log(
      JSON.stringify(
        {
          id: architecture.manifest.id,
          packageName: architecture.manifest.packageName,
          version: architecture.manifest.version,
          profile: architecture.profile,
          profiles: Object.keys(
            JSON.parse(readFileSync(architecture.manifestPath, "utf8")).profiles
              ?.definitions || { default: {} },
          ),
          options: architecture.manifest.options,
          components: architecture.manifest.components,
          capabilities: architecture.manifest.capabilities,
          installedFiles: architecture.installedFiles,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "test" && rest.length === 0) {
    const architecture = load();
    const sourceManifest = JSON.parse(
      readFileSync(architecture.manifestPath, "utf8"),
    );
    const profiles = Object.keys(
      sourceManifest.profiles?.definitions || { default: {} },
    );
    for (const profile of profiles) {
      const selected = load(profile);
      resolveArchitectureOptions(selected.manifest);
    }
    const generator = await import(
      `${pathToFileURL(architecture.generatorPath).href}?conformance=${Date.now()}`
    );
    if (typeof generator.generateArchitecture !== "function") {
      fail(
        `${architecture.manifest.id} must export generateArchitecture(context)`,
      );
    }
    console.log(
      `architecture package conformance passed: ${architecture.manifest.packageName}@${architecture.manifest.version} (${profiles.length} profile${profiles.length === 1 ? "" : "s"})`,
    );
    return;
  }
  if (command === "overlay" && rest.length <= 1) {
    const architecture = load(rest[0]);
    for (const layer of architecture.overlayLayers) console.log(layer.root);
    return;
  }
  if (command === "required-files" && rest.length <= 1) {
    const architecture = load(rest[0]);
    for (const path of architecture.installedFiles) console.log(path);
    return;
  }
  if (command === "root-instructions" && rest.length <= 1) {
    const architecture = load(rest[0]);
    console.log(architecture.rootInstructionsPath);
    return;
  }
  if (command === "verifier" && rest.length <= 1) {
    const architecture = load(rest[0]);
    console.log(architecture.verifierPath);
    return;
  }
  if (
    command === "initialize-command" &&
    rest.length >= 1 &&
    rest.length <= 2
  ) {
    const architecture = load(rest[1]);
    const controller = rest[0];
    if (!controllers.includes(controller))
      fail(`unknown controller: ${controller}`);
    console.log(
      architecture.manifest.controllers[controller].initializeCommand,
    );
    return;
  }
  if (command === "install-profile" && rest.length >= 1 && rest.length <= 4) {
    const architecture = load(rest[2]);
    architecture.source =
      parseArchitectureSourceMetadata(rest[3], architecture.manifest) ||
      architecture.source;
    const target = rest[0];
    const selection = writeArchitectureSelection(
      target,
      architecture,
      parseOptionsJson(rest[1]),
    );
    console.log(
      `architecture: ${selection.id}@${selection.packageVersion} (${selection.packageName})`,
    );
    return;
  }
  if (command === "preflight-profile" && rest.length >= 1 && rest.length <= 4) {
    const architecture = load(rest[2]);
    architecture.source =
      parseArchitectureSourceMetadata(rest[3], architecture.manifest) ||
      architecture.source;
    const target = rest[0];
    const { selection } = preflightArchitectureSelection(
      target,
      architecture,
      parseOptionsJson(rest[1]),
    );
    console.log(
      `architecture selection valid: ${selection.id}@${selection.packageVersion}`,
    );
    return;
  }
  fail(
    "usage: architecture-package.mjs " +
      "create --config <authoring-config> <absolute-target> | " +
      "validate|inspect|overlay|required-files|root-instructions|verifier <architecture> [profile] | " +
      "test <architecture> | " +
      "initialize-command <architecture> <controller> [profile] | " +
      "preflight-profile|install-profile <architecture> <absolute-target> [options-json] [profile] [source-json]",
  );
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]));
if (isMain) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`ARCHITECTURE PACKAGE ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
