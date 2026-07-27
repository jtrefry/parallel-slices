#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: $0 [--force] [--architecture <id>] [--architecture-package <absolute-path>] [--architecture-profile <id>] [--architecture-options-json <json>] [--default-controller cursor|codex|claude-code] /absolute/path/to/repository" >&2
  exit 2
}

force=0
agent=""
architecture="nextjs-gcp-postgres"
architecture_package=""
architecture_profile=""
architecture_options_json="{}"
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

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install_args=(
  --architecture "$architecture"
  --architecture-options-json "$architecture_options_json"
  "$target"
)
if [ -n "$architecture_package" ]; then
  install_args=(--architecture-package "$architecture_package" "${install_args[@]}")
fi
if [ -n "$architecture_profile" ]; then
  install_args=(--architecture-profile "$architecture_profile" "${install_args[@]}")
fi
if [ "$force" -eq 1 ]; then
  install_args=(--force "${install_args[@]}")
fi
if [ -n "$agent" ]; then
  install_args=(--default-controller "$agent" "${install_args[@]}")
fi

"$script_dir/install.sh" "${install_args[@]}"
selected_agent="$(node "$target/scripts/parallel-slices/agent-profile.mjs" show "$target")"
selected_architecture="$(node "$target/scripts/parallel-slices/architecture-profile.mjs" id "$target")"
selected_profile="$(node "$target/scripts/parallel-slices/architecture-profile.mjs" profile "$target")"
architecture_reference="$selected_architecture"
if [ -n "$architecture_package" ]; then
  architecture_reference="$architecture_package"
fi
node "$target/scripts/parallel-slices/setup-husky.mjs" "$target"

if [ -L "$target/AGENTS.md" ]; then
  echo "refusing symlinked root instructions: $target/AGENTS.md" >&2
  exit 1
fi
if [ ! -e "$target/AGENTS.md" ]; then
  root_instructions="$(node "$script_dir/architecture-package.mjs" root-instructions "$architecture_reference" "$selected_profile")"
  cp "$root_instructions" "$target/AGENTS.md"
  echo "created architecture bootstrap AGENTS.md"
fi

verify_args=(--architecture "$selected_architecture")
if [ -n "$architecture_package" ]; then
  verify_args+=(--architecture-package "$architecture_package")
fi
if [ -n "$architecture_profile" ]; then
  verify_args+=(--architecture-profile "$architecture_profile")
fi
"$script_dir/verify.sh" "${verify_args[@]}" "$target"

next_command="$(node "$target/scripts/parallel-slices/architecture-profile.mjs" \
  initialize-command "$selected_agent" "$target")"
echo "Parallel Slices controls, Husky hooks, and CI quality gate are ready"
echo "architecture: $selected_architecture"
echo "enabled controllers: cursor, codex, claude-code"
echo "default controller: $selected_agent"
if [ -f "$target/.parallel-slices/curated-skills.json" ]; then
  echo "optional curated skills: node scripts/parallel-slices/install-curated-skills.mjs '$target'"
fi
echo "next for an uninitialized project: read docs/parallel-slices/README.md"
echo "default-tool shortcut: open it in $selected_agent and run $next_command"
