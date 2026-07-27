# PostgreSQL migration framework

This framework is installed only by the bundled package's default `postgres`
profile, which targets Cloud SQL for PostgreSQL in production. The
`external-api-only` profile does not install these paths. The migration
framework lives at:

- [`apps/backend/migrations/`](../architectures/nextjs-gcp-postgres/repo-overlay/apps/backend/migrations/README.md)
- [`scripts/database/postgres-migration-runner.ts`](../architectures/nextjs-gcp-postgres/repo-overlay/scripts/database/postgres-migration-runner.ts)
- [`scripts/security/sql-security-scanner.ts`](../architectures/nextjs-gcp-postgres/repo-overlay/scripts/security/sql-security-scanner.ts)

The project initializer adapts the database access layer to the product, but it
preserves this migration contract unless the approved architecture records a
reason to replace it.

## Foundation setup

The initialized root package must expose:

```json
{
  "scripts": {
    "db:migrate": "tsx scripts/database/postgres-migration-runner.ts up",
    "db:migrate:status": "tsx scripts/database/postgres-migration-runner.ts status",
    "security:sql": "tsx scripts/security/sql-security-scanner.ts",
    "security:trivy": "node scripts/security/trivy-security-scanner.mjs"
  }
}
```

Install `pg` and `tsx` as exact runtime dependencies for the migration job, and
`@types/pg` as an exact development dependency. The versions used to validate
this project are `pg@8.22.0`, `tsx@4.23.1`, and `@types/pg@8.20.0`; update them
only through normal dependency review.

The migration runner accepts `DATABASE_URL`, or `PGHOST`, `PGDATABASE`, and
`PGUSER` plus the remaining standard PostgreSQL environment variables. It:

1. discovers timestamped SQL files in lexical order;
2. acquires a database advisory lock;
3. verifies every applied file still exists and has the recorded SHA-256;
4. rejects newly inserted migrations that sort before applied history;
5. applies each pending file in its own transaction with bounded lock and
   statement timeouts; and
6. atomically records the filename, checksum, and application time in
   `public.app_schema_migrations`.

There is no destructive `down` command. Applied files are immutable, and
failures are corrected with a new forward migration. The SQL scanner blocks
common application and PL/pgSQL injection patterns, unsafe migration names,
explicit transaction control, and unsafe `SECURITY DEFINER` declarations. It is
a deterministic defense-in-depth check, not a proof that arbitrary SQL is safe.

`.parallel-slices/sql-security.json` controls reviewed scan roots, extensions,
excluded directories, and maximum file size. A false positive can be suppressed
on the finding line or immediately above it with
`sql-security-ignore RULE: a specific rationale of at least ten characters`.
The suppression is visible in review and applies only to that rule and match.

## Execution boundaries

Local and CI integration tests run migrations against disposable PostgreSQL
instances. Application startup never runs them. Production migrations run only
through a reviewed, separately authorized Cloud Run Job, before code that
depends on the new schema receives traffic. Use expand-and-contract changes
when old and new service revisions can overlap.

Parallel Slices never invokes `db:migrate` during installation, initialization,
loop gates, deployment, or testing of Parallel Slices itself.
