# Local containers and Google Cloud emulators

## Supported local runtime

Docker Desktop is the supported default for local development on macOS,
Windows, and Linux. It supplies Docker Engine, the Docker CLI, and Docker
Compose, matching the commands used by generated development, integration,
end-to-end, and Cloud Run container-smoke workflows.

On Windows, run the repository and generated project inside WSL2 and enable
Docker Desktop's WSL integration for that distribution. Keep the repository in the WSL
filesystem rather than a mounted Windows drive to avoid file-watching,
permissions, and Git-hook inconsistencies.

Docker Desktop licensing depends on the user and organization. Review Docker's
current subscription terms before adopting it in a commercial organization.

Rancher Desktop is a free alternative that may work when configured with the
`dockerd (moby)` container engine. That engine exposes the Docker API and Docker
CLI expected by this template. Rancher Desktop support is best effort:

- Google Cloud's local Cloud Run documentation describes Docker, Cloud Code,
  and the Google Cloud CLI; it does not document or validate Rancher Desktop.
- The template's guaranteed local support target is Docker Desktop.
- Rancher Desktop users must select `dockerd (moby)`, not
  `containerd/nerdctl`, and confirm both `docker info` and
  `docker compose version` succeed.
- A defect reproduced only with Rancher Desktop must also be reproduced with
  Docker Desktop before it is treated as a template compatibility defect.

GitHub Actions uses the runner's container runtime. It never depends on either
desktop application.

## Test dependency boundaries

Pure unit tests must remain independent of containers, databases, networks,
Google Cloud credentials, and emulators. A test that requires one of those
dependencies belongs in the integration or end-to-end suite.

| Test tier             | Local container runtime                     | Dependencies                                          |
| --------------------- | ------------------------------------------- | ----------------------------------------------------- |
| Unit                  | Not required                                | In-memory values and explicit fakes                   |
| Component             | Normally not required                       | Mocked network boundaries                             |
| Integration           | Required when the boundary is containerized | Selected profile services, API doubles, and emulators |
| End-to-end/browser    | Required for the generated full-stack path  | Application and selected profile dependencies         |
| Cloud Run image smoke | Required                                    | Production container listening on the injected `PORT` |
| GCP contract          | Not necessarily local                       | Isolated non-production GCP project                   |

Local scripts must start dependencies, wait on bounded health checks, run the
test, preserve useful failure logs, and clean up reliably. They must use
synthetic project IDs and test data, never production credentials or customer
data.

## Service mapping

Generate only the services selected during project initialization.

| Production service                           | Local test implementation                                      |
| -------------------------------------------- | -------------------------------------------------------------- |
| Cloud SQL for PostgreSQL (`postgres` only)   | Version-matched PostgreSQL container                           |
| Cloud Run service                            | Production container executed locally with `PORT=8080`         |
| Cloud Run Job                                | Job container executed as a finite command                     |
| Pub/Sub                                      | Official Google Cloud Pub/Sub emulator                         |
| Firestore                                    | Official Google Cloud Firestore emulator                       |
| Spanner                                      | Official Google Cloud Spanner emulator                         |
| Cloud Scheduler                              | Deterministic local trigger invoking the job boundary          |
| Service without a suitable official emulator | Typed fake plus contract tests against an isolated GCP project |

An emulator is not proof of production equivalence. Emulator limitations,
authentication, IAM, network policy, and service-specific production behavior
must be covered by targeted contract or deployment-smoke tests when the risk
requires it.

## Required generated commands

The AI-initialized application must expose stable root commands such as:

```text
dev:doctor
dev:services
dev:services:wait
dev:services:reset
dev:services:down
test:unit
test:integration
test:e2e
test:container
test:gcp-contract
security:sql
security:trivy
db:migrate:status
```

`dev:doctor` should detect Docker availability and health, Compose, required
emulator components, Playwright browsers, Node.js, the package manager, port
conflicts, and accidental production credentials. It should identify Docker
Desktop as supported, Rancher Desktop Moby as best effort, and an incompatible
runtime with an actionable error. It should also verify the exact Trivy version
from `.trivy-version` and the PostgreSQL variables needed by migration and
integration commands.

## References

- [Docker Desktop](https://docs.docker.com/desktop/)
- [Install Docker Compose](https://docs.docker.com/compose/install/)
- [Rancher Desktop container engine](https://docs.rancherdesktop.io/ui/preferences/container-engine/general/)
- [Test Cloud Run services locally](https://cloud.google.com/run/docs/testing/local)
- [Google Cloud CLI emulators](https://cloud.google.com/sdk/gcloud/reference/emulators)
- [Pub/Sub emulator](https://cloud.google.com/pubsub/docs/emulator)
