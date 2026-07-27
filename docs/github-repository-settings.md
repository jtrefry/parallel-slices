# GitHub repository settings

This page describes the bundled `nextjs-gcp-postgres` package's GitHub workflow. Other
architecture packages own their CI runner, services, toolchain, and required
status-check documentation.

Local hooks improve feedback, but `git commit --no-verify` and `git push
--no-verify` can bypass them. Protect `main` on GitHub so repository policy is
enforced server-side.

## Configure GitHub publication before initialization

GitHub mode is designed to remove routine repository administration from the
developer. During initialization, the selected controller initializes local
Git, creates the convention-compliant goal branch, and establishes the
authorized GitHub repository and base branch before the first project commit.
It then commits the approved plan, creates one commit per accepted slice,
pushes the goal branch, writes one goal-level pull-request title and
description, and monitors GitHub Actions with the `gh` CLI. After human merge,
it can also report the resulting protected-branch quality and delivery workflow
status. It does not merge or approve the PR, trigger a deployment, or bypass an
environment approval for you.

Before initialization, choose the GitHub account that should own or access the
repository and authenticate interactively. These `gh` and `git` commands act on
your global environment and can run from any directory:

```bash
gh auth login --hostname github.com --web
gh auth setup-git --hostname github.com
```

Follow the browser flow and choose the Git protocol you use locally. Then
verify the active account and username:

```bash
gh auth status --active --hostname github.com
gh api user --jq .login
```

If several accounts are already authenticated, switch to the intended account:

```bash
gh auth switch --hostname github.com --user YOUR_GITHUB_USERNAME
gh auth setup-git --hostname github.com
```

Also configure the identity recorded on commits if it is not already set:

```bash
git config --global user.name "YOUR NAME"
git config --global user.email "YOUR VERIFIED GITHUB EMAIL"
```

The active `gh` account is the GitHub identity used for repository automation.
Git's `user.name` and `user.email` identify commits; they do not select the
GitHub account or repository owner. Parallel Slices records the required GitHub
username separately as `account` in `.parallel-slices/repository.json` and refuses
to publish when it does not match `gh api user --jq .login`.

Tell the initialization agent your authenticated GitHub username, the user or
organization that will own the repository, repository name, visibility,
whether it may create the repository when absent, and desired base branch. The
agent records that exact authorization in
`.parallel-slices/repository.json`. Never paste a GitHub token into chat, a prompt,
an environment file, or the repository.

For a new remote repository, the agent creates a minimal GitHub-initialized
base branch before any slice commits exist. This is what makes the first goal a
normal pull request instead of a direct protected-branch push. Repository
creation is not deferred until the goal is finished.

See the installed
[GitHub automation contract](../repo-overlay/docs/parallel-slices/github-automation.md)
for the repository profile, exact agent-owned operations, and prohibited
actions.

## Branch names

This template uses:

```text
<type>/<short-kebab-description>
```

Allowed types are:

- `feature/` or `feat/`
- `fix/` or `bugfix/`
- `hotfix/`
- `chore/`
- `release/`
- `docs/`
- `test/`
- `refactor/`
- `perf/`
- `ci/`
- `build/`

Examples:

```text
feature/add-account-settings
fix/prevent-duplicate-submission
chore/update-test-fixtures
feature/issue-123-add-account-settings
```

Use lowercase ASCII letters and numbers separated by single hyphens. Do not use
spaces, underscores, leading or trailing hyphens, or repeated hyphens. The
description should say what the branch changes, not who owns it.

The regular expression is stored in `.parallel-slices/config.json`. Husky checks it
before local commits and pushes, the implementation gate checks it before a
slice, and the Quality workflow checks pull-request source branches. Dependabot
and Renovate branches are allowed only in CI through explicit automation
patterns.

GitHub does not prescribe one universal feature-branch naming format. This is
the template's documented convention; GitHub rulesets provide the server-side
mechanism for protecting the default branch.

## Protect `main`

Create a branch ruleset targeting the default branch and enable it. At minimum:

1. Require a pull request before merging.
2. Require the `quality` status check to pass.
3. Require the branch to be up to date before merging when the repository's
   merge volume makes that practical.
4. Require at least one approving review and dismiss stale approvals when
   security or ownership risk warrants it.
5. Block force pushes and branch deletion.
6. Do not grant routine bypass permission.
7. Optionally require linear history and signed commits.

Repository instructions must say: never commit directly to `main`, never push
directly to `main`, and never use a protected branch as the implementation-loop
checkout. Changes reach `main` only through an approved pull request.

The Parallel Slices publication unit is one approved goal: one
convention-compliant branch, one logical commit per accepted slice, and one pull
request containing the complete goal. Human review applies to that pull request,
not to every slice commit. In GitHub mode, the run controller uses the exact
`.parallel-slices/repository.json` profile during initialization to establish or
verify the repository, remote, and base branch before the first project commit.
After the goal audit, it pushes the goal branch, creates or updates the PR, and
watches required checks with `gh`. It never merges or approves its own PR.

## Quality status

The installed `.github/workflows/quality.yml` runs for pull requests and pushes
to `main`. It activates the exact declared package-manager version, performs a
frozen dependency install, verifies `foundation-ready` project state, checks the
pull-request branch name, and runs the selected profile's pipeline. The
`postgres` profile also provides an isolated PostgreSQL service at
`DATABASE_URL` and runs:

```text
Prettier check
lint
TypeScript check
SQL security scan
production build
unit tests
integration tests
E2E tests
Trivy repository scan
```

The `postgres` profile's PostgreSQL service image is pinned by digest. During initialization, align
its major version with the selected Cloud SQL PostgreSQL version and record
digest updates through normal dependency review.

Set the ruleset's required status check to the job name `quality`. Keep human
review required even when every automated check passes. For `postgres`, align the PostgreSQL
container version and test setup with production before relying on database
integration results.
