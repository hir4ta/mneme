#!/usr/bin/env bash
#
# session-end.sh - SessionEnd hook for mneme plugin
#
# Lightweight session finalization:
# 1. Update session JSON status to "complete"
# 2. Clean up uncommitted sessions (delete interactions if not saved with /mneme:save)
#
# Heavy processing (interaction extraction) is now done incrementally by Stop hook.
#
# Input (stdin): JSON with session_id, transcript_path, cwd
# Output (stderr): Log messages
# Exit codes: 0 = success (SessionEnd cannot be blocked)
#
# Dependencies: jq, Node.js

set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
    echo "[mneme] SessionEnd: jq not found, skipping" >&2
    exit 0
fi

# Read input from stdin
input_json=$(cat)

# Extract fields
session_id=$(echo "$input_json" | jq -r '.session_id // empty' 2>/dev/null || echo "")
transcript_path=$(echo "$input_json" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")

if [ -z "$session_id" ]; then
    exit 0
fi

# Use cwd from input or fallback to PWD
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi

# Resolve paths
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")
mneme_dir="${cwd}/.mneme"
sessions_dir="${mneme_dir}/sessions"
session_links_dir="${mneme_dir}/session-links"

# Cleanup policy
# - immediate: old behavior, delete unsaved sessions immediately
# - grace: mark unsaved sessions and delete after grace days
# - never: keep unsaved sessions
cleanup_policy="${MNEME_UNCOMMITTED_POLICY:-grace}"
cleanup_grace_days="${MNEME_UNCOMMITTED_GRACE_DAYS:-7}"

# Check if .mneme directory exists
if [ ! -d "$mneme_dir" ]; then
    exit 0
fi

# Find session file
session_short_id="${session_id:0:8}"
session_file=""
mneme_session_id="$session_short_id"

if [ -d "$sessions_dir" ]; then
    session_file=$(find "$sessions_dir" -type f -name "${session_short_id}.json" 2>/dev/null | head -1)
fi

# If not found, check session-links for master session ID
if [ -z "$session_file" ] || [ ! -f "$session_file" ]; then
    session_link_file="${session_links_dir}/${session_short_id}.json"
    if [ -f "$session_link_file" ]; then
        master_session_id=$(jq -r '.masterSessionId // empty' "$session_link_file" 2>/dev/null || echo "")
        if [ -n "$master_session_id" ]; then
            session_file=$(find "$sessions_dir" -type f -name "${master_session_id}.json" 2>/dev/null | head -1)
            if [ -n "$session_file" ] && [ -f "$session_file" ]; then
                mneme_session_id="$master_session_id"
            fi
        fi
    fi
fi

# Get plugin root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Final incremental save (catch any remaining interactions)
incremental_save_script=""
if [ -f "${PLUGIN_ROOT}/dist/lib/incremental-save.js" ]; then
    incremental_save_script="${PLUGIN_ROOT}/dist/lib/incremental-save.js"
elif [ -f "${PLUGIN_ROOT}/lib/incremental-save.ts" ]; then
    incremental_save_script="${PLUGIN_ROOT}/lib/incremental-save.ts"
fi

if [ -n "$incremental_save_script" ] && [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
    if [[ "$incremental_save_script" == *.ts ]]; then
        npx tsx "$incremental_save_script" save \
            --session "$session_id" \
            --transcript "$transcript_path" \
            --project "$cwd" >/dev/null 2>&1 || true
    else
        node "$incremental_save_script" save \
            --session "$session_id" \
            --transcript "$transcript_path" \
            --project "$cwd" >/dev/null 2>&1 || true
    fi
fi

# Update session JSON status
now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ -n "$session_file" ] && [ -f "$session_file" ]; then
    # Check if session has summary (was saved with /mneme:save)
    has_summary=$(jq -r 'if .summary then "true" else "false" end' "$session_file" 2>/dev/null || echo "false")

    # Cleanup uncommitted sessions
    if [ "$has_summary" = "false" ]; then
        cleanup_after=$(date -u -v+"${cleanup_grace_days}"d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+${cleanup_grace_days} days" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
        jq --arg status "uncommitted" \
           --arg endedAt "$now" \
           --arg updatedAt "$now" \
           --arg policy "$cleanup_policy" \
           --arg cleanupAfter "$cleanup_after" '
            .status = $status |
            .endedAt = $endedAt |
            .updatedAt = $updatedAt |
            .uncommitted = {
                endedAt: $endedAt,
                policy: $policy,
                cleanupAfter: (if $cleanupAfter == "" then null else $cleanupAfter end)
            } |
            del(.interactions) |
            del(.preCompactBackups)
        ' "$session_file" > "${session_file}.tmp" && mv "${session_file}.tmp" "$session_file"

        if [ "$cleanup_policy" = "immediate" ] && [ -n "$incremental_save_script" ]; then
            if [[ "$incremental_save_script" == *.ts ]]; then
                cleanup_result=$(npx tsx "$incremental_save_script" cleanup \
                    --session "$session_id" \
                    --project "$cwd" 2>/dev/null) || cleanup_result='{"deleted":false}'
            else
                cleanup_result=$(node "$incremental_save_script" cleanup \
                    --session "$session_id" \
                    --project "$cwd" 2>/dev/null) || cleanup_result='{"deleted":false}'
            fi

            if echo "$cleanup_result" | grep -q '"deleted":true'; then
                deleted_count=$(echo "$cleanup_result" | grep -o '"count":[0-9]*' | cut -d':' -f2 || echo "0")
                echo "[mneme] Session ended without /mneme:save - cleaned up ${deleted_count} interactions" >&2
            fi

            rm -f "$session_file"
            link_file="${session_links_dir}/${session_short_id}.json"
            if [ -f "$link_file" ]; then
                rm -f "$link_file"
            fi
            echo "[mneme] Session completed (not saved, cleaned up immediately)" >&2
        elif [ "$cleanup_policy" = "never" ]; then
            echo "[mneme] Session completed (not saved, kept as uncommitted)" >&2
        else
            echo "[mneme] Session completed (not saved, marked uncommitted for grace cleanup)" >&2
        fi
    else
        jq --arg status "complete" \
           --arg endedAt "$now" \
           --arg updatedAt "$now" '
            .status = $status |
            .endedAt = $endedAt |
            .updatedAt = $updatedAt |
            del(.uncommitted) |
            del(.interactions) |
            del(.preCompactBackups)
        ' "$session_file" > "${session_file}.tmp" && mv "${session_file}.tmp" "$session_file"
        echo "[mneme] Session completed: ${session_file}" >&2
    fi
else
    echo "[mneme] Session completed (no session file found)" >&2
fi

# Grace cleanup for stale uncommitted sessions
if [ "$cleanup_policy" = "grace" ] && [ -n "$incremental_save_script" ]; then
    if [[ "$incremental_save_script" == *.ts ]]; then
        stale_result=$(npx tsx "$incremental_save_script" cleanup-stale \
            --project "$cwd" \
            --grace-days "$cleanup_grace_days" 2>/dev/null) || stale_result='{}'
    else
        stale_result=$(node "$incremental_save_script" cleanup-stale \
            --project "$cwd" \
            --grace-days "$cleanup_grace_days" 2>/dev/null) || stale_result='{}'
    fi

    deleted_sessions=$(echo "$stale_result" | jq -r '.deletedSessions // 0' 2>/dev/null || echo "0")
    deleted_interactions=$(echo "$stale_result" | jq -r '.deletedInteractions // 0' 2>/dev/null || echo "0")
    if [ "$deleted_sessions" -gt 0 ] || [ "$deleted_interactions" -gt 0 ]; then
        echo "[mneme] Grace cleanup removed ${deleted_sessions} sessions and ${deleted_interactions} interactions" >&2
    fi
fi

# Update master session workPeriods.endedAt (if linked)
session_link_file="${session_links_dir}/${session_short_id}.json"
if [ -f "$session_link_file" ]; then
    master_session_id=$(jq -r '.masterSessionId // empty' "$session_link_file" 2>/dev/null || echo "")
    if [ -n "$master_session_id" ]; then
        master_session_path=$(find "$sessions_dir" -name "${master_session_id}.json" -type f 2>/dev/null | head -1)
        if [ -n "$master_session_path" ] && [ -f "$master_session_path" ]; then
            end_now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
            claude_session_id="${session_id}"
            # Update the workPeriod entry with matching claudeSessionId
            jq --arg claudeSessionId "$claude_session_id" \
               --arg endedAt "$end_now" '
                .workPeriods = [.workPeriods[]? |
                    if .claudeSessionId == $claudeSessionId and .endedAt == null
                    then .endedAt = $endedAt
                    else .
                    end
                ] |
                .updatedAt = $endedAt
            ' "$master_session_path" > "${master_session_path}.tmp" \
                && mv "${master_session_path}.tmp" "$master_session_path"
        fi
    fi
fi

exit 0
