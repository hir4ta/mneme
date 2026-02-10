#!/usr/bin/env bash
#
# session-end.sh - SessionEnd hook for mneme plugin
#
# Delegates session finalization to lib/session-finalize.ts (Node.js):
# 1. Final incremental save
# 2. Update session JSON status to "complete" or "uncommitted"
# 3. Master session workPeriods.endedAt update
# 4. Stale uncommitted session grace cleanup
#
# Input (stdin): JSON with session_id, transcript_path, cwd
# Output (stderr): Log messages
# Exit codes: 0 = success (SessionEnd cannot be blocked)
#
# Dependencies: jq, Node.js

set -euo pipefail

# Source shared helpers
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

if ! command -v jq >/dev/null 2>&1; then
    echo "[mneme:session-end] jq not found, skipping" >&2
    exit 0
fi

# Read input from stdin
input_json=$(cat)

session_id=$(echo "$input_json" | jq -r '.session_id // empty' 2>/dev/null || echo "")
transcript_path=$(echo "$input_json" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")

if [ -z "$session_id" ]; then
    exit 0
fi

if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")

if ! validate_mneme "$cwd"; then
    exit 0
fi

PLUGIN_ROOT="$(get_plugin_root)"

# Cleanup policy
cleanup_policy="${MNEME_UNCOMMITTED_POLICY:-grace}"
cleanup_grace_days="${MNEME_UNCOMMITTED_GRACE_DAYS:-7}"

# Find session-finalize script
finalize_script=$(find_script "$PLUGIN_ROOT" "session-finalize")
if [ -z "$finalize_script" ]; then
    echo "[mneme:session-end] session-finalize script not found" >&2
    exit 0
fi

# Run session-finalize (Node.js handles all heavy processing)
invoke_node "$finalize_script" finalize \
    --session-id "$session_id" \
    --cwd "$cwd" \
    --transcript "$transcript_path" \
    --cleanup-policy "$cleanup_policy" \
    --grace-days "$cleanup_grace_days" >/dev/null 2>&1 || true

exit 0
