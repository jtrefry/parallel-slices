# Generated application baseline

This directory owns the application files and exact dependency versions applied
only by the `nextjs-gcp-postgres` generator. Adopting this architecture package into an
existing Turborepo preserves that repository's UI technology.

New projects use:

- Node.js 24 as the generated-project pin with an engine range limited to the
  supported Node.js 22 and 24 LTS lines;
- the Next.js App Router with exact, reviewed Next.js and React versions;
- Mantine Core and Hooks as the default component system;
- a recorded `postgres` or `external-api-only` data layer matching the selected
  architecture profile;
- Mantine's required provider, color-scheme script, styles, and PostCSS setup;
- CSS Modules or ordinary CSS for product-specific styles; and
- no Tailwind dependencies, directives, or configuration;
- a concise controller- and package-manager-specific root README that identifies
  Parallel Slices as its generator, links directly to the canonical public
  workflow and mechanism documentation, lists clone prerequisites, and
  identifies `apps/web/` as the only starter application and root `docs/` as
  documentation rather than a Next.js application; and
- removal of the upstream `apps/docs/` application so the generated workspace
  has one unambiguous documentation tree at root `docs/`; and
- no stale upstream generator instructions in the created repository.

`package.json` is a dependency baseline, not an installable workspace. It must
list every external direct dependency emitted by the pinned generator, exact
versions for all supported package managers, and short reasons for intentional
compatibility holds. Keep versions exact. `templates/project-README.md` is
rendered only for newly generated repositories. Dependency automation reviews
this directory separately, and a baseline update is complete only after the
real generated-project smoke test passes.
