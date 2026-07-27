#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: $0 [--force] [--architecture <id>] [--architecture-package <absolute-path>] [--architecture-profile <id>] [--architecture-options-json <json>] [--architecture-source-json <json>] [--default-controller cursor|codex|claude-code] /absolute/path/to/repository" >&2
  exit 2
}

force=0
agent=""
architecture="nextjs-gcp-postgres"
architecture_package=""
architecture_profile=""
architecture_options_json="{}"
architecture_source_json=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --force)
      force=1
      shift
      ;;
    --architecture)
      [ "$#" -ge 2 ] || usage
      architecture="$2"
      shift 2
      ;;
    --architecture-options-json)
      [ "$#" -ge 2 ] || usage
      architecture_options_json="$2"
      shift 2
      ;;
    --architecture-package)
      [ "$#" -ge 2 ] || usage
      architecture_package="$2"
      shift 2
      ;;
    --architecture-profile)
      [ "$#" -ge 2 ] || usage
      architecture_profile="$2"
      shift 2
      ;;
    --architecture-source-json)
      [ "$#" -ge 2 ] || usage
      architecture_source_json="$2"
      shift 2
      ;;
    --agent|--default-controller)
      [ "$#" -ge 2 ] || usage
      agent="$2"
      shift 2
      ;;
    --*) usage ;;
    *) break ;;
  esac
done

[ "$#" -eq 1 ] || usage
case "$agent" in
  ""|cursor|codex|claude-code) ;;
  *) usage ;;
esac
target="$1"
[ "${target#/}" != "$target" ] || {
  echo "target must be an absolute path: $target" >&2
  exit 2
}
[ -d "$target" ] || {
  echo "target repository does not exist: $target" >&2
  exit 2
}
target="$(cd "$target" && pwd -P)"

for critical_path in \
  package.json AGENTS.md \
  .parallel-slices/agent.json .parallel-slices/agent.schema.json \
  .parallel-slices/architecture.json .parallel-slices/architecture.schema.json \
  .parallel-slices/config.json .parallel-slices/config.schema.json \
  .parallel-slices/loop-state.schema.json \
  .parallel-slices/review.json .parallel-slices/review.schema.json \
  .parallel-slices/review-response.schema.json \
  .parallel-slices/repository.json .parallel-slices/repository.schema.json \
  package-lock.json pnpm-lock.yaml yarn.lock bun.lock bun.lockb; do
  if [ -L "$target/$critical_path" ]; then
    echo "refusing target symlink for repository control file: $target/$critical_path" >&2
    exit 1
  fi
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
parallel_slices_root="$(cd "$script_dir/.." && pwd)"

architecture_reference="$architecture"
if [ -n "$architecture_package" ]; then
  case "$architecture_package" in
    /*) ;;
    *) usage ;;
  esac
  architecture_reference="$architecture_package"
fi

node "$script_dir/architecture-package.mjs" validate \
  "$architecture_reference" "$architecture_profile"
node "$script_dir/architecture-package.mjs" preflight-profile \
  "$architecture_reference" "$target" "$architecture_options_json" \
  "$architecture_profile" "$architecture_source_json"
target_check_args=(--architecture "$architecture")
overlay_args=(--architecture "$architecture")
if [ -n "$architecture_package" ]; then
  target_check_args+=(--architecture-package "$architecture_package")
  overlay_args+=(--architecture-package "$architecture_package")
fi
if [ -n "$architecture_profile" ]; then
  target_check_args+=(--architecture-profile "$architecture_profile")
  overlay_args+=(--architecture-profile "$architecture_profile")
fi
node "$script_dir/check-target.mjs" "${target_check_args[@]}" "$target"

install_args=("${overlay_args[@]}" "$target")
if [ "$force" -eq 1 ]; then
  install_args=(--force "${install_args[@]}")
fi
node "$script_dir/install-overlays.mjs" "${install_args[@]}"

node "$script_dir/architecture-package.mjs" install-profile \
  "$architecture_reference" "$target" "$architecture_options_json" \
  "$architecture_profile" "$architecture_source_json"

if [ -L "$target/.parallel-slices/agent.json" ]; then
  echo "refusing symlinked agent profile: $target/.parallel-slices/agent.json" >&2
  exit 1
fi
if [ -L "$target/.parallel-slices/project-state.json" ]; then
  echo "refusing symlinked project state: $target/.parallel-slices/project-state.json" >&2
  exit 1
fi
if [ -L "$target/.parallel-slices/repository.json" ]; then
  echo "refusing symlinked repository profile: $target/.parallel-slices/repository.json" >&2
  exit 1
fi
if [ -f "$target/.parallel-slices/agent.json" ]; then
  current_agent="$(node "$target/scripts/parallel-slices/agent-profile.mjs" show "$target")"
  if [ -z "$agent" ]; then
    agent="$current_agent"
  fi
elif [ -z "$agent" ]; then
  agent="cursor"
fi

node "$target/scripts/parallel-slices/agent-profile.mjs" configure "$agent" "$target"
node "$target/scripts/parallel-slices/project-state.mjs" ensure "$target"

echo "installed the Parallel Slices control layer in $target"
echo "architecture: $architecture profile=${architecture_profile:-default}"
echo "enabled controllers: cursor, codex, claude-code"
echo "default controller: $agent"
echo "next: review .parallel-slices/architecture.json, .parallel-slices/config.json, .parallel-slices/review.json, and docs/plans/AGENTS.md"
echo "then run: $script_dir/verify.sh $target"
