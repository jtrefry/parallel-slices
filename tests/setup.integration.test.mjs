import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { bootstrapNewProject } from "../scripts/bootstrap-new.mjs";
import { loadScaffoldBaseline } from "../architectures/nextjs-gcp-postgres/configure-scaffold.mjs";
import {
  recordGeneratedBaseline,
  verifyGeneratedBaseline,
} from "../repo-overlay/scripts/parallel-slices/generated-baseline.mjs";
import {
  parallelSlicesRoot,
  run,
  write,
  writeInitializedContract,
  writeScaffold,
} from "./helpers/fixture.mjs";

function createBootstrapRunner() {
  return (command, args, options) => {
    if (args.some((argument) => argument.startsWith("create-turbo@"))) {
      const stagedProject = args.find((argument) =>
        argument.includes(".parallel-slices-create-"),
      );
      assert.ok(stagedProject);
      writeScaffold(stagedProject, {
        foundationDependencies: false,
        nextApps: true,
        qualityScripts: true,
      });
      return;
    }
    if (command === "npm" && args[0] === "install") return;
    run(command, args, options.cwd, { quiet: true });
  };
}

test("creates a verified Codex project atomically on a non-protected branch", async () => {
  const parent = mkdtempSync(join(tmpdir(), "parallel-slices-bootstrap-"));
  const target = join(parent, "example-platform");
  try {
    const installCuratedSkills = (project) => {
      for (const directory of [
        ".agents/skills",
        ".cursor/skills",
        ".claude/skills",
      ]) {
        write(
          project,
          `${directory}/vercel-react-best-practices/SKILL.md`,
          "---\nname: vercel-react-best-practices\nlicense: MIT\n---\n",
        );
        write(
          project,
          `${directory}/vercel-composition-patterns/SKILL.md`,
          "---\nname: vercel-composition-patterns\nlicense: MIT\n---\n",
        );
      }
    };

    await bootstrapNewProject({
      agent: "codex",
      manager: "npm",
      target,
      runCommand: createBootstrapRunner(),
      installCuratedSkills,
    });
    assert.doesNotThrow(() => verifyGeneratedBaseline(target));
    rmSync(join(target, ".parallel-slices/generated-baseline.json"));
    write(
      target,
      "docs/obsolete-generated-file.md",
      "# Obsolete generated file\n",
    );
    recordGeneratedBaseline(target);
    const remoteBase = join(parent, "remote-base");
    mkdirSync(remoteBase);
    run("git", ["init", "-b", "main"], remoteBase);
    write(remoteBase, "README.md", "# Initial repository\n");
    run("git", ["add", "README.md"], remoteBase);
    run(
      "git",
      [
        "-c",
        "user.name=Starter Test",
        "-c",
        "user.email=starter@example.test",
        "commit",
        "-m",
        "chore: initialize repository",
      ],
      remoteBase,
    );
    run("git", ["remote", "add", "origin", remoteBase], target);
    run("git", ["fetch", "origin", "main"], target);
    run(
      "git",
      [
        "update-ref",
        "refs/heads/chore/initialize-project",
        "refs/remotes/origin/main",
      ],
      target,
    );
    run("git", ["read-tree", "refs/remotes/origin/main"], target);
    run("git", ["add", "-A"], target);
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
        target,
      ).toString(),
      /preCommit entry point passed for pristine generated baseline/,
    );
    const generatedReadme = readFileSync(join(target, "README.md"), "utf8");
    write(target, "README.md", `${generatedReadme}\nmodified\n`);
    run("git", ["add", "README.md"], target);
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
          target,
          { quiet: true },
        ),
      /generated baseline file changed: README\.md/,
    );
    write(target, "README.md", generatedReadme);
    run("git", ["add", "README.md"], target);
    run(
      "git",
      [
        "-c",
        "user.name=Starter Test",
        "-c",
        "user.email=starter@example.test",
        "commit",
        "-m",
        "chore: publish generated starter",
      ],
      target,
    );
    assert.match(
      run(
        "node",
        [
          "scripts/parallel-slices/quality.mjs",
          "entrypoint",
          "prePush",
          "--base",
          "origin/main",
          "--remote",
          "origin",
        ],
        target,
      ).toString(),
      /prePush entry point passed for pristine generated baseline/,
    );
    write(target, "README.md", `${generatedReadme}\nrefreshed\n`);
    rmSync(join(target, "docs/obsolete-generated-file.md"));
    rmSync(join(target, ".parallel-slices/generated-baseline.json"));
    run("git", ["add", "README.md", "docs/obsolete-generated-file.md"], target);
    recordGeneratedBaseline(target);
    run("git", ["reset", "HEAD", "--", "README.md"], target);
    run("git", ["add", ".parallel-slices/generated-baseline.json"], target);
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
          target,
          { quiet: true },
        ),
      /must not leave unstaged tracked changes: README\.md/,
    );
    run("git", ["add", "-A"], target);
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
        target,
      ).toString(),
      /preCommit entry point passed for pristine generated baseline/,
    );
    assert.equal(
      existsSync(join(target, ".cursor/commands/parallel-slices-init.md")),
      true,
    );
    assert.equal(
      existsSync(join(target, ".cursor/commands/slices-init.md")),
      true,
    );
    assert.equal(
      existsSync(join(target, ".cursor/commands/initialize-project.md")),
      false,
    );
    const architecture = JSON.parse(
      readFileSync(join(target, ".parallel-slices/architecture.json"), "utf8"),
    );
    assert.equal(architecture.id, "nextjs-gcp-postgres");
    assert.equal(
      architecture.packageName,
      "@parallel-slices/architecture-nextjs-gcp-postgres",
    );
    assert.deepEqual(architecture.options, { "package-manager": "npm" });
    assert.deepEqual(architecture.controllerCommands, {
      cursor: "/parallel-slices-init",
      codex: "$parallel-slices-init",
      "claude-code": "/parallel-slices-init",
    });
    const installedConfig = JSON.parse(
      readFileSync(join(target, ".parallel-slices/config.json"), "utf8"),
    );
    assert.equal(installedConfig.version, 5);
    assert.equal(
      installedConfig.sliceCompilation.sizingStrategy,
      "throughput-balanced",
    );
    const compilationSnapshot = JSON.parse(
      run(
        "node",
        ["scripts/parallel-slices/slice-compilation.mjs", "snapshot", target],
        target,
      ).toString(),
    );
    assert.equal(compilationSnapshot.sizingStrategy, "throughput-balanced");
    assert.match(compilationSnapshot.configSha256, /^[a-f0-9]{64}$/);
    assert.equal(
      compilationSnapshot.architectureManifestSha256,
      architecture.manifestSha256,
    );
    installedConfig.sliceCompilation.sizingStrategy = "isolation-first";
    write(
      target,
      ".parallel-slices/config.json",
      `${JSON.stringify(installedConfig, null, 2)}\n`,
    );
    const overrideSnapshot = JSON.parse(
      run(
        "node",
        ["scripts/parallel-slices/slice-compilation.mjs", "snapshot", target],
        target,
      ).toString(),
    );
    assert.equal(overrideSnapshot.sizingStrategy, "isolation-first");
    installedConfig.sliceCompilation.sizingStrategy = "throughput-balanced";
    write(
      target,
      ".parallel-slices/config.json",
      `${JSON.stringify(installedConfig, null, 2)}\n`,
    );
    const legacyNamespaceWords = ["app", "fac" + "tory"];
    const legacyNamespace = `${"."}${legacyNamespaceWords.join("-")}`;
    assert.equal(existsSync(join(target, legacyNamespace)), false);
    assert.equal(
      existsSync(join(target, "scripts", legacyNamespaceWords.join("-"))),
      false,
    );
    assert.equal(
      existsSync(join(target, "docs", legacyNamespaceWords.join("-"))),
      false,
    );
    assert.equal(existsSync(join(target, "AGENTS.md")), true);
    assert.equal(
      existsSync(
        join(target, ".agents/skills/vercel-react-best-practices/SKILL.md"),
      ),
      true,
    );
    assert.equal(
      existsSync(
        join(target, ".agents/skills/vercel-composition-patterns/SKILL.md"),
      ),
      true,
    );
    assert.equal(
      run("git", ["branch", "--show-current"], target).trim(),
      "chore/initialize-project",
    );
    assert.equal(
      JSON.parse(
        readFileSync(join(target, ".parallel-slices/agent.json"), "utf8"),
      ).defaultController,
      "codex",
    );
    assert.deepEqual(
      JSON.parse(
        readFileSync(join(target, ".parallel-slices/agent.json"), "utf8"),
      ).enabledControllers,
      ["cursor", "codex", "claude-code"],
    );
    assert.deepEqual(
      JSON.parse(
        readFileSync(join(target, ".parallel-slices/repository.json"), "utf8"),
      ),
      {
        $schema: "./repository.schema.json",
        version: 1,
        mode: "local-only",
        remote: "origin",
        baseBranch: "main",
      },
    );
    for (const command of ["init", "plan", "prepare", "next", "status"]) {
      for (const prefix of ["parallel-slices", "slices"]) {
        assert.equal(
          existsSync(join(target, `.cursor/commands/${prefix}-${command}.md`)),
          true,
        );
        assert.equal(
          existsSync(
            join(target, `.claude/skills/${prefix}-${command}/SKILL.md`),
          ),
          true,
        );
        assert.equal(
          existsSync(
            join(target, `.agents/skills/${prefix}-${command}/SKILL.md`),
          ),
          true,
        );
      }
    }
    for (const oldPath of [
      ".cursor/commands/plan-milestone.md",
      ".cursor/commands/prepare-loop.md",
      ".cursor/commands/run-next-slice.md",
      ".claude/skills/initialize-nextjs-gcp-project/SKILL.md",
      ".agents/skills/initialize-nextjs-gcp-project/SKILL.md",
      ".claude/skills/initialize-nextjs-gcp-postgres-project/SKILL.md",
      ".agents/skills/initialize-nextjs-gcp-postgres-project/SKILL.md",
      ".claude/skills/parallel-slices-plan-milestone/SKILL.md",
      ".claude/skills/parallel-slices-prepare-goal/SKILL.md",
      ".claude/skills/parallel-slices-run/SKILL.md",
      ".agents/skills/parallel-slices-plan-milestone/SKILL.md",
      ".agents/skills/parallel-slices-prepare-goal/SKILL.md",
      ".agents/skills/parallel-slices-run/SKILL.md",
    ]) {
      assert.equal(existsSync(join(target, oldPath)), false);
    }
    assert.equal(
      existsSync(join(target, "scripts/parallel-slices/run-status.mjs")),
      true,
    );
    assert.equal(
      existsSync(join(target, "scripts/parallel-slices/run-tracking.mjs")),
      true,
    );
    assert.equal(
      existsSync(join(target, "docs/parallel-slices/robust-recovery.md")),
      true,
    );
    assert.equal(
      existsSync(join(target, "docs/parallel-slices/README.md")),
      true,
    );
    const documentationInstructions = readFileSync(
      join(target, "docs/AGENTS.md"),
      "utf8",
    );
    assert.match(
      documentationInstructions,
      /never place a Next\.js application/,
    );
    assert.match(
      documentationInstructions,
      /Product Plans.*docs\/plans\/YYYY-MM-DD-/s,
    );
    assert.doesNotThrow(() =>
      run(
        "git",
        [
          "check-ignore",
          "--quiet",
          ".parallel-slices/runtime/runs/example/index.json",
        ],
        target,
      ),
    );
    assert.equal(
      existsSync(join(target, ".parallel-slices/review.json")),
      true,
    );
    assert.equal(
      existsSync(
        join(target, "scripts/parallel-slices/cursor-review-provider.mjs"),
      ),
      false,
    );
    const reviewSchema = JSON.parse(
      readFileSync(join(target, ".parallel-slices/review.schema.json"), "utf8"),
    );
    assert.ok(
      reviewSchema.$defs.reviewer.properties.provider.enum.includes("cursor"),
    );
    assert.equal(
      existsSync(join(target, "docs/parallel-slices/multi-agent-review.md")),
      true,
    );
    assert.equal(
      existsSync(
        join(target, "docs/parallel-slices/assets/multi-agent-review.svg"),
      ),
      true,
    );
    assert.match(
      readFileSync(
        join(target, "docs/parallel-slices/multi-agent-review.md"),
        "utf8",
      ),
      /src="assets\/multi-agent-review\.svg"/,
    );
    assert.equal(
      existsSync(join(target, "docs/plans/reviews/AGENTS.md")),
      true,
    );
    assert.equal(
      existsSync(
        join(target, "docs/testing/manual/multi-agent-review-test-script.md"),
      ),
      true,
    );
    assert.equal(
      readdirSync(parent).some((entry) =>
        entry.startsWith(".parallel-slices-create-"),
      ),
      false,
    );
    const profile = JSON.parse(
      readFileSync(
        join(target, ".parallel-slices/scaffold-profile.json"),
        "utf8",
      ),
    );
    const webPackage = JSON.parse(
      readFileSync(join(target, "apps/web/package.json"), "utf8"),
    );
    const rootPackage = JSON.parse(
      readFileSync(join(target, "package.json"), "utf8"),
    );
    assert.equal(profile.ui.library, "mantine");
    assert.equal(profile.ui.tailwind, false);
    assert.equal(profile.schemaVersion, 4);
    assert.equal(profile.dataLayer, "postgres");
    assert.deepEqual(profile.node, {
      engines: "^22.0.0 || ^24.0.0",
      pin: "24",
    });
    assert.deepEqual(profile.applications, ["apps/web"]);
    assert.equal(existsSync(join(target, "apps/docs")), false);
    assert.equal(existsSync(join(target, "docs/AGENTS.md")), true);
    assert.match(profile.packageManager, /^npm@\d+\.\d+\.\d+$/);
    assert.equal(webPackage.dependencies.next, profile.framework.version);
    assert.equal(webPackage.dependencies["@mantine/core"], profile.ui.version);
    assert.deepEqual(profile.review, { cursorProvider: "cursor-agent" });
    assert.equal(rootPackage.devDependencies["@cursor/sdk"], undefined);
    assert.equal("tailwindcss" in webPackage.dependencies, false);
    assert.equal(rootPackage.engines.node, profile.node.engines);
    assert.equal(readFileSync(join(target, ".node-version"), "utf8"), "24\n");
    const rootReadme = readFileSync(join(target, "README.md"), "utf8");
    assert.match(rootReadme, /Default controller: `Codex`/);
    assert.match(
      rootReadme,
      /This starter project was generated by\s+\[Parallel Slices\]\(https:\/\/github\.com\/jtrefry\/parallel-slices\)/,
    );
    assert.match(
      rootReadme,
      /\[Mechanism map\]\(https:\/\/github\.com\/jtrefry\/parallel-slices\/blob\/main\/docs\/mechanism-map\.md\)/,
    );
    assert.match(
      rootReadme,
      /\[Pipeline walkthrough\]\(https:\/\/github\.com\/jtrefry\/parallel-slices\/blob\/main\/docs\/pipeline-walkthrough\.md\)/,
    );
    assert.match(
      rootReadme,
      /\[Codex\]\(docs\/parallel-slices\/using-codex\.md\)/,
    );
    assert.match(
      rootReadme,
      /\[Cursor\]\(docs\/parallel-slices\/using-cursor\.md\)/,
    );
    assert.match(
      rootReadme,
      /\[Claude Code\]\(docs\/parallel-slices\/using-claude-code\.md\)/,
    );
    assert.match(rootReadme, /Node\.js 22 LTS or 24 LTS/);
    assert.match(
      rootReadme,
      /review provider only when multi-agent review is enabled/,
    );
    assert.match(
      rootReadme,
      /Multi-agent planning and integrated slice\/code review is optional/,
    );
    assert.match(rootReadme, /"enabled": false/);
    assert.ok(
      rootReadme.indexOf('"enabled": false') <
        rootReadme.indexOf("## Understand the complete workflow"),
    );
    assert.match(rootReadme, /Docker Desktop/);
    assert.doesNotMatch(rootReadme, /## What the workflow does/);
    assert.match(
      rootReadme,
      /`apps\/web\/` is the starter Next\.js application/,
    );
    assert.doesNotMatch(rootReadme, /apps\/docs/);
    assert.match(
      rootReadme,
      /`docs\/plans\/` holds human-approved Product Plans, compiled scope manifests/,
    );
    assert.match(
      readFileSync(join(target, "apps/web/app/layout.tsx"), "utf8"),
      /<MantineProvider/,
    );
    assert.equal(
      existsSync(join(target, "apps/web/tailwind.config.ts")),
      false,
    );
    const installedConfigPath = join(target, ".parallel-slices/config.json");
    const outsideConfigPath = join(parent, "outside-config.json");
    writeFileSync(outsideConfigPath, readFileSync(installedConfigPath, "utf8"));
    rmSync(installedConfigPath);
    symlinkSync(outsideConfigPath, installedConfigPath);
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/slice-compilation.mjs", "snapshot", target],
          target,
        ),
      /refusing symlinked slice-compilation configuration/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("creates the external-API profile without database tooling", async () => {
  const parent = mkdtempSync(join(tmpdir(), "parallel-slices-api-bootstrap-"));
  const target = join(parent, "api-platform");
  try {
    await bootstrapNewProject({
      architectureProfile: "external-api-only",
      manager: "npm",
      target,
      runCommand: createBootstrapRunner(),
      installCuratedSkills: () => {},
    });
    const architecture = JSON.parse(
      readFileSync(join(target, ".parallel-slices/architecture.json"), "utf8"),
    );
    const config = JSON.parse(
      readFileSync(join(target, ".parallel-slices/config.json"), "utf8"),
    );
    const qualityWorkflow = readFileSync(
      join(target, ".github/workflows/quality.yml"),
      "utf8",
    );
    const deployWorkflow = readFileSync(
      join(target, ".github/workflows/deploy-cloud-run.yml"),
      "utf8",
    );
    const readme = readFileSync(join(target, "README.md"), "utf8");

    assert.equal(architecture.profile, "external-api-only");
    assert.match(architecture.packageSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(architecture.source, {
      id: "nextjs-gcp-postgres",
      type: "bundled",
    });
    assert.equal(architecture.capabilities.includes("data:external-api"), true);
    assert.equal(
      architecture.capabilities.includes("database:postgresql"),
      false,
    );
    assert.equal(config.steps["sql-security"], undefined);
    assert.equal(
      existsSync(join(target, ".parallel-slices/sql-security.json")),
      false,
    );
    assert.equal(existsSync(join(target, "apps/backend/migrations")), false);
    assert.equal(
      existsSync(join(target, "scripts/database/postgres-migration-runner.ts")),
      false,
    );
    assert.doesNotMatch(qualityWorkflow, /services:\s*\n\s+postgres:/);
    assert.doesNotMatch(deployWorkflow, /CLOUD_SQL|DATABASE_URL|cloudsql/i);
    assert.match(readme, /Architecture profile: `external-api-only`/);
    assert.doesNotMatch(readme, /SQL security/);
    assert.match(
      readFileSync(join(target, "AGENTS.md"), "utf8"),
      /Adding persistence is an explicit architecture or profile migration/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("makes pnpm discoverable to create-turbo and refreshes its lockfile", async () => {
  const parent = mkdtempSync(join(tmpdir(), "parallel-slices-pnpm-bootstrap-"));
  const target = join(parent, "example-platform");
  const pinnedPnpm = `pnpm@${loadScaffoldBaseline().parallelSlices.packageManagers.pnpm}`;
  let shimDirectory;
  let sawCreate = false;
  let sawInstall = false;
  try {
    await assert.rejects(
      () =>
        bootstrapNewProject({
          agent: "cursor",
          manager: "pnpm",
          target,
          runCommand: (command, args, options) => {
            if (command === "corepack" && args[0] === "enable") {
              assert.deepEqual(args.slice(0, 3), [
                "enable",
                "pnpm",
                "--install-directory",
              ]);
              shimDirectory = args[3];
              assert.equal(existsSync(shimDirectory), true);
              return;
            }
            if (args.some((argument) => argument.startsWith("create-turbo@"))) {
              assert.equal(command, "corepack");
              assert.equal(args[0], pinnedPnpm);
              assert.equal(options.env.COREPACK_DEFAULT_TO_LATEST, "0");
              assert.equal(options.env.PATH.split(delimiter)[0], shimDirectory);
              const stagedProject = args.find((argument) =>
                argument.includes(".parallel-slices-create-"),
              );
              writeScaffold(stagedProject, {
                foundationDependencies: false,
                manager: "pnpm",
                nextApps: true,
              });
              sawCreate = true;
              return;
            }
            if (
              command === "corepack" &&
              args[0] === pinnedPnpm &&
              args[1] === "install"
            ) {
              assert.deepEqual(args, [
                pinnedPnpm,
                "install",
                "--no-frozen-lockfile",
              ]);
              assert.equal(options.env.PATH.split(delimiter)[0], shimDirectory);
              assert.match(
                readFileSync(join(options.cwd, "README.md"), "utf8"),
                /node scripts\/parallel-slices\/corepack-runner\.mjs pnpm run build/,
              );
              sawInstall = true;
              throw new Error("synthetic stop after pnpm preflight");
            }
            throw new Error(`unexpected bootstrap command: ${command}`);
          },
        }),
      /synthetic stop after pnpm preflight/,
    );
    assert.equal(sawCreate, true);
    assert.equal(sawInstall, true);
    assert.equal(existsSync(target), false);
    assert.equal(
      readdirSync(parent).some((entry) =>
        entry.startsWith(".parallel-slices-create-"),
      ),
      false,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("removes staging data when curated skill installation fails", async () => {
  const parent = mkdtempSync(join(tmpdir(), "parallel-slices-skills-failure-"));
  const target = join(parent, "example-platform");
  try {
    await assert.rejects(
      () =>
        bootstrapNewProject({
          manager: "npm",
          target,
          runCommand: createBootstrapRunner(),
          installCuratedSkills: () => {
            throw new Error("synthetic curated skill failure");
          },
        }),
      /synthetic curated skill failure/,
    );
    assert.equal(existsSync(target), false);
    assert.equal(
      readdirSync(parent).some((entry) =>
        entry.startsWith(".parallel-slices-create-"),
      ),
      false,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("removes staging data and leaves no target when bootstrap fails", async () => {
  const parent = mkdtempSync(
    join(tmpdir(), "parallel-slices-bootstrap-failure-"),
  );
  const target = join(parent, "example-platform");
  try {
    await assert.rejects(
      () =>
        bootstrapNewProject({
          manager: "npm",
          target,
          runCommand: () => {
            throw new Error("synthetic scaffold failure");
          },
        }),
      /synthetic scaffold failure/,
    );
    assert.equal(existsSync(target), false);
    assert.equal(
      readdirSync(parent).some((entry) =>
        entry.startsWith(".parallel-slices-create-"),
      ),
      false,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("refuses installation on a protected branch before copying files", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-protected-"));
  try {
    run("git", ["init", "-b", "main"], root);
    writeScaffold(root);
    assert.throws(
      () =>
        run(
          "bash",
          [join(parallelSlicesRoot, "scripts/install.sh"), root],
          parallelSlicesRoot,
          {
            quiet: true,
          },
        ),
      /Command failed/,
    );
    assert.equal(existsSync(join(root, ".parallel-slices/config.json")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects invalid architecture options before copying files", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-option-refusal-"));
  try {
    run("git", ["init", "-b", "chore/test-option-refusal"], root);
    writeScaffold(root);
    assert.throws(
      () =>
        run(
          "bash",
          [
            join(parallelSlicesRoot, "scripts/install.sh"),
            "--architecture-options-json",
            '{"package-manager":"unsupported"}',
            root,
          ],
          parallelSlicesRoot,
          { quiet: true },
        ),
      /Command failed/,
    );
    assert.equal(existsSync(join(root, ".parallel-slices")), false);
    assert.equal(existsSync(join(root, ".github")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses target symlinks without modifying files outside the repository", () => {
  const parent = mkdtempSync(join(tmpdir(), "parallel-slices-symlink-"));
  const root = join(parent, "target");
  const outside = join(parent, "outside-config.json");
  try {
    mkdirSync(root);
    run("git", ["init", "-b", "chore/test-symlink-safety"], root);
    writeScaffold(root);
    writeFileSync(outside, "{}\n");
    mkdirSync(join(root, ".parallel-slices"), { recursive: true });
    symlinkSync(outside, join(root, ".parallel-slices/config.json"));
    assert.throws(
      () =>
        run(
          "bash",
          [join(parallelSlicesRoot, "scripts/install.sh"), "--force", root],
          parallelSlicesRoot,
          { quiet: true },
        ),
      /target symlink/,
    );
    assert.equal(readFileSync(outside, "utf8"), "{}\n");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("installer changes only the default while keeping all controllers enabled", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-agent-change-"));
  try {
    run("git", ["init", "-b", "chore/test-agent-change"], root);
    writeScaffold(root);
    run(
      "bash",
      [
        join(parallelSlicesRoot, "scripts/install.sh"),
        "--agent",
        "cursor",
        root,
      ],
      parallelSlicesRoot,
      { quiet: true },
    );
    run(
      "bash",
      [
        join(parallelSlicesRoot, "scripts/install.sh"),
        "--default-controller",
        "codex",
        root,
      ],
      parallelSlicesRoot,
      { quiet: true },
    );
    const profile = JSON.parse(
      readFileSync(join(root, ".parallel-slices/agent.json"), "utf8"),
    );
    assert.equal(profile.defaultController, "codex");
    assert.deepEqual(profile.enabledControllers, [
      "cursor",
      "codex",
      "claude-code",
    ]);
    assert.equal(
      existsSync(join(root, ".cursor/commands/parallel-slices-prepare.md")),
      true,
    );
    assert.equal(
      existsSync(join(root, ".cursor/commands/slices-prepare.md")),
      true,
    );
    assert.equal(
      existsSync(join(root, ".claude/skills/parallel-slices-prepare/SKILL.md")),
      true,
    );
    assert.equal(
      existsSync(join(root, ".claude/skills/slices-prepare/SKILL.md")),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adopts an uninitialized repository without pretending its foundation is ready", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-slices-adoption-"));
  try {
    run("git", ["init", "-b", "chore/adopt-ai-loop"], root);
    writeScaffold(root);
    run(
      "git",
      [
        "add",
        ".node-version",
        "package-lock.json",
        "package.json",
        "turbo.json",
      ],
      root,
    );
    run(
      "git",
      [
        "-c",
        "user.name=Loop Test",
        "-c",
        "user.email=loop@example.test",
        "commit",
        "-m",
        "create existing scaffold",
      ],
      root,
    );

    const setupOutput = run(
      "bash",
      [join(parallelSlicesRoot, "scripts/setup.sh"), root],
      parallelSlicesRoot,
    ).toString();
    assert.match(setupOutput, /default controller: cursor/);
    assert.match(
      setupOutput,
      /enabled controllers: cursor, codex, claude-code/,
    );
    assert.match(setupOutput, /read docs\/parallel-slices\/README\.md/);
    assert.match(
      run("node", ["scripts/parallel-slices/doctor.mjs"], root).toString(),
      /doctor passed with \d+ warnings?/,
    );
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/doctor.mjs", "--initialized"],
          root,
          {
            quiet: true,
          },
        ),
      /Command failed/,
    );
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
          root,
          { quiet: true },
        ),
      /Command failed/,
    );

    writeInitializedContract(root);
    run(
      "node",
      [
        "scripts/parallel-slices/project-state.mjs",
        "advance",
        "contract-ready",
      ],
      root,
    );
    const productPlan = "docs/plans/2026-07-15-foundation.md";
    write(
      root,
      productPlan,
      "# Foundation Product Plan\n\nStatus: APPROVED\n\n## Executable slices\n",
    );
    run("git", ["add", productPlan], root);
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
          root,
          { quiet: true },
        ),
      /Product Plan must not contain compiled execution details/,
    );
    writeInitializedContract(root);
    run(
      "git",
      [
        "add",
        ".agents",
        ".parallel-slices",
        ".claude",
        ".cursor",
        ".github",
        ".husky",
        "AGENTS.md",
        "docs",
        "package.json",
        "scripts",
      ],
      root,
    );
    assert.match(
      run(
        "node",
        ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
        root,
      ).toString(),
      /Product Plan approval commit gate passed/,
    );

    const prematureManifest = "docs/plans/scopes/foundation/1.1.scope";
    write(root, prematureManifest, "version=2\n");
    run("git", ["add", prematureManifest], root);
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
          root,
          { quiet: true },
        ),
      /Product Plan approval and AI execution compilation must be separate commits/,
    );
    run("git", ["reset", "--", prematureManifest], root);
    rmSync(join(root, prematureManifest));

    write(
      root,
      "app/unapproved.ts",
      "export const changedBeforeApproval = true;\n",
    );
    run("git", ["add", "app/unapproved.ts"], root);
    assert.throws(
      () =>
        run(
          "node",
          ["scripts/parallel-slices/quality.mjs", "entrypoint", "preCommit"],
          root,
          { quiet: true },
        ),
      /Command failed/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
