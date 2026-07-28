# secure-supply-chain, explained

The rulebook itself: [`skills/secure-supply-chain/SKILL.md`](../../skills/secure-supply-chain/SKILL.md)

## What it is

`secure-supply-chain` keeps known security vulnerabilities out of what you
ship, and makes sure that when one appears, you find out the next morning
instead of days later. Unlike the other three skills, it is not about one
piece of work; it is about the pipeline every piece of work flows through.

Every rule in it comes from a single real outage: a deployment pipeline
blocked for three days by a vulnerability everyone's local tools had been
told to ignore, while the shipped product genuinely contained it. The
guide below teaches the background as it goes, because the background is
most of the lesson.

## The background, in plain words

- **Dependencies** are other people's code your app uses. Your app might
  directly use fifty packages; those packages use packages of their own,
  and a typical app ends up standing on a thousand of them. The full list,
  with exact versions, lives in a **lockfile** committed to your repo.
- **A CVE or advisory** is a public report that a specific version range of
  a package has a security flaw. New ones are published every day, which
  means your app can become vulnerable overnight without any change to
  your code.
- **devDependencies vs dependencies**: packages split into what your app
  needs to run (dependencies) and what only developers need while building
  and testing it (devDependencies: linters, test runners, and similar). A
  flaw in a dev-only tool that never ships is a nuisance; the same flaw in
  something you ship is a real risk. Much of this skill is about keeping
  that distinction honest.
- **A container image** is the sealed box your app actually ships in: the
  app, its runtime dependencies, and a minimal operating system, packaged
  so it runs the same everywhere. Images are built in stages, and the
  final stage should contain only what production needs.
- **Trivy** is a scanner that opens that box and checks everything inside
  against the public vulnerability databases. **SARIF** is the standard
  report format scanners emit; GitHub can display SARIF reports in a
  repository's Security tab (the "code scanning" view).
- **GitHub Actions workflows** are the automation scripts, stored in
  `.github/workflows/`, that run all of this: on every pull request (CI),
  on a schedule, and when shipping (CD).

## The features, the decisions behind them, and why they help

### 1. Runtime images ship production dependencies only

Every image that runs in production gets its own build stage that installs
only production dependencies. The easy shortcut, basing a utility image
(like a database-migration runner) on the full build stage, quietly ships
the entire dev toolchain, and every advisory in it becomes a production
finding.

A subtle decision inside this rule: if the running app genuinely executes
a build-style tool (say, a TypeScript loader for a migration script), the
honest fix is declaring that tool a production dependency, not compiling
the problem away. Precompiling adds a second copy of the code that can
drift from the source, without removing anything that ships.

Verification is scoped to the defect: after slimming an image, assert that
the vulnerable versions are gone, not that the package name never appears.
Patched copies arriving through legitimate production chains are expected,
and a sweep that hunts the name alone will fail forever on packages that
were never the problem.

### 2. Gate with the scanner's native controls

Trivy can fail a build by itself: point it at an ignore file and set its
exit-code option. The skill forbids the tempting alternative, a custom
script that parses scanner output, because the outage's gate was exactly
that: thirty lines of hand-rolled parsing that reimplemented two built-in
options and matched advisory IDs by loose substring.

The recommended shape is **report, then gate**: one permissive scan that
records every finding into GitHub's code-scanning view (so humans can
browse history and trends), then one strict scan that fails the job on
HIGH or CRITICAL findings not listed in the ignore file.

Permissions matter more than they look: the SARIF upload needs
`security-events: write`, plus `actions: read` on private repositories.
And if the scan runs inside a reusable ("called") workflow, every workflow
that calls it must grant at least that set, because GitHub validates
permissions for every job before it evaluates the conditions that would
have skipped some of them. Both of those sentences are receipts, not
theory: each one failed a real pipeline on its first run.

### 3. Scan at three moments

- **On every pull request**: build the images and scan them before the
  change merges. Finding a problem here costs a rebase; finding it after
  merge costs an incident.
- **At deploy, before pushing to the registry**: the exact bytes that ship
  are the exact bytes scanned.
- **On a daily schedule against the main branch**: this is the one people
  forget, and it is the one that would have prevented the outage.
  Advisories are published between merges. A pipeline that scans only when
  code changes discovers a new advisory only when the next deploy fails,
  silently, days later. A nightly scan turns that into a next-morning
  notification.

One sequencing rule, learned the hard way: land the image fix before the
gate that enforces it. A gate introduced in the same change set builds
images from a base that still contains the finding, and correctly fails
its own pull request. Red is the right verdict there; merge the fix first,
then let the gate prove itself green.

The bundled `files/image-scan-job-template.yml` is this job, ready to
adapt, with the full permission set already in place.

### 4. One suppression list per tool, scoped on purpose

Sometimes a finding is judged acceptable (for example, a flaw with no
released fix in a tool that never ships). Each scanning tool has its own
ignore list, and this skill's most important insight is that those lists
must NOT be kept identical, because they answer different questions:

- Lockfile-scoped lists (the package manager's audit ignore list, the pull
  request dependency-review allow list) see everything including
  devDependencies. These two share a scope, so they are kept identical to
  each other.
- The image scanner's ignore list covers what actually ships. Its default
  state is empty, and it stays empty: an image finding is fixed by
  upgrading or removing the package.

Copying a dev-only acceptance into the image list feels tidy and is
precisely wrong: it masks the day that package starts shipping, which is
the exact event the image scan exists to catch. In the outage, the
advisory was suppressed in both lockfile lists while the deploy gate kept
blocking, and the gate was right: the "dev-only" package was in the
shipped image.

Supporting rules: know which configuration file each tool actually reads
and delete inert duplicates (two config files carrying the same list is
how one drifts into a lie; the outage repo had exactly that, and a comment
citing the dead one as authority). Rare genuine image acceptances use
Trivy's expiring format, with the advisory ID and the reason on the line
above, so no suppression can be quietly forgotten. And every entry in any
list names its removal condition.

The bundled `files/suppression-policy-template.md` is this policy as a
ready-to-commit document.

### 5. Move stuck dependencies with overrides, then prove they load

Package managers offer **overrides**: a way to force a vulnerable
transitive package (a dependency of a dependency) up to a patched version
without waiting for everyone in the chain to update. That is the designed
mechanism, and audit tools will even generate them.

The trap: a version that satisfies the scanner can still break the caller.
Major versions change how modules export themselves, and code written for
the old shape will not load the new one. So the rule is: apply the
override, then run the real entrypoint and watch it work. When no
loadable patched version exists, the answer is removing the consumer from
the shipped artifact, not forcing a version that cannot run.

### 6. Failures announce themselves through the platform

When a scheduled scan or a deploy fails, someone must find out without
watching dashboards. GitHub already emails the person whose merge
triggered a failed run, and its official Slack and Microsoft Teams apps
can subscribe a team channel to workflow results with a single command.
The skill forbids building a custom notification bot: it is machinery with
an owner and a failure mode of its own, doing work the platform does for
free.

One measurement rule rides along: watch the job, not the run. A workflow
run can report overall "success" while every job inside it was skipped
(for example, when a superseded trigger fired it). Anything keyed on run
conclusions will eventually announce a recovery that never happened; the
truthful signal is the deploying job's own conclusion.

## The stories behind the rules

- A deploy gate blocked every release for three days while every pull
  request check stayed green: images were scanned only after merge, and
  the advisory was ignored in both lockfile lists but never the image
  list. The durable fix removed the dev toolchain from the image.
- The accepted-risk note blamed a dev-only linter chain at a moment when
  the vulnerable package was also in the production bundle. Lockfile tools
  cannot tell shipped from dev-only; only the image scan can.
- The blocking gate was thirty lines of hand-written report parsing that
  reimplemented two native scanner options.
- Two config files carried the same lists; the package manager read one,
  and the drifted dead twin was the one cited as authority.
- The patched major changed its export shape and could not be loaded by
  its consumer; the fix was to stop shipping the consumer.
- The gate's first pull-request run died on a missing private-repository
  permission, and the first deploy after it merged died at startup because
  two of three calling workflows had not been granted the new permissions.
  Both rules in section 2 are those failures, written down.
- Two deploy runs said "success" with every deploy job skipped, and a
  monitor watching run conclusions declared an outage over while nothing
  had deployed. Watch the job.
