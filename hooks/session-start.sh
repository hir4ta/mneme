#!/usr/bin/env bash
#
# session-start.sh - SessionStart hook for mneme plugin
#
# Purpose: Initialize session JSON and inject context via additionalContext
# Delegates heavy processing to lib/session-init.ts (Node.js).
#
# Input (stdin): JSON with session_id, cwd, trigger (startup|resume|clear|compact)
# Output (stdout): JSON with hookSpecificOutput.additionalContext
# Exit codes: 0 = success (continue session)
#
# Dependencies: jq, Node.js

set -euo pipefail

# Source shared helpers
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

# Read input from stdin
input_json=$(cat)

# Check for jq (required dependency)
if ! command -v jq &> /dev/null; then
    echo "[mneme:session-start] Warning: jq not found. Install with: brew install jq" >&2
    echo "[mneme:session-start] Session tracking disabled for this session." >&2
    exit 0
fi

cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")
session_id=$(echo "$input_json" | jq -r '.session_id // empty' 2>/dev/null || echo "")

if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")

# Check if mneme is initialized
if ! validate_mneme "$cwd"; then
    echo "[mneme:session-start] Not initialized in this project. Run: npx @hir4ta/mneme --init" >&2
    exit 0
fi

PLUGIN_ROOT="$(get_plugin_root)"

# Find session-init script
init_script=$(find_script "$PLUGIN_ROOT" "session-init")
if [ -z "$init_script" ]; then
    echo "[mneme:session-start] session-init script not found, falling back" >&2
    exit 0
fi

# Run session-init (Node.js handles all heavy processing)
result=$(invoke_node "$init_script" init \
    --session-id "$session_id" \
    --cwd "$cwd") || {
    echo "[mneme:session-start] session-init failed" >&2
    exit 0
}

# Extract additionalContext from JSON result
additional_context=$(echo "$result" | jq -r '.additionalContext // empty' 2>/dev/null || echo "")

if [ -z "$additional_context" ]; then
    exit 0
fi

# Output context injection as JSON
jq -n --arg context "$additional_context" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $context
  }
}'

exit 0
