---
name: secure-supply-chain
description: Gate dependency and container-image vulnerabilities with the mechanisms the tools already ship: production-only runtime images, native scanner gating, scans at pull request, deploy, and on a schedule, one scoped suppression list per tool, and platform-native failure alerts. Use when adding vulnerability scanning to a delivery pipeline, when a CVE gate blocks a deploy or release, or when suppression lists across tools disagree.
---

# Gate the supply chain with the tools you already have

Vulnerability management fails at the seams: between the lockfile and the
image, between the scanner and the gate, between the list one tool reads and
the list another enforces. Every rule below traces to a single production
outage in which those seams opened one after another (the receipts are at the
bottom). The pattern behind all of them is the same: each tool already
shipped the mechanism that would have prevented the failure, and custom glue
was standing where the mechanism should have been.

## 1. Runtime images ship production dependencies only

- Every image that runs in production gets its own stage with a
  production-only install: the app server, and equally the migration and job
  runners that are easy to leave `FROM builder`. A runtime stage based on the
  builder inherits the entire devDependency tree and every advisory in it.
- A tool the runtime genuinely executes (a TypeScript loader for a migration
  entrypoint, for instance) is a production dependency. Declare it as one and
  keep the invocation unchanged. Precompiling to avoid the dependency adds a
  build artifact and a drift surface without removing anything that ships.
- Build for the deployment platform explicitly (`--platform`) whenever the
  workstation differs from the target; an architecture mismatch fails at
  deploy time, not at build time.
- Verify inside the image, and scope the assertion to the defect: the
  unpatched lines must be absent. Patched copies of the same package arriving
  through production chains are expected; a sweep that hunts the package name
  will fail forever on packages that are not the problem.

## 2. Gate with the scanner's native controls

- The scanning action gates by itself: point it at the ignore file and set
  its exit-code input. Do not parse scanner output with a hand-rolled script;
  a custom gate reimplements shipped inputs and adds defects of its own.
- Separate reporting from enforcement, the vendor's own recommended pattern:
  one permissive run that records everything (upload the SARIF to the
  platform's code-scanning view, which is its designed home), then one strict
  run that fails the job on the severities you block.

## 3. Scan at three moments

- On every pull request: build the runtime images and scan them before
  merge. Never push from a scanning job.
- At deploy, before the registry push: the artifact that ships is the exact
  artifact scanned.
- On a schedule against the default branch. Advisories publish between
  merges, and a pipeline that scans only on change discovers them when the
  next deploy fails, days later and silently. The scheduled scan turns that
  into a next-morning notification.

The report-then-gate job, ready to adapt for the pull request and scheduled
workflows, is in `files/image-scan-job-template.yml` beside this skill.

## 4. One live suppression list per tool, scoped on purpose

- Know which file each tool actually reads, keep exactly one, and delete the
  inert twin. Configuration homes move between major versions (pnpm 9 reads
  the `pnpm` field of `package.json`; pnpm 10 reads `pnpm-workspace.yaml`).
  Prove the deletion changed nothing with a frozen-lockfile install.
- Lockfile-scoped lists (the package manager's audit ignore list, the pull
  request dependency-review allow list) see devDependencies and may accept
  dev-only risk. Keep those identical to each other; they share a scope. When
  several repositories share policy, use the review action's external shared
  config file rather than per-repository copies.
- The image ignore list covers what ships, and its default state is empty. An
  image finding is fixed by upgrading or by removing the package; the rare
  genuine acceptance carries the advisory id, a justification, and a native
  expiry date so it cannot be forgotten.
- Never equalize the lists across scopes. Copying a dev-only acceptance into
  the image list masks the day that package starts shipping, which is
  precisely the event the image scan exists to catch. The invariant, ready to
  commit beside the lists, is in `files/suppression-policy-template.md`.
- Never suppress an image finding on a dev-only package. Its presence in the
  image is the defect. Stop shipping it.

## 5. Move transitives with overrides, then prove they load

- Package-manager overrides are the designed way to force a patched
  transitive line, and `audit --fix` will generate them.
- A version that satisfies the scanner can still break its caller: major
  lines change export shapes, and a CommonJS consumer that calls the module
  as a function will not load a rewrite that exports a named property. Run
  the real entrypoint against the overridden tree before calling it fixed.
  When no loadable patched line exists, remove the consumer from the shipped
  artifact rather than forcing a version that cannot work.

## 6. Failures announce themselves through the platform

- Subscribe a team channel to workflow runs with the platform's own chat
  integration (one subscribe command in Slack or Teams); the platform also
  emails the triggering actor by default. Record the subscribe command in the
  runbook so the next repository gets it on day one.
- Do not write a custom notification job. It is machinery with an owner, and
  the platform's zero-maintenance channel does the same work.

## Receipts

- A deploy gate blocked every release for three days while every pull
  request check stayed green. Images were built and scanned only after
  merge, and the advisory was suppressed in both lockfile lists but never
  the image list. The durable fix removed the devDependency tree from the
  image; synchronizing the lists instead would have shipped the
  vulnerability under a green gate.
- The accepted-risk note for that advisory blamed a dev-only linter chain.
  At the moment it was written, the vulnerable line was also in the
  production bundle. Lockfile tools cannot tell shipped from dev-only; only
  the image scan can.
- The gate that blocked was thirty lines of hand-written SARIF parsing that
  reimplemented two native inputs of the scanning action, down to matching
  advisory ids by substring.
- Two configuration files carried override and audit lists side by side. The
  package manager read one; the drifted dead twin was the one a workflow
  comment cited as authority.
- The patched major of the vulnerable package changed its CommonJS export
  shape, so its consumer could not be overridden onto it. The fix was to
  stop shipping the consumer, not to force a version that would not load.
