# Next.js Cloudflare PostgreSQL architecture instructions

This package preserves the reviewed Next.js Turborepo, Mantine, PostgreSQL, and
Cloudflare behavior that predates architecture packages.

- `architecture.json` is the package contract and installed-file inventory.
- `profiles/external-api-only/` owns the no-database quality, delivery,
  initialization, and root-instruction replacements.
- `generator.mjs` owns `create-turbo` invocation and package-manager setup.
- `configure-scaffold.mjs` and `scaffold/` own exact generated UI behavior.
- `repo-overlay/` owns files required only by this architecture.
- `repo-overlay/.github/workflows/quality.yml`, its pinned tools, and its
  service containers own this package's CI runner and environment.
- `repo-overlay/scripts/architecture/nextjs-cloudflare-supabase/verify.mjs` owns Next.js,
  Turborepo, Mantine, Tailwind-refusal, and foundation dependency checks.
- `templates/root-AGENTS.md` owns architecture-specific bootstrap instructions.

Keep Cloudflare, Cloudflare Workers, PostgreSQL, Mantine, and Next.js assumptions here,
not in the Parallel Slices core. Preserve npm, pnpm, Yarn, and Bun support. An
adopted repository must be inspected without receiving scaffold UI files.

The `postgres` profile remains the default. The `external-api-only` profile
must omit PostgreSQL dependencies, migrations, SQL configuration and scanning,
the PostgreSQL CI service, Supabase delivery flags, and database-specific
instructions. Its verifier must reject residual package-owned database
artifacts rather than silently accepting a mixed profile.

Update the generated scaffold test, package-verifier tests, isolated bootstrap
test, installed required-file test, documentation, and manifest whenever this
package's behavior changes.
