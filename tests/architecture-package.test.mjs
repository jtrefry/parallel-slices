import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  loadArchitecturePackage,
  loadArchitecturePackageSource,
  preflightArchitectureSelection,
  resolveArchitectureOptions,
  validateArchitectureProjectConfig,
  validateArchitectureManifest,
  writeArchitectureSelection,
} from "../scripts/architecture-package.mjs";
import {
  createArchitecturePackage,
  validateArchitectureAuthoringConfig,
} from "../scripts/architecture-package-authoring.mjs";
import {
  loadCreationConfig,
  validateCreationConfig,
} from "../scripts/creation-config.mjs";
import { buildOverlayPlan } from "../scripts/install-overlays.mjs";
import { readArchitectureProfile } from "../repo-overlay/scripts/parallel-slices/architecture-profile.mjs";

function companyArchitectureConfig() {
  return {
    $schema:
      "https://parallelslices.com/schemas/architecture-package-authoring.schema.json",
    version: 1,
    id: "company-web-app",
    packageName: "@example/parallel-slices-company-web-app",
    packageVersion: "0.1.0",
    displayName: "Company web application",
    description: "A synthetic company-owned architecture package.",
    defaultProfile: "external-api-only",
    components: [
      {
        id: "web-application",
        kind: "application",
        technology: "Synthetic web runtime",
        attributes: { formFactor: "web" },
      },
    ],
    capabilities: ["application:web", "data:external-api"],
  };
}

test("validates a technology-neutral architecture contract", () => {
  const current = loadArchitecturePackage("nextjs-gcp-postgres").manifest;
  const portable = structuredClone(current);
  portable.displayName = "Portable command-line application";
  portable.description =
    "A synthetic contract with no web, cloud, or backend component.";
  portable.components = [
    {
      id: "command-line-application",
      kind: "application",
      technology: "Synthetic CLI runtime",
      optional: false,
      attributes: { formFactor: "cli", backend: false },
    },
  ];
  portable.capabilities = ["application:cli"];
  portable.options = {
    "single-binary": {
      type: "boolean",
      description: "Whether the generated application is one executable.",
      default: true,
    },
    "minimum-platform-version": {
      type: "integer",
      description: "Synthetic minimum platform version.",
      default: 1,
      minimum: 1,
    },
  };

  assert.equal(
    validateArchitectureManifest(portable, "nextjs-gcp-postgres"),
    portable,
  );
  assert.deepEqual(resolveArchitectureOptions(portable, {}), {
    "minimum-platform-version": 1,
    "single-binary": true,
  });
  assert.deepEqual(
    resolveArchitectureOptions(portable, {
      "minimum-platform-version": 4,
      "single-binary": false,
    }),
    { "minimum-platform-version": 4, "single-binary": false },
  );
});

test("rejects malformed and unknown architecture options", () => {
  const architecture = loadArchitecturePackage("nextjs-gcp-postgres");
  assert.throws(
    () =>
      resolveArchitectureOptions(architecture.manifest, {
        "package-manager": "unsupported",
      }),
    /must be one of/,
  );
  assert.throws(
    () => resolveArchitectureOptions(architecture.manifest, { backend: "gcp" }),
    /unknown architecture options/,
  );
  const unsafe = structuredClone(architecture.manifest);
  unsafe.generator.module = "../outside.mjs";
  assert.throws(
    () => validateArchitectureManifest(unsafe, "nextjs-gcp-postgres"),
    /safe package-relative path/,
  );
  assert.throws(
    () => loadArchitecturePackage("../outside"),
    /invalid architecture id/,
  );
  assert.throws(
    () => loadArchitecturePackage("nextjs-gcp"),
    /unknown architecture package/,
  );
  const missingGeneratedBaseline = structuredClone(architecture.manifest);
  delete missingGeneratedBaseline.entrypointCapabilityFloors.generatedBaseline;
  assert.throws(
    () =>
      validateArchitectureManifest(
        missingGeneratedBaseline,
        "nextjs-gcp-postgres",
      ),
    /generatedBaseline capability floor/,
  );
  const splitVerifier = structuredClone(architecture.manifest);
  splitVerifier.verification.module = "generator.mjs";
  assert.throws(
    () => validateArchitectureManifest(splitVerifier, "nextjs-gcp-postgres"),
    /installed verifier inside the architecture overlay/,
  );
  const missingConfig = structuredClone(architecture.manifest);
  delete missingConfig.profiles;
  missingConfig.overlay.requiredFiles =
    missingConfig.overlay.requiredFiles.filter(
      (path) => path !== ".parallel-slices/config.json",
    );
  assert.throws(
    () => validateArchitectureManifest(missingConfig, "nextjs-gcp-postgres"),
    /must install \.parallel-slices\/config.json/,
  );
  const unnamespacedCommand = structuredClone(architecture.manifest);
  unnamespacedCommand.controllers.cursor.initializeCommand =
    "/initialize-project";
  assert.throws(
    () =>
      validateArchitectureManifest(unnamespacedCommand, "nextjs-gcp-postgres"),
    /must use the \/parallel-slices- namespace/,
  );
  const wrongCodexSigil = structuredClone(architecture.manifest);
  wrongCodexSigil.controllers.codex.initializeCommand = "/parallel-slices-init";
  assert.throws(
    () => validateArchitectureManifest(wrongCodexSigil, "nextjs-gcp-postgres"),
    /must use the \$parallel-slices- namespace/,
  );
  const unsafeStarter = structuredClone(architecture.manifest);
  unsafeStarter.starter = {
    repositoryUrl: "https://example.com/architecture-template",
    templateUrl: "https://user:secret@example.com/create?token=secret",
  };
  assert.throws(
    () => validateArchitectureManifest(unsafeStarter, "nextjs-gcp-postgres"),
    /starter\.templateUrl must be a valid public HTTPS URL/,
  );
  const negatedOption = structuredClone(architecture.manifest);
  negatedOption.options["no-telemetry"] = {
    type: "boolean",
    description: "Synthetic option shadowed by boolean negation.",
    default: false,
  };
  assert.throws(
    () => validateArchitectureManifest(negatedOption, "nextjs-gcp-postgres"),
    /no-telemetry must not use the no- prefix/,
  );
});

test("requires each architecture package to supply a valid sizing default", () => {
  const architecture = loadArchitecturePackage("nextjs-gcp-postgres");
  const config = JSON.parse(
    readFileSync(
      join(architecture.overlayRoot, ".parallel-slices/config.json"),
      "utf8",
    ),
  );
  assert.equal(
    validateArchitectureProjectConfig(config, architecture.manifest)
      .sliceCompilation.sizingStrategy,
    "throughput-balanced",
  );
  delete config.sliceCompilation;
  assert.throws(
    () => validateArchitectureProjectConfig(config, architecture.manifest),
    /architecture project config is invalid: sliceCompilation must be an object/,
  );
});

test("records one immutable selected architecture", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-architecture-"));
  const architecture = loadArchitecturePackage("nextjs-gcp-postgres");
  try {
    writeArchitectureSelection(root, architecture, {
      "package-manager": "npm",
    });
    const selected = readArchitectureProfile(root);
    assert.equal(selected.id, "nextjs-gcp-postgres");
    assert.equal(selected.packageVersion, architecture.manifest.version);
    assert.match(selected.packageSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(selected.options, { "package-manager": "npm" });
    assert.equal(selected.profile, "postgres");
    assert.deepEqual(selected.source, {
      id: "nextjs-gcp-postgres",
      type: "bundled",
    });
    assert.deepEqual(selected.installedFiles, architecture.installedFiles);
    assert.equal(
      selected.components.some((item) => item.kind === "application"),
      true,
    );
    assert.throws(
      () =>
        writeArchitectureSelection(root, architecture, {
          "package-manager": "pnpm",
        }),
      /refusing to replace a different architecture selection/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolves database and external-API profiles as complete contracts", () => {
  const postgres = loadArchitecturePackage(
    "nextjs-gcp-postgres",
    undefined,
    "postgres",
  );
  const externalApi = loadArchitecturePackage(
    "nextjs-gcp-postgres",
    undefined,
    "external-api-only",
  );

  assert.ok(
    postgres.installedFiles.includes(".parallel-slices/sql-security.json"),
  );
  assert.ok(
    postgres.installedFiles.includes(
      "apps/backend/migrations/_MIGRATION_TEMPLATE.sql",
    ),
  );
  assert.equal(
    postgres.manifest.capabilities.includes("database:postgresql"),
    true,
  );
  assert.equal(
    externalApi.installedFiles.includes(".parallel-slices/sql-security.json"),
    false,
  );
  assert.equal(
    externalApi.installedFiles.some((path) => path.includes("migrations")),
    false,
  );
  assert.equal(
    externalApi.manifest.capabilities.includes("data:external-api"),
    true,
  );
  assert.equal(
    externalApi.manifest.entrypointCapabilityFloors.ci.includes("security:sql"),
    false,
  );
  assert.match(
    externalApi.rootInstructionsPath,
    /profiles[/\\]external-api-only/,
  );
  assert.throws(
    () =>
      loadArchitecturePackage(
        "nextjs-gcp-postgres",
        undefined,
        "unknown-profile",
      ),
    /profile must be one of/,
  );
});

test("creates and loads a company-owned local architecture package", async () => {
  const root = mkdtempSync(
    join(tmpdir(), "parallel-slices-package-authoring-"),
  );
  const target = join(root, "company-web-app");
  const rejected = join(root, "rejected-package");
  const config = companyArchitectureConfig();
  try {
    validateArchitectureAuthoringConfig(config);
    assert.throws(
      () =>
        createArchitecturePackage(rejected, config, () => {
          throw new Error("synthetic conformance refusal");
        }),
      /synthetic conformance refusal/,
    );
    assert.equal(existsSync(rejected), false);
    createArchitecturePackage(target, config, loadArchitecturePackage);
    const architecture = loadArchitecturePackageSource(
      { type: "local", path: "./company-web-app" },
      root,
    );
    assert.equal(
      architecture.manifest.packageName,
      "@example/parallel-slices-company-web-app",
    );
    assert.equal(architecture.profile, "external-api-only");
    assert.deepEqual(architecture.source, { type: "local" });
    assert.equal(existsSync(join(target, "AGENTS.md")), true);
    assert.equal(existsSync(join(target, "generator.mjs")), true);
    assert.equal(existsSync(join(target, "tests/generator.test.mjs")), true);
    execFileSync(process.execPath, ["--test", "tests/generator.test.mjs"], {
      cwd: target,
      stdio: "pipe",
    });
    const generator = await import(
      `${pathToFileURL(join(target, "generator.mjs")).href}?test=1`
    );
    const generated = join(root, "generated");
    generator.generateArchitecture({
      packageRoot: target,
      target: generated,
    });
    assert.equal(existsSync(join(generated, "package.json")), true);
    assert.throws(
      () => createArchitecturePackage(target, config, loadArchitecturePackage),
      /target exists/,
    );
    symlinkSync("README.md", join(target, "linked-readme.md"));
    assert.throws(
      () => loadArchitecturePackage(target),
      /must not contain symbolic links/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolves an exact installed npm architecture package", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-npm-package-"));
  const packageRoot = join(
    root,
    "node_modules/@example/parallel-slices-company-web-app",
  );
  try {
    createArchitecturePackage(
      packageRoot,
      companyArchitectureConfig(),
      loadArchitecturePackage,
    );
    const architecture = loadArchitecturePackageSource(
      {
        type: "npm",
        package: "@example/parallel-slices-company-web-app",
        version: "0.1.0",
      },
      root,
    );
    assert.equal(architecture.profile, "external-api-only");
    assert.deepEqual(architecture.source, {
      package: "@example/parallel-slices-company-web-app",
      type: "npm",
      version: "0.1.0",
    });
    assert.match(architecture.packageSha256, /^[a-f0-9]{64}$/);
    assert.throws(
      () =>
        loadArchitecturePackageSource(
          {
            type: "npm",
            package: "@example/parallel-slices-company-web-app",
            version: "0.2.0",
          },
          root,
        ),
      /must match/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses unsafe or unavailable external architecture sources", () => {
  assert.throws(
    () =>
      loadArchitecturePackageSource({
        type: "local",
        path: "/absolute/company-package",
      }),
    /must be a relative path/,
  );
  assert.throws(
    () =>
      loadArchitecturePackageSource({
        type: "npm",
        package: "@example/uninstalled-architecture",
        version: "1.2.3",
      }),
    /npm architecture package is unavailable/,
  );
});

test("validates creation configuration and refuses a symlinked config", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-create-config-"));
  const configPath = join(root, "parallel-slices.create.json");
  const linkedPath = join(root, "linked.create.json");
  const config = {
    $schema: "https://parallelslices.com/schemas/create-config.schema.json",
    version: 1,
    defaultController: "cursor",
    architecture: {
      source: { type: "bundled", id: "nextjs-gcp-postgres" },
      profile: "external-api-only",
      options: { "package-manager": "npm" },
    },
  };
  try {
    validateCreationConfig(config);
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const loaded = loadCreationConfig(configPath);
    assert.equal(loaded.architecture.profile, "external-api-only");
    symlinkSync(configPath, linkedPath);
    assert.throws(
      () => loadCreationConfig(linkedPath),
      /refusing symlinked creation config/,
    );
    assert.throws(
      () => validateCreationConfig({ ...config, target: "/tmp/project" }),
      /unknown fields: target/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preflights options and selection immutability without writing", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-preflight-"));
  const architecture = loadArchitecturePackage("nextjs-gcp-postgres");
  try {
    assert.throws(
      () =>
        preflightArchitectureSelection(root, architecture, {
          "package-manager": "unsupported",
        }),
      /must be one of/,
    );
    assert.equal(existsSync(join(root, ".parallel-slices")), false);
    const result = preflightArchitectureSelection(root, architecture, {
      "package-manager": "pnpm",
    });
    assert.equal(result.current, false);
    assert.equal(existsSync(join(root, ".parallel-slices")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses architecture overlay collisions before writing", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-overlay-"));
  const overlay = join(root, "overlay");
  const target = join(root, "target");
  try {
    mkdirSync(overlay);
    mkdirSync(target);
    mkdirSync(join(overlay, ".parallel-slices"));
    writeFileSync(join(overlay, ".parallel-slices", "agent.json"), "{}\n");
    assert.throws(
      () => buildOverlayPlan({ overlayRoot: overlay }, target),
      /conflicts with core files: .parallel-slices\/agent.json/,
    );

    rmSync(join(overlay, ".parallel-slices"), { recursive: true });
    writeFileSync(join(overlay, "architecture-file.txt"), "safe\n");
    const outside = join(root, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(target, "scripts"));
    writeFileSync(join(overlay, "scripts"), "not a directory\n");
    assert.throws(
      () => buildOverlayPlan({ overlayRoot: overlay }, target),
      /target symlink/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the package manifest and schema remain parseable JSON", () => {
  assert.doesNotThrow(() =>
    JSON.parse(
      readFileSync(
        new URL("../schemas/architecture-package.schema.json", import.meta.url),
        "utf8",
      ),
    ),
  );
});
