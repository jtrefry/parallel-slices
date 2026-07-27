import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const parallelSlicesRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const activeNpmVersion = execFileSync("npm", ["--version"], {
  encoding: "utf8",
}).trim();

export function run(command, args, cwd, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "pipe",
    });
  } catch (error) {
    error.message += `\nstdout:\n${error.stdout || ""}\nstderr:\n${error.stderr || ""}`;
    throw error;
  }
}

export function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function writeNextAppScaffold(root) {
  const appPackage = {
    name: "web",
    private: true,
    scripts: { build: "next build", lint: "eslint" },
    dependencies: {
      "@repo/ui": "workspace:*",
      next: "16.2.0",
      react: "^19.2.0",
      "react-dom": "^19.2.0",
      tailwindcss: "4.0.0",
    },
    devDependencies: {
      "@types/react": "19.2.2",
      "@types/react-dom": "19.2.2",
    },
  };
  for (const app of ["docs", "web"]) {
    write(
      root,
      `apps/${app}/package.json`,
      `${JSON.stringify({ ...appPackage, name: app }, null, 2)}\n`,
    );
    write(
      root,
      `apps/${app}/app/layout.tsx`,
      "export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n",
    );
    write(
      root,
      `apps/${app}/app/page.tsx`,
      "export default function Page() { return <main>Starter</main>; }\n",
    );
    write(root, `apps/${app}/app/globals.css`, "@tailwind base;\n");
    write(root, `apps/${app}/tailwind.config.ts`, "export default {};\n");
    write(root, `apps/${app}/next.config.js`, "export default {};\n");
  }
  write(
    root,
    "packages/ui/package.json",
    `${JSON.stringify(
      {
        name: "@repo/ui",
        private: true,
        dependencies: { react: "^19.2.0", "react-dom": "^19.2.0" },
        devDependencies: {
          "@types/react": "19.2.2",
          "@types/react-dom": "19.2.2",
        },
      },
      null,
      2,
    )}\n`,
  );
  for (const component of ["button", "card", "code"]) {
    write(
      root,
      `packages/ui/src/${component}.tsx`,
      `export function ${component}() { return null; }\n`,
    );
  }
  write(
    root,
    "packages/eslint-config/package.json",
    `${JSON.stringify(
      {
        name: "@repo/eslint-config",
        private: true,
        devDependencies: {
          "@eslint/js": "9.39.1",
          "@next/eslint-plugin-next": "16.2.0",
          eslint: "9.39.1",
          "eslint-config-prettier": "10.1.1",
          "eslint-plugin-only-warn": "1.1.0",
          "eslint-plugin-react": "7.37.5",
          "eslint-plugin-react-hooks": "5.2.0",
          "eslint-plugin-turbo": "2.7.1",
          globals: "16.5.0",
          typescript: "5.9.2",
          "typescript-eslint": "8.50.0",
        },
      },
      null,
      2,
    )}\n`,
  );
}

export function writeScaffold(root, options = {}) {
  const manager = options.manager || "npm";
  const managerVersion = manager === "pnpm" ? "10.15.1" : activeNpmVersion;
  const scripts = { prepare: "husky" };
  if (options.qualityScripts) {
    Object.assign(scripts, {
      "format:check": 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"',
      typecheck: 'node -e "process.exit(0)"',
      "security:sql": 'node -e "process.exit(0)"',
      build: 'node -e "process.exit(0)"',
      "test:unit": 'node -e "process.exit(0)"',
      "test:integration": 'node -e "process.exit(0)"',
      "test:e2e": 'node -e "process.exit(0)"',
      "security:trivy": 'node -e "process.exit(0)"',
    });
  }
  write(
    root,
    "package.json",
    `${JSON.stringify(
      {
        name: "bootstrap-fixture",
        private: true,
        packageManager: `${manager}@${managerVersion}`,
        engines: { node: "^22.0.0 || ^24.0.0" },
        scripts,
        ...(options.nextApps ? { workspaces: ["apps/*", "packages/*"] } : {}),
        dependencies:
          options.foundationDependencies === false
            ? {}
            : {
                pg: "8.22.0",
                tsx: "4.23.1",
              },
        devDependencies: {
          ...(options.foundationDependencies === false
            ? {}
            : { "@types/pg": "8.20.0" }),
          eslint: "1.0.0",
          husky: "9.1.7",
          next: "16.0.0",
          prettier: "1.0.0",
          turbo: "2.0.0",
          typescript: "5.0.0",
        },
      },
      null,
      2,
    )}\n`,
  );
  write(root, "turbo.json", `${JSON.stringify({ tasks: {} })}\n`);
  if (manager === "pnpm") {
    write(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  } else {
    write(
      root,
      "package-lock.json",
      `${JSON.stringify({ lockfileVersion: 3 })}\n`,
    );
  }
  write(root, ".node-version", `${process.versions.node}\n`);
  if (options.dependencyUpdates) {
    write(
      root,
      ".github/dependabot.yml",
      `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
`,
    );
  }
  write(root, ".git/stale-generator-metadata", "removed before git init\n");
  write(
    root,
    "node_modules/.bin/husky",
    `#!/usr/bin/env sh
set -eu
mkdir -p .husky/_
printf '#!/usr/bin/env sh\\n' > .husky/_/h
printf '#!/usr/bin/env sh\\n' > .husky/_/pre-commit
printf '#!/usr/bin/env sh\\n' > .husky/_/pre-push
chmod +x .husky/_/pre-commit .husky/_/pre-push
git config core.hooksPath .husky/_
`,
  );
  chmodSync(join(root, "node_modules/.bin/husky"), 0o755);
  if (options.nextApps) writeNextAppScaffold(root);
}

export function writeInitializedContract(root) {
  write(
    root,
    "AGENTS.md",
    "# Project instructions\n\nThe initialized contract is canonical.\n",
  );
  for (const name of [
    "product-brief",
    "architecture",
    "security-and-privacy",
    "testing-strategy",
    "local-development",
    "gcp-operations",
    "decision-log",
  ]) {
    write(
      root,
      `docs/project/${name}.md`,
      `# ${name}\n\nInitialized project contract.\n`,
    );
  }
  write(
    root,
    "docs/plans/2026-07-15-foundation.md",
    "# Foundation plan\n\nStatus: APPROVED\n",
  );
  write(
    root,
    ".github/dependabot.yml",
    `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
`,
  );
}
