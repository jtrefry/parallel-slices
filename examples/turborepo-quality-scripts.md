# Example Turborepo quality scripts

The loop calls root package scripts and lets Turborepo own workspace selection,
parallel execution, dependencies, and caching. Adapt this example to the
repository rather than copying it blindly.

## Root `package.json`

```json
{
  "scripts": {
    "format:check": "prettier --check .",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "security:sql": "tsx scripts/security/sql-security-scanner.ts",
    "build": "turbo run build",
    "test:unit": "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "test:e2e": "turbo run test:e2e",
    "security:trivy": "node scripts/security/trivy-security-scanner.mjs",
    "db:migrate": "tsx scripts/database/postgres-migration-runner.ts up",
    "db:migrate:status": "tsx scripts/database/postgres-migration-runner.ts status"
  }
}
```

Do not point `format:check` at `prettier --write`. Gate commands must verify the
tree without rewriting it.

The installed `.parallel-slices/config.json` maps these scripts to composable
pipelines. Change that JSON to append, replace, or reorder checks; do not fork
the runner. See
[`docs/configurable-quality-pipelines.md`](../docs/configurable-quality-pipelines.md).
The migration and SQL scripts require exact reviewed `pg`, `tsx`, and
`@types/pg` dependencies as described in
[`docs/postgresql-migrations.md`](../docs/postgresql-migrations.md). Trivy must
match `.trivy-version` exactly.

## Root `turbo.json`

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "lint": {},
    "typecheck": {
      "dependsOn": ["^typecheck"]
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "test:unit": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:integration": {
      "dependsOn": ["build"],
      "cache": false
    },
    "test:e2e": {
      "dependsOn": ["build"],
      "cache": false
    }
  }
}
```

The correct dependency graph varies. For example, an E2E workspace may need a
specific app's build, database setup, or browser installation. Keep that setup
inside the repository's existing scripts and Turbo graph. Declare environment
variables and outputs accurately before enabling cache for integration or E2E
tasks.

Turborepo's current configuration uses the `tasks` key. Its documentation
explains `dependsOn`, package graph ordering, inputs, outputs, and caching:
[Configuring tasks](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks).
