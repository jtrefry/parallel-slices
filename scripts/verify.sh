#!/usr/bin/env bash

set -euo pipefail

foundation_ready=0
architecture=""
architecture_package=""
architecture_profile=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --foundation-ready)
      foundation_ready=1
      shift
      ;;
    --architecture)
      [ "$#" -ge 2 ] || {
        echo "--architecture requires a value" >&2
        exit 2
      }
      architecture="$2"
      shift 2
      ;;
    --architecture-package)
      [ "$#" -ge 2 ] || {
        echo "--architecture-package requires a value" >&2
        exit 2
      }
      architecture_package="$2"
      shift 2
      ;;
    --architecture-profile)
      [ "$#" -ge 2 ] || {
        echo "--architecture-profile requires a value" >&2
        exit 2
      }
      architecture_profile="$2"
      shift 2
      ;;
    --*)
      echo "unknown option: $1" >&2
      exit 2
      ;;
    *) break ;;
  esac
done

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "usage: $0 [--foundation-ready] [--architecture <id>] [--architecture-package <absolute-path>] [--architecture-profile <id>] /absolute/path/to/repository [scope-manifest]" >&2
  exit 2
fi

target="$1"
scope_file="${2:-}"
[ -d "$target" ] || {
  echo "target repository does not exist: $target" >&2
  exit 2
}
target="$(cd "$target" && pwd -P)"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$architecture" ]; then
  architecture="$(node "$target/scripts/parallel-slices/architecture-profile.mjs" id "$target")"
fi
architecture_reference="$architecture"
if [ -n "$architecture_package" ]; then
  architecture_reference="$architecture_package"
fi
if [ -z "$architecture_profile" ]; then
  architecture_profile="$(node "$target/scripts/parallel-slices/architecture-profile.mjs" profile "$target")"
fi
node "$script_dir/architecture-package.mjs" validate \
  "$architecture_reference" "$architecture_profile"

required=(
  .parallel-slices/agent.json
  .parallel-slices/agent.schema.json
  .parallel-slices/architecture.json
  .parallel-slices/architecture.schema.json
  .parallel-slices/config.schema.json
  .parallel-slices/loop-state.schema.json
  .parallel-slices/runtime/.gitignore
  .parallel-slices/review.json
  .parallel-slices/review.schema.json
  .parallel-slices/review-response.schema.json
  .parallel-slices/scope-correction.schema.json
  .parallel-slices/repository.json
  .parallel-slices/repository.schema.json
  .agents/skills/parallel-slices-next/SKILL.md
  .agents/skills/parallel-slices-plan/SKILL.md
  .agents/skills/parallel-slices-plan/agents/openai.yaml
  .agents/skills/parallel-slices-prepare/SKILL.md
  .agents/skills/parallel-slices-status/SKILL.md
  .agents/skills/slices-next/SKILL.md
  .agents/skills/slices-plan/SKILL.md
  .agents/skills/slices-prepare/SKILL.md
  .agents/skills/slices-status/SKILL.md
  .claude/CLAUDE.md
  .claude/skills/parallel-slices-next/SKILL.md
  .claude/skills/parallel-slices-plan/SKILL.md
  .claude/skills/parallel-slices-prepare/SKILL.md
  .claude/skills/parallel-slices-status/SKILL.md
  .claude/skills/slices-next/SKILL.md
  .claude/skills/slices-plan/SKILL.md
  .claude/skills/slices-prepare/SKILL.md
  .claude/skills/slices-status/SKILL.md
  .cursor/commands/parallel-slices-next.md
  .cursor/commands/parallel-slices-plan.md
  .cursor/commands/parallel-slices-prepare.md
  .cursor/commands/parallel-slices-status.md
  .cursor/commands/slices-next.md
  .cursor/commands/slices-plan.md
  .cursor/commands/slices-prepare.md
  .cursor/commands/slices-status.md
  .cursor/rules/parallel-slices-controller.mdc
  .cursor/skills/parallel-slices-next/SKILL.md
  .cursor/skills/parallel-slices-plan/SKILL.md
  .github/pull_request_template.md
  .husky/pre-commit
  .husky/pre-push
  docs/AGENTS.md
  docs/plans/AGENTS.md
  docs/plans/_LOOP-STATE-TEMPLATE.json
  docs/plans/_PRODUCT-PLAN-TEMPLATE.md
  docs/plans/loop-state-template.md
  docs/plans/scopes/_PLANNING-SCOPE-TEMPLATE.scope
  docs/plans/scopes/_SCOPE-TEMPLATE.scope
  docs/project/AGENTS.md
  docs/releases/AGENTS.md
  docs/releases/README.md
  docs/releases/templates/developer-fragment.md
  docs/testing/manual/AGENTS.md
  docs/testing/manual/_MANUAL-TEST-SCRIPT-TEMPLATE.md
  docs/testing/manual/multi-agent-review-test-script.md
  docs/parallel-slices/README.md
  docs/parallel-slices/github-automation.md
  docs/parallel-slices/check-run-status.md
  docs/parallel-slices/prepare-controller.md
  docs/parallel-slices/planning-and-optimized-slices.md
  docs/parallel-slices/plan-milestone.md
  docs/parallel-slices/run-slice-worker.md
  docs/parallel-slices/run-sliced-plan.md
  docs/parallel-slices/robust-recovery.md
  docs/parallel-slices/using-codex.md
  docs/parallel-slices/using-cursor.md
  docs/parallel-slices/using-claude-code.md
  docs/parallel-slices/multi-agent-review.md
  docs/parallel-slices/assets/multi-agent-review.svg
  docs/plans/corrections/AGENTS.md
  docs/plans/reviews/AGENTS.md
  scripts/parallel-slices/agent-profile.mjs
  scripts/parallel-slices/architecture-profile.mjs
  scripts/parallel-slices/branch-policy.mjs
  scripts/parallel-slices/content-safety.mjs
  scripts/parallel-slices/corepack-runner.mjs
  scripts/parallel-slices/doctor.mjs
  scripts/parallel-slices/gate.mjs
  scripts/parallel-slices/generated-baseline.mjs
  scripts/parallel-slices/install-curated-skills.mjs
  scripts/parallel-slices/project-quality.mjs
  scripts/parallel-slices/project-state.mjs
  scripts/parallel-slices/planning-review.mjs
  scripts/parallel-slices/repository-profile.mjs
  scripts/parallel-slices/run-lock.mjs
  scripts/parallel-slices/run-status.mjs
  scripts/parallel-slices/run-state.mjs
  scripts/parallel-slices/run-tracking.mjs
  scripts/parallel-slices/quality.mjs
  scripts/parallel-slices/review.mjs
  scripts/parallel-slices/review-artifact.mjs
  scripts/parallel-slices/review-config.mjs
  scripts/parallel-slices/review-contract.mjs
  scripts/parallel-slices/review-process.mjs
  scripts/parallel-slices/review-providers.mjs
  scripts/parallel-slices/review-snapshot.mjs
  scripts/parallel-slices/review-state.mjs
  scripts/parallel-slices/scope-policy.mjs
  scripts/parallel-slices/scope-correction.mjs
  scripts/parallel-slices/slice-compilation.mjs
  scripts/parallel-slices/slice-graph.mjs
  scripts/parallel-slices/slice-worktree.mjs
  scripts/parallel-slices/setup-husky.mjs
  scripts/parallel-slices/switch-agent.mjs
)

while IFS= read -r path; do
  [ -n "$path" ] && required+=("$path")
done < <(node "$script_dir/architecture-package.mjs" required-files \
  "$architecture_reference" "$architecture_profile")

failed=0
for path in "${required[@]}"; do
  if [ -f "$target/$path" ]; then
    echo "ok: $path"
  else
    echo "missing: $path" >&2
    failed=1
  fi
done

if [ -f "$target/.parallel-slices/project-state.json" ]; then
  echo "ok: .parallel-slices/project-state.json"
else
  echo "missing: .parallel-slices/project-state.json" >&2
  failed=1
fi

project_stage="$(node -p \
  "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).stage" \
  "$target/.parallel-slices/project-state.json" 2>/dev/null || true)"
if [ "$project_stage" = "initialization-required" ] \
  && [ -f "$target/.parallel-slices/scaffold-profile.json" ]; then
  node "$target/scripts/parallel-slices/generated-baseline.mjs" "$target" || failed=1
fi

for hook in .husky/pre-commit .husky/pre-push; do
  if [ -x "$target/$hook" ]; then
    echo "ok: executable $hook"
  else
    echo "not executable: $hook" >&2
    failed=1
  fi
done

hooks_path="$(git -C "$target" config --get core.hooksPath 2>/dev/null || true)"
if [ "$hooks_path" = ".husky/_" ] \
  && [ -f "$target/.husky/_/h" ] \
  && [ -x "$target/.husky/_/pre-commit" ] \
  && [ -x "$target/.husky/_/pre-push" ]; then
  echo "ok: Husky Git hooks are active"
else
  echo "Husky is not active; expected core.hooksPath=.husky/_ and generated hook shims" >&2
  failed=1
fi

node_version="$(node --version 2>/dev/null || true)"
if [[ "$node_version" =~ ^v([0-9]+)\. ]]; then
  if [ "${BASH_REMATCH[1]}" -ne 22 ] && [ "${BASH_REMATCH[1]}" -ne 24 ]; then
    echo "Node.js 22 LTS or 24 LTS is required; Node.js 24 is recommended" >&2
    failed=1
  else
    echo "Node.js: $node_version (supported control-plane LTS line)"
  fi
else
  echo "Node.js is unavailable or its version could not be read" >&2
  failed=1
fi

node "$target/scripts/parallel-slices/architecture-profile.mjs" verify "$target" || failed=1
selected_agent=""
if selected_agent="$(node "$target/scripts/parallel-slices/agent-profile.mjs" show "$target")"; then
  echo "Default controller: $selected_agent"
else
  failed=1
fi
enabled_agents="$(node "$target/scripts/parallel-slices/agent-profile.mjs" list "$target" || true)"
if [ "$enabled_agents" = "$(printf 'cursor\ncodex\nclaude-code')" ]; then
  echo "Enabled controllers: cursor, codex, claude-code"
else
  echo "agent profile must enable cursor, codex, and claude-code" >&2
  failed=1
fi

for cli in cursor codex claude; do
  if command -v "$cli" >/dev/null 2>&1; then
    echo "$cli: $($cli --version 2>/dev/null | head -n 1 || true)"
  else
    echo "warning: $cli CLI is not available on PATH" >&2
  fi
done

node "$target/scripts/parallel-slices/repository-profile.mjs" verify "$target" || failed=1
target_check=(--architecture "$architecture")
if [ -n "$architecture_package" ]; then
  target_check+=(--architecture-package "$architecture_package")
fi
target_check+=(--architecture-profile "$architecture_profile" "$target")
architecture_mode="inspect"
if [ "$foundation_ready" -eq 1 ]; then
  target_check=(--strict "${target_check[@]}")
  architecture_mode="foundation"
fi
node "$script_dir/check-target.mjs" "${target_check[@]}" || failed=1

installed_verifier="$(node "$target/scripts/parallel-slices/architecture-profile.mjs" \
  installed-verifier "$target")"
node "$target/$installed_verifier" "$architecture_mode" "$target" || failed=1

(
  cd "$target"
  node scripts/parallel-slices/quality.mjs package-manager >/dev/null
  node scripts/parallel-slices/review.mjs validate >/dev/null
) || failed=1
if [ "$foundation_ready" -eq 1 ]; then
  (
    cd "$target"
    node scripts/parallel-slices/doctor.mjs --foundation-ready
  ) || failed=1
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi

if [ -n "$scope_file" ]; then
  case "$scope_file" in
    /*)
      echo "scope manifest must be repository-relative: $scope_file" >&2
      exit 2
      ;;
  esac
  (
    cd "$target"
    node scripts/parallel-slices/gate.mjs \
      --scope-file "$scope_file" \
      --scope-check-only
  )
fi

echo "Parallel Slices prerequisites verified for $architecture with Cursor, Codex, and Claude Code"
