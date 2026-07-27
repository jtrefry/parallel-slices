# Parallel Slices documentation

Start with the root [quick start](../README.md#quick-start) if you want to
create or adopt a project, and keep the [glossary](glossary.md) at hand for
the terms used everywhere else. This directory contains deeper explanations
for operating, configuring, and extending Parallel Slices itself.

The public guides in this directory are the canonical reader-facing
documentation. Generated project READMEs link here directly instead of copying
the shared explanation. Each managed project also retains
[version-matched operating contracts](../repo-overlay/docs/parallel-slices/README.md)
for its agents; those installed procedures stay beside the exact scripts and
schemas they govern so an older project cannot silently receive incompatible
instructions.

## Learn the system

| Topic                                             | Guide                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| Definitions of every core term                    | [Glossary](glossary.md)                                             |
| Why the bundled architecture exists               | [Why start with a bundled architecture](why-parallel-slices.md)     |
| Files and mechanisms behind the workflow          | [Mechanism map](mechanism-map.md)                                   |
| Visual process and Git ownership                  | [Pipeline walkthrough](pipeline-walkthrough.md)                     |
| Testing philosophy and coverage policy            | [Testing standards](testing-standards.md)                           |
| Operate a generated `nextjs-gcp-postgres` project | [`nextjs-gcp-postgres` operating guide](operating-guide.md)         |
| Supported controllers, systems, and limitations   | [Compatibility and portability](compatibility.md)                   |
| Reproducible generated application                | [Generated application baseline](generated-application-baseline.md) |

## Configure and extend Parallel Slices

| Task                                          | Guide                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Understand the architecture-package contract  | [Architecture packages](architecture-packages.md)                                   |
| Create a private architecture package         | [Create an architecture package](creating-architecture-packages.md)                 |
| Configure slice sizing and quality pipelines  | [Configurable compilation and quality pipelines](configurable-quality-pipelines.md) |
| Review or update installed third-party skills | [Curated agent skills](curated-agent-skills.md)                                     |
| Check initialization completeness             | [`nextjs-gcp-postgres` project readiness checklist](new-project-checklist.md)       |

The readiness checklist is an AI-managed acceptance contract. A developer does
not complete it manually.

## Operate the bundled `nextjs-gcp-postgres` architecture

| Task                                             | Guide                                                       |
| ------------------------------------------------ | ----------------------------------------------------------- |
| Create a project from a checkout                 | [Quick start](../README.md#quick-start)                     |
| Run local containers and emulators               | [Local development](local-development.md)                   |
| Manage `postgres` profile schema changes         | [PostgreSQL migrations](postgresql-migrations.md)           |
| Configure protected branches and required checks | [GitHub repository settings](github-repository-settings.md) |
| Understand profile-aware Google Cloud delivery   | [GCP delivery](gcp-delivery.md)                             |

These pages describe the bundled `nextjs-gcp-postgres` architecture. Each additional
architecture package owns and links its own framework, data, platform, and
delivery documentation.

## Contribute or get help

- Read [Contributing](../CONTRIBUTING.md) before changing this repository.
- Track project status and history in the [changelog](../CHANGELOG.md).
- Use [Support](../SUPPORT.md) for setup questions and bug reports.
- Follow [Security](../SECURITY.md) for private vulnerability reports.
