#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  agentDefinitions,
  validateAgent,
} from "../../repo-overlay/scripts/parallel-slices/agent-profile.mjs";
import { forbiddenTailwindPackages } from "./repo-overlay/scripts/architecture/nextjs-cloudflare-supabase/verify.mjs";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const scaffoldRoot = join(packageRoot, "scaffold");
const templateRoot = join(scaffoldRoot, "templates");
const generatedApplicationPath = "apps/web";
const upstreamDocsApplicationPath = "apps/docs";
const supportedNodeEngineRange = "^22.0.0 || ^24.0.0";
const generatedNodePin = "24";
const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

function fail(message) {
  throw new Error(message);
}

function readJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function writeJsonFile(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function baselineDependencyVersion(baseline, name) {
  return baseline.dependencies?.[name] || baseline.devDependencies?.[name];
}

function applyDependencyBaseline(manifest, baseline) {
  for (const section of dependencySections) {
    for (const name of Object.keys(manifest[section] || {})) {
      const version = baselineDependencyVersion(baseline, name);
      if (version) manifest[section][name] = version;
    }
  }
}

function configureRootPackage(root, baseline, requestedManager) {
  const packagePath = join(root, "package.json");
  const manifest = readJsonFile(packagePath, "package.json");
  const declaredSpec = manifest.packageManager;
  const declaredManager =
    declaredSpec?.split("@")[0] || manifest.devEngines?.packageManager?.name;
  const manager = requestedManager || declaredManager;
  if (!manager || !["npm", "pnpm", "yarn", "bun"].includes(manager)) {
    fail("generated root package must identify npm, pnpm, yarn, or bun");
  }
  if (declaredManager && declaredManager !== manager) {
    fail(
      `generated package manager ${declaredManager} does not match ${manager}`,
    );
  }
  const managerVersion = baseline.parallelSlices.packageManagers[manager];
  if (!/^\d+\.\d+\.\d+$/.test(managerVersion || "")) {
    fail(`scaffold baseline must pin an exact ${manager} version`);
  }
  manifest.packageManager = `${manager}@${managerVersion}`;
  manifest.devDependencies ||= {};
  delete manifest.devDependencies["@cursor/sdk"];
  manifest.engines ||= {};
  manifest.engines.node = baseline.parallelSlices.node.engines;
  applyDependencyBaseline(manifest, baseline);

  const postcss = baseline.devDependencies.postcss;
  manifest.overrides ||= {};
  manifest.overrides.postcss = postcss;
  manifest.pnpm ||= {};
  manifest.pnpm.overrides ||= {};
  manifest.pnpm.overrides.postcss = postcss;
  manifest.resolutions ||= {};
  manifest.resolutions.postcss = postcss;
  writeJsonFile(packagePath, manifest);
  return manifest.packageManager;
}

function writeNodeVersion(root, baseline) {
  writeFileSync(
    join(root, ".node-version"),
    `${baseline.parallelSlices.node.pin}\n`,
  );
}

export function loadScaffoldBaseline() {
  const baseline = readJsonFile(
    join(scaffoldRoot, "package.json"),
    "architectures/nextjs-cloudflare-supabase/scaffold/package.json",
  );
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, version] of Object.entries(baseline[section] || {})) {
      if (!/^\d+\.\d+\.\d+$/.test(version)) {
        fail(
          `architectures/nextjs-cloudflare-supabase/scaffold/package.json must pin ${name} to an exact version`,
        );
      }
    }
  }
  for (const manager of ["npm", "pnpm", "yarn", "bun"]) {
    if (
      !/^\d+\.\d+\.\d+$/.test(
        baseline.parallelSlices?.packageManagers?.[manager] || "",
      )
    ) {
      fail(
        `architectures/nextjs-cloudflare-supabase/scaffold/package.json must pin ${manager} to an exact version`,
      );
    }
  }
  for (const name of Object.keys(
    baseline.parallelSlices?.compatibilityHolds || {},
  )) {
    if (!baselineDependencyVersion(baseline, name)) {
      fail(`scaffold compatibility hold names unknown dependency ${name}`);
    }
  }
  for (const manager of Object.keys(
    baseline.parallelSlices?.packageManagerHolds || {},
  )) {
    if (!baseline.parallelSlices.packageManagers[manager]) {
      fail(`scaffold package-manager hold names unknown manager ${manager}`);
    }
  }
  if (
    baseline.dependencies["@mantine/core"] !==
    baseline.dependencies["@mantine/hooks"]
  ) {
    fail("Mantine Core and Hooks must use the same exact version");
  }
  if (
    baseline.parallelSlices?.node?.engines !== supportedNodeEngineRange ||
    baseline.parallelSlices?.node?.pin !== generatedNodePin
  ) {
    fail(
      `scaffold baseline must support ${supportedNodeEngineRange} and pin generated projects to Node.js ${generatedNodePin}`,
    );
  }
  return baseline;
}

function collectPackageManifests(root, directory = root, manifests = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if ([".git", ".next", "coverage", "node_modules"].includes(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) collectPackageManifests(root, path, manifests);
    else if (entry.name === "package.json") manifests.push(path);
  }
  return manifests;
}

function workspacePackageNames(manifestPaths) {
  return new Set(
    manifestPaths
      .map((manifestPath) =>
        readJsonFile(manifestPath, "workspace package.json"),
      )
      .map((manifest) => manifest.name)
      .filter(Boolean),
  );
}

function isInternalDependency(name, version, internalPackages) {
  const usesWorkspaceProtocol = version.startsWith("workspace:");
  const isInternal = internalPackages.has(name);
  if (usesWorkspaceProtocol && !isInternal) {
    fail(`dependency ${name} uses workspace protocol without a local package`);
  }
  if (isInternal && version !== "*" && !usesWorkspaceProtocol) {
    fail(
      `local workspace dependency ${name} must use * or the workspace protocol`,
    );
  }
  return isInternal;
}

function removeForbiddenDependencies(manifest) {
  for (const section of dependencySections) {
    for (const name of forbiddenTailwindPackages) {
      if (manifest[section]) delete manifest[section][name];
    }
  }
}

function findNextApplications(root, manifestPaths) {
  return manifestPaths
    .filter((path) => relative(root, path).startsWith("apps/"))
    .filter((path) => {
      const manifest = readJsonFile(path, relative(root, path));
      return dependencySections.some((section) => manifest[section]?.next);
    })
    .map((path) => dirname(path))
    .sort();
}

function assertExpectedApplicationLayout(root, applications) {
  const retainedApplications = applications
    .map((path) => relative(root, path))
    .filter((path) => path !== upstreamDocsApplicationPath);
  if (
    retainedApplications.length !== 1 ||
    retainedApplications[0] !== generatedApplicationPath
  ) {
    fail(
      `create-turbo scaffold must contain only ${generatedApplicationPath} after removing ${upstreamDocsApplicationPath}`,
    );
  }

  const docsApplication = join(root, upstreamDocsApplicationPath);
  if (!existsSync(docsApplication)) return;
  const stat = lstatSync(docsApplication);
  if (stat.isSymbolicLink()) {
    fail(
      `refusing to remove symlinked upstream documentation application: ${upstreamDocsApplicationPath}`,
    );
  }
  if (!stat.isDirectory()) {
    fail(
      `upstream documentation application must be a directory: ${upstreamDocsApplicationPath}`,
    );
  }
}

function isInUpstreamDocsApplication(root, path) {
  const repositoryPath = relative(root, path);
  return (
    repositoryPath === upstreamDocsApplicationPath ||
    repositoryPath.startsWith(`${upstreamDocsApplicationPath}/`)
  );
}

function assertWritableFile(path) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    fail(`refusing to replace symlinked scaffold file: ${path}`);
  }
}

function copyScaffoldTemplate(template, target) {
  assertWritableFile(target);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(templateRoot, template), target);
}

function renderTemplate(template, values, label) {
  const placeholders = [...template.matchAll(/{{([A-Z_]+)}}/g)].map(
    (match) => match[1],
  );
  for (const placeholder of placeholders) {
    if (!Object.hasOwn(values, placeholder)) {
      fail(`${label} contains an unknown placeholder: ${placeholder}`);
    }
  }
  for (const [placeholder, value] of Object.entries(values)) {
    template = template.replaceAll(`{{${placeholder}}}`, value);
  }
  if (/{{[A-Z_]+}}/.test(template)) {
    fail(`${label} contains an unresolved placeholder`);
  }
  return template;
}

function writeProjectReadme(root, manager, agent, dataLayer) {
  const corepackRunner = "node scripts/parallel-slices/corepack-runner.mjs";
  const commands = {
    npm: { install: "npm ci", run: "npm run" },
    pnpm: {
      install: `${corepackRunner} pnpm install --frozen-lockfile`,
      run: `${corepackRunner} pnpm run`,
    },
    yarn: {
      install: `${corepackRunner} yarn install --immutable`,
      run: `${corepackRunner} yarn run`,
    },
    bun: { install: "bun install --frozen-lockfile", run: "bun run" },
  }[manager];
  if (!commands) fail(`unsupported README package manager: ${manager}`);
  const selectedAgent = agentDefinitions[validateAgent(agent)];
  const templateName = "project-README.md";
  const template = readFileSync(join(templateRoot, templateName), "utf8");
  const content = renderTemplate(
    template,
    {
      DEFAULT_CONTROLLER_LABEL: selectedAgent.label,
      ARCHITECTURE_PROFILE: dataLayer,
      DATA_LAYER_DESCRIPTION:
        dataLayer === "external-api-only"
          ? "external API integration without an application database"
          : "PostgreSQL data and migration contracts",
      FOUNDATION_QUALITY_DESCRIPTION:
        dataLayer === "external-api-only"
          ? "format, unit, integration, E2E, and Trivy"
          : "format, SQL security, unit, integration, E2E, and Trivy",
      INSTALL_COMMAND: commands.install,
      PACKAGE_MANAGER: manager,
      RUN_COMMAND: commands.run,
    },
    `architectures/nextjs-cloudflare-supabase/scaffold/templates/${templateName}`,
  );
  const target = join(root, "README.md");
  assertWritableFile(target);
  writeFileSync(target, content);
}

function configureApplication(root, appRoot, baseline) {
  const manifestPath = join(appRoot, "package.json");
  const manifest = readJsonFile(manifestPath, relative(root, manifestPath));
  manifest.dependencies ||= {};
  manifest.devDependencies ||= {};
  applyDependencyBaseline(manifest, baseline);
  Object.assign(manifest.dependencies, baseline.dependencies);
  Object.assign(manifest.devDependencies, {
    "@types/react": baseline.devDependencies["@types/react"],
    "@types/react-dom": baseline.devDependencies["@types/react-dom"],
    postcss: baseline.devDependencies.postcss,
    "postcss-preset-mantine":
      baseline.devDependencies["postcss-preset-mantine"],
    "postcss-simple-vars": baseline.devDependencies["postcss-simple-vars"],
  });
  removeForbiddenDependencies(manifest);
  writeJsonFile(manifestPath, manifest);

  const appDirectory = join(appRoot, "app");
  if (!existsSync(join(appDirectory, "layout.tsx"))) {
    fail(`${relative(root, appRoot)} must use the Next.js App Router`);
  }
  copyScaffoldTemplate("layout.tsx", join(appDirectory, "layout.tsx"));
  copyScaffoldTemplate("page.tsx", join(appDirectory, "page.tsx"));
  copyScaffoldTemplate("globals.css", join(appDirectory, "globals.css"));
  copyScaffoldTemplate(
    "postcss.config.mjs",
    join(appRoot, "postcss.config.mjs"),
  );
  copyScaffoldTemplate("next.config.js", join(appRoot, "next.config.js"));
  configureCloudflareAdapter(appRoot, manifestPath, baseline);
  rmSync(join(appDirectory, "page.module.css"), { force: true });
}

// The Worker bundle is produced by the OpenNext adapter rather than by `next
// build` alone, so the adapter, its wrangler configuration, and the build and
// preview scripts are part of the generated application rather than something
// added later.
function configureCloudflareAdapter(appRoot, manifestPath, baseline) {
  const manifest = readJsonFile(manifestPath, manifestPath);
  manifest.devDependencies ||= {};
  Object.assign(manifest.devDependencies, {
    "@opennextjs/cloudflare":
      baseline.devDependencies["@opennextjs/cloudflare"],
    wrangler: baseline.devDependencies.wrangler,
  });
  manifest.scripts ||= {};
  manifest.scripts["build:cloudflare"] = "opennextjs-cloudflare build";
  manifest.scripts["preview:cloudflare"] =
    "opennextjs-cloudflare build && wrangler dev";
  writeJsonFile(manifestPath, manifest);
  copyScaffoldTemplate("wrangler.jsonc", join(appRoot, "wrangler.jsonc"));
  copyScaffoldTemplate(
    "open-next.config.ts",
    join(appRoot, "open-next.config.ts"),
  );
}

function configureSharedPackages(root, baseline, manifestPaths) {
  for (const manifestPath of manifestPaths) {
    const manifest = readJsonFile(manifestPath, relative(root, manifestPath));
    removeForbiddenDependencies(manifest);
    applyDependencyBaseline(manifest, baseline);
    for (const name of ["react", "react-dom"]) {
      for (const section of dependencySections) {
        if (manifest[section]?.[name]) {
          manifest[section][name] = baseline.dependencies[name];
        }
      }
    }
    for (const name of ["@types/react", "@types/react-dom"]) {
      for (const section of dependencySections) {
        if (manifest[section]?.[name]) {
          manifest[section][name] = baseline.devDependencies[name];
        }
      }
    }
    if (manifest.devDependencies?.["@next/eslint-plugin-next"]) {
      manifest.devDependencies["@next/eslint-plugin-next"] =
        baseline.devDependencies["@next/eslint-plugin-next"];
    }
    if (relative(root, manifestPath) === "packages/ui/package.json") {
      manifest.dependencies ||= {};
      Object.assign(manifest.dependencies, {
        "@mantine/core": baseline.dependencies["@mantine/core"],
        "@mantine/hooks": baseline.dependencies["@mantine/hooks"],
        react: baseline.dependencies.react,
        "react-dom": baseline.dependencies["react-dom"],
      });
    }
    writeJsonFile(manifestPath, manifest);
  }

  const uiSource = join(root, "packages/ui/src");
  if (existsSync(uiSource)) {
    copyScaffoldTemplate("ui-button.tsx", join(uiSource, "button.tsx"));
    copyScaffoldTemplate("ui-card.tsx", join(uiSource, "card.tsx"));
    copyScaffoldTemplate("ui-code.tsx", join(uiSource, "code.tsx"));
  }
}

function assertDependencyBaselineCoverage(root, manifestPaths, baseline) {
  const internalPackages = workspacePackageNames(manifestPaths);
  for (const manifestPath of manifestPaths) {
    const repositoryPath = relative(root, manifestPath);
    const manifest = readJsonFile(manifestPath, repositoryPath);
    for (const section of dependencySections) {
      for (const [name, version] of Object.entries(manifest[section] || {})) {
        if (isInternalDependency(name, version, internalPackages)) {
          continue;
        }
        const expected = baselineDependencyVersion(baseline, name);
        if (!expected) {
          fail(
            `scaffold dependency baseline is missing ${name} from ${repositoryPath}`,
          );
        }
        if (version !== expected) {
          fail(
            `${repositoryPath} must pin ${name}@${expected}; found ${version}`,
          );
        }
      }
    }
  }
}

function assertDependencyNamesCovered(root, manifestPaths, baseline) {
  const internalPackages = workspacePackageNames(manifestPaths);
  for (const manifestPath of manifestPaths) {
    const repositoryPath = relative(root, manifestPath);
    const manifest = readJsonFile(manifestPath, repositoryPath);
    for (const section of dependencySections) {
      for (const [name, version] of Object.entries(manifest[section] || {})) {
        if (
          isInternalDependency(name, version, internalPackages) ||
          forbiddenTailwindPackages.includes(name)
        ) {
          continue;
        }
        if (!baselineDependencyVersion(baseline, name)) {
          fail(
            `scaffold dependency baseline is missing ${name} from ${repositoryPath}`,
          );
        }
      }
    }
  }
}

function removeTailwindConfiguration(root, directory = root) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if ([".git", ".next", "coverage", "node_modules"].includes(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) removeTailwindConfiguration(root, path);
    else if (/^tailwind\.config\.(cjs|js|mjs|ts)$/.test(entry.name)) {
      rmSync(path);
    }
  }
}

export function configureScaffold(root, options = {}) {
  const target = resolve(root);
  const baseline = loadScaffoldBaseline();
  const selectedAgent = validateAgent(options.agent || "cursor");
  const dataLayer = options.dataLayer || "postgres";
  if (!["postgres", "external-api-only"].includes(dataLayer)) {
    fail("dataLayer must be postgres or external-api-only");
  }
  assertWritableFile(join(target, "README.md"));
  assertWritableFile(join(target, ".node-version"));
  const manifestPaths = collectPackageManifests(target);
  const upstreamApplications = findNextApplications(target, manifestPaths);
  if (upstreamApplications.length === 0) {
    fail("create-turbo scaffold must contain at least one Next.js application");
  }
  assertExpectedApplicationLayout(target, upstreamApplications);
  assertDependencyNamesCovered(target, manifestPaths, baseline);

  rmSync(join(target, upstreamDocsApplicationPath), {
    force: true,
    recursive: true,
  });
  const retainedManifestPaths = manifestPaths.filter(
    (path) => !isInUpstreamDocsApplication(target, path),
  );
  const applications = findNextApplications(target, retainedManifestPaths);

  const packageManager = configureRootPackage(
    target,
    baseline,
    options.manager,
  );
  writeNodeVersion(target, baseline);
  configureSharedPackages(target, baseline, retainedManifestPaths);
  for (const application of applications) {
    configureApplication(target, application, baseline);
  }
  assertDependencyBaselineCoverage(target, retainedManifestPaths, baseline);
  removeTailwindConfiguration(target);
  writeProjectReadme(
    target,
    packageManager.split("@", 1)[0],
    selectedAgent,
    dataLayer,
  );

  const profile = {
    schemaVersion: 4,
    generator: {
      name: "create-turbo",
      version: options.createTurboVersion,
    },
    framework: {
      name: "next",
      version: baseline.dependencies.next,
    },
    react: { version: baseline.dependencies.react },
    review: { cursorProvider: "cursor-agent" },
    node: {
      engines: baseline.parallelSlices.node.engines,
      pin: baseline.parallelSlices.node.pin,
    },
    packageManager,
    ui: {
      library: "mantine",
      version: baseline.dependencies["@mantine/core"],
      tailwind: false,
    },
    securityOverrides: { postcss: baseline.devDependencies.postcss },
    applications: applications.map((path) => relative(target, path)),
    dataLayer,
  };
  const profilePath = join(target, ".parallel-slices/scaffold-profile.json");
  assertWritableFile(profilePath);
  mkdirSync(dirname(profilePath), { recursive: true });
  writeJsonFile(profilePath, profile);
  return profile;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]));
if (isMain) {
  try {
    if (process.argv.length !== 3) {
      fail("usage: configure-scaffold.mjs /absolute/path/to/scaffold");
    }
    const profile = configureScaffold(process.argv[2]);
    console.log(
      `Configured Next.js ${profile.framework.version} and Mantine ${profile.ui.version}`,
    );
  } catch (error) {
    console.error(`SCAFFOLD CONFIGURATION FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
