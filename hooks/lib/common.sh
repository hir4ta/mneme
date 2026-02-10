#!/usr/bin/env bash
#
# common.sh - Shared helpers for mneme hooks
#
# Source this file at the top of each hook:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
#
# Provides:
#   get_plugin_root  - resolve plugin root from hooks/ dir
#   validate_mneme   - check .mneme directory exists
#   find_script      - locate dist/*.js (prod) or lib/*.ts (dev)
#   invoke_node      - run node (prod) or npx tsx (dev)

# Resolve the mneme plugin root directory (parent of hooks/)
get_plugin_root() {
  local hooks_dir
  hooks_dir="$(cd "$(dirname "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}")" && pwd)"
  cd "${hooks_dir}/.." && pwd
}

# Check that .mneme directory exists in the given project path.
# Returns 0 if exists, 1 if not.
validate_mneme() {
  local cwd="$1"
  [ -d "${cwd}/.mneme" ]
}

# Find a script: first try dist/ (production), then lib/ (development).
# Usage: find_script <plugin_root> <name>
# Example: find_script "$PLUGIN_ROOT" "incremental-save"
#   → /path/to/dist/lib/incremental-save.js  or
#   → /path/to/lib/incremental-save.ts        or
#   → "" (not found)
find_script() {
  local plugin_root="$1"
  local name="$2"
  if [ -f "${plugin_root}/dist/lib/${name}.js" ]; then
    echo "${plugin_root}/dist/lib/${name}.js"
  elif [ -f "${plugin_root}/lib/${name}.ts" ]; then
    echo "${plugin_root}/lib/${name}.ts"
  fi
}

# Invoke a Node.js script: use node for .js, npx tsx for .ts.
# All remaining arguments are passed through.
# Usage: invoke_node <script_path> [args...]
invoke_node() {
  local script="$1"
  shift
  if [[ "$script" == *.ts ]]; then
    npx tsx "$script" "$@"
  else
    node "$script" "$@"
  fi
}
