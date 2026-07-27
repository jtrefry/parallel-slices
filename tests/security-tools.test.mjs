import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  parseTrivyVersion,
  runTrivy,
} from "../architectures/nextjs-gcp-postgres/repo-overlay/scripts/security/trivy-security-scanner.mjs";
import { parallelSlicesRoot, write } from "./helpers/fixture.mjs";

const tsx = resolve(parallelSlicesRoot, "node_modules/.bin/tsx");
const sqlScanner = resolve(
  parallelSlicesRoot,
  "architectures/nextjs-gcp-postgres/repo-overlay/scripts/security/sql-security-scanner.ts",
);
const migrationRunner = resolve(
  parallelSlicesRoot,
  "architectures/nextjs-gcp-postgres/repo-overlay/scripts/database/postgres-migration-runner.ts",
);

function writeScannerConfig(root) {
  write(
    root,
    ".parallel-slices/sql-security.json",
    `${JSON.stringify({
      version: 1,
      roots: ["apps", "packages", "scripts"],
      extensions: [".sql", ".ts", ".tsx", ".js", ".mjs"],
      excludeDirectories: ["node_modules", ".git"],
      maximumFileBytes: 2_000_000,
    })}\n`,
  );
}

function runSqlScanner(root) {
  return spawnSync(tsx, [sqlScanner], {
    cwd: root,
    encoding: "utf8",
  });
}

test("SQL scanner accepts parameterized application SQL and ordered migrations", () => {
  const root = mkdtempSync(join(tmpdir(), "sql-security-safe-"));
  try {
    writeScannerConfig(root);
    write(
      root,
      "apps/backend/migrations/20260715143000_add_account_status.sql",
      "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS status text;\n",
    );
    write(
      root,
      "packages/database/query.ts",
      'client.query("SELECT * FROM accounts WHERE id = $1", [accountId]);\n',
    );
    const result = runSqlScanner(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /SQL security scan passed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SQL scanner blocks injection patterns and unsafe migration structure", () => {
  const root = mkdtempSync(join(tmpdir(), "sql-security-unsafe-"));
  try {
    writeScannerConfig(root);
    write(
      root,
      "apps/backend/migrations/bad-name.sql",
      `BEGIN;
CREATE FUNCTION private.lookup() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  EXECUTE 'SELECT ' || current_user;
END;
$$;
COMMIT;
`,
    );
    write(
      root,
      "apps/backend/query.ts",
      `client.query(
        "SELECT * FROM accounts WHERE id = " + accountId,
      );
      client.query(
        \`SELECT * FROM accounts WHERE id = \${accountId}\`,
      );
`,
    );
    const result = runSqlScanner(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /APP003/);
    assert.match(result.stderr, /APP001/);
    assert.match(result.stderr, /SQL001/);
    assert.match(result.stderr, /SQL003/);
    assert.match(result.stderr, /MIG001/);
    assert.match(result.stderr, /MIG003/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SQL scanner refuses scan roots outside the repository", () => {
  const root = mkdtempSync(join(tmpdir(), "sql-security-config-"));
  try {
    writeScannerConfig(root);
    const configPath = join(root, ".parallel-slices/sql-security.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.roots = ["../outside"];
    write(
      root,
      ".parallel-slices/sql-security.json",
      `${JSON.stringify(config)}\n`,
    );
    const result = runSqlScanner(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid SQL security scanner configuration/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migration discovery is deterministic and refuses malformed names", () => {
  const root = mkdtempSync(join(tmpdir(), "postgres-migrations-"));
  try {
    write(
      root,
      "apps/backend/migrations/_MIGRATION_TEMPLATE.sql",
      "-- template\n",
    );
    write(
      root,
      "apps/backend/migrations/20260715150000_second.sql",
      "SELECT 2;\n",
    );
    write(
      root,
      "apps/backend/migrations/20260715140000_first.sql",
      "SELECT 1;\n",
    );
    const evaluate = `
      import { discoverMigrations } from ${JSON.stringify(migrationRunner)};
      console.log(JSON.stringify(discoverMigrations(${JSON.stringify(root)}).map((item) => item.name)));
    `;
    const result = spawnSync(tsx, ["--eval", evaluate], {
      cwd: parallelSlicesRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), [
      "20260715140000_first.sql",
      "20260715150000_second.sql",
    ]);

    const historyEvaluation = `
      import { discoverMigrations, validateMigrationHistory } from ${JSON.stringify(migrationRunner)};
      const migrations = discoverMigrations(${JSON.stringify(root)});
      const later = migrations[1];
      validateMigrationHistory(migrations, [{ name: later.name, checksum: later.checksum, applied_at: new Date() }]);
    `;
    const outOfOrder = spawnSync(tsx, ["--eval", historyEvaluation], {
      cwd: parallelSlicesRoot,
      encoding: "utf8",
    });
    assert.notEqual(outOfOrder.status, 0);
    assert.match(
      outOfOrder.stderr,
      /pending migration sorts before applied history/,
    );

    write(root, "apps/backend/migrations/not_ordered.sql", "SELECT 3;\n");
    const invalid = spawnSync(tsx, ["--eval", evaluate], {
      cwd: parallelSlicesRoot,
      encoding: "utf8",
    });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /invalid migration filename/);

    rmSync(join(root, "apps/backend/migrations/not_ordered.sql"));
    write(
      root,
      "apps/backend/migrations/20260715160000_transaction.sql",
      "BEGIN;\nSELECT 4;\nCOMMIT;\n",
    );
    const transaction = spawnSync(tsx, ["--eval", evaluate], {
      cwd: parallelSlicesRoot,
      encoding: "utf8",
    });
    assert.notEqual(transaction.status, 0);
    assert.match(transaction.stderr, /contains transaction control/);

    rmSync(
      join(root, "apps/backend/migrations/20260715160000_transaction.sql"),
    );
    write(root, "outside.sql", "SELECT 5;\n");
    symlinkSync(
      join(root, "outside.sql"),
      join(root, "apps/backend/migrations/20260715170000_link.sql"),
    );
    const symlink = spawnSync(tsx, ["--eval", evaluate], {
      cwd: parallelSlicesRoot,
      encoding: "utf8",
    });
    assert.notEqual(symlink.status, 0);
    assert.match(symlink.stderr, /must not be a symbolic link/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Trivy wrapper pins the tool version and passes the repository config", () => {
  const root = mkdtempSync(join(tmpdir(), "trivy-wrapper-"));
  const originalLog = process.env.TRIVY_ARGS_LOG;
  try {
    const executable = join(root, "fake-trivy");
    const log = join(root, "args.log");
    write(root, ".trivy-version", "0.70.0\n");
    write(root, "trivy.yaml", "exit-code: 1\n");
    write(
      root,
      "fake-trivy",
      `#!/bin/sh
if [ "\${1:-}" = "--version" ]; then
  echo "Version: 0.70.0"
  exit 0
fi
printf '%s\\n' "$*" > "$TRIVY_ARGS_LOG"
`,
    );
    chmodSync(executable, 0o755);
    process.env.TRIVY_ARGS_LOG = log;
    assert.equal(parseTrivyVersion("Version: 0.70.0"), "0.70.0");
    runTrivy({ root, command: executable });
    assert.equal(readFileSync(log, "utf8").trim(), "--config trivy.yaml fs .");

    write(root, "fake-trivy", "#!/bin/sh\necho 'Version: 0.69.0'\n");
    assert.throws(
      () => runTrivy({ root, command: executable }),
      /0\.70\.0 is required, but 0\.69\.0 is active/,
    );
  } finally {
    if (originalLog === undefined) delete process.env.TRIVY_ARGS_LOG;
    else process.env.TRIVY_ARGS_LOG = originalLog;
    rmSync(root, { recursive: true, force: true });
  }
});
