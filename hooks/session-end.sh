#!/usr/bin/env bash
#
# session-end.sh - SessionEnd hook for memoria plugin
#
# Auto-save session by extracting interactions from transcript using jq.
# Interactions are stored in SQLite (local.db) for privacy.
# JSON file contains only metadata (no interactions).
#
# IMPORTANT: This script merges pre_compact_backups from SQLite with
# newly extracted interactions to preserve conversations from before auto-compact.
#
# Input (stdin): JSON with session_id, transcript_path, cwd
# Output (stderr): Log messages
# Exit codes: 0 = success (SessionEnd cannot be blocked)
#
# Dependencies: jq, sqlite3

set -euo pipefail

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
memoria_dir="${cwd}/.memoria"
sessions_dir="${memoria_dir}/sessions"
session_links_dir="${memoria_dir}/session-links"
db_path="${memoria_dir}/local.db"

# Find session file
session_short_id="${session_id:0:8}"
session_file=""

if [ -d "$sessions_dir" ]; then
    session_file=$(find "$sessions_dir" -type f -name "${session_short_id}.json" 2>/dev/null | head -1)
fi

if [ -z "$session_file" ] || [ ! -f "$session_file" ]; then
    exit 0
fi

# Get git user for owner field
owner=$(git -C "$cwd" config user.name 2>/dev/null || whoami || echo "unknown")

# Determine plugin root directory for schema
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
schema_path="${PLUGIN_ROOT}/lib/schema.sql"

# Initialize SQLite database if not exists
init_database() {
    if [ ! -f "$db_path" ]; then
        if [ -f "$schema_path" ]; then
            sqlite3 "$db_path" < "$schema_path"
            echo "[memoria] SQLite database initialized: ${db_path}" >&2
        else
            # Minimal schema if schema.sql not found
            sqlite3 "$db_path" <<'SQLEOF'
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    thinking TEXT,
    tool_calls TEXT,
    timestamp TEXT NOT NULL,
    is_compact_summary INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_owner ON interactions(owner);

CREATE TABLE IF NOT EXISTS pre_compact_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    interactions TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_backups_session ON pre_compact_backups(session_id);
SQLEOF
        fi
    fi
}

# Extract interactions from transcript if available
if [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
    # Initialize database
    init_database

    # Extract interactions using jq
    interactions_json=$(cat "$transcript_path" | jq -s '
        # User messages (text only, exclude tool results and local command outputs)
        # Include isCompactSummary flag for auto-compact summaries
        [.[] | select(
            .type == "user" and
            .message.role == "user" and
            (.message.content | type) == "string" and
            (.message.content | startswith("<local-command-stdout>") | not) and
            (.message.content | startswith("<local-command-caveat>") | not)
        ) | {
            timestamp: .timestamp,
            content: .message.content,
            isCompactSummary: (.isCompactSummary // false)
        }] as $user_messages |

        # Get user message timestamps for grouping
        ($user_messages | map(.timestamp)) as $user_timestamps |

        # All assistant messages with thinking or text
        [.[] | select(.type == "assistant") | . as $msg |
            ($msg.message.content // []) |
            {
                timestamp: $msg.timestamp,
                thinking: ([.[] | select(.type == "thinking") | .thinking] | join("\n")),
                text: ([.[] | select(.type == "text") | .text] | join("\n"))
            } | select(.thinking != "" or .text != "")
        ] as $all_assistant |

        # Tool usage summary
        [.[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use") | .name] |
        group_by(.) | map({name: .[0], count: length}) | sort_by(-.count) as $tool_usage |

        # Build interactions by grouping all assistant responses between user messages
        [range(0; $user_messages | length) | . as $i |
            $user_messages[$i] as $user |
            # Get next user message timestamp (or far future if last)
            (if $i + 1 < ($user_messages | length) then $user_messages[$i + 1].timestamp else "9999-12-31T23:59:59Z" end) as $next_user_ts |
            # Collect all assistant responses between this user message and next
            [$all_assistant[] | select(.timestamp > $user.timestamp and .timestamp < $next_user_ts)] as $turn_responses |
            if ($turn_responses | length) > 0 then (
                {
                    id: ("int-" + (($i + 1) | tostring | if length < 3 then "00"[0:(3-length)] + . else . end)),
                    timestamp: $user.timestamp,
                    user: $user.content,
                    thinking: ([$turn_responses[].thinking | select(. != "")] | join("\n")),
                    assistant: ([$turn_responses[].text | select(. != "")] | join("\n"))
                } + (if $user.isCompactSummary then {isCompactSummary: true} else {} end)
            ) else empty end
        ] as $interactions |

        # File changes from tool usage
        [.[] | select(.type == "assistant") | .message.content[]? |
            select(.type == "tool_use" and (.name == "Edit" or .name == "Write")) |
            {
                path: .input.file_path,
                action: (if .name == "Write" then "create" else "edit" end)
            }
        ] | unique_by(.path) as $files |

        {
            interactions: $interactions,
            toolUsage: $tool_usage,
            files: $files,
            metrics: {
                userMessages: ($user_messages | length),
                assistantResponses: ($all_assistant | length),
                thinkingBlocks: ([$all_assistant[].thinking | select(. != "")] | length)
            }
        }
    ' 2>/dev/null || echo '{"interactions":[],"toolUsage":[],"files":[],"metrics":{}}')

    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Get latest backup from SQLite (if any)
    backup_json=$(sqlite3 "$db_path" "SELECT interactions FROM pre_compact_backups WHERE session_id = '${session_short_id}' ORDER BY created_at DESC LIMIT 1;" 2>/dev/null || echo "[]")
    if [ -z "$backup_json" ] || [ "$backup_json" = "" ]; then
        backup_json="[]"
    fi

    # Also check existing interactions in SQLite
    existing_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM interactions WHERE session_id = '${session_short_id}';" 2>/dev/null || echo "0")

    # Merge backup with extracted interactions
    merged_json=$(echo "$interactions_json" | jq --argjson backup "$backup_json" '
        # Merge preCompactBackups with extracted interactions
        ($backup | if type == "array" then . else [] end) as $backup_arr |
        (.interactions // []) as $new_arr |

        # Get the last timestamp from backup (or epoch if empty)
        ($backup_arr | if length > 0 then .[-1].timestamp else "1970-01-01T00:00:00Z" end) as $last_backup_ts |

        # Filter new interactions that are after backup
        [$new_arr[] | select(.timestamp > $last_backup_ts)] as $truly_new |

        # Merge: backup + truly new interactions
        ($backup_arr + $truly_new) as $merged |

        # Re-number IDs sequentially
        [$merged | to_entries[] | .value + {id: ("int-" + ((.key + 1) | tostring | if length < 3 then "00"[0:(3-length)] + . else . end))}]
    ')

    # Count merged interactions
    merged_count=$(echo "$merged_json" | jq 'length')
    backup_count=$(echo "$backup_json" | jq 'if type == "array" then length else 0 end')

    # Clear existing interactions for this session (will be replaced)
    sqlite3 "$db_path" "DELETE FROM interactions WHERE session_id = '${session_short_id}';" 2>/dev/null || true

    # Insert merged interactions into SQLite
    if [ "$merged_count" -gt 0 ]; then
        echo "$merged_json" | jq -c '.[]' | while read -r interaction; do
            timestamp=$(echo "$interaction" | jq -r '.timestamp // ""')
            user_content=$(echo "$interaction" | jq -r '.user // ""')
            thinking=$(echo "$interaction" | jq -r '.thinking // ""')
            assistant_content=$(echo "$interaction" | jq -r '.assistant // ""')
            is_compact=$(echo "$interaction" | jq -r 'if .isCompactSummary then 1 else 0 end')

            # Escape single quotes for SQL
            user_content_escaped="${user_content//\'/\'\'}"
            thinking_escaped="${thinking//\'/\'\'}"
            assistant_escaped="${assistant_content//\'/\'\'}"

            # Insert user message
            sqlite3 "$db_path" "INSERT INTO interactions (session_id, owner, role, content, thinking, timestamp, is_compact_summary) VALUES ('${session_short_id}', '${owner}', 'user', '${user_content_escaped}', NULL, '${timestamp}', ${is_compact});" 2>/dev/null || true

            # Insert assistant response
            if [ -n "$assistant_content" ]; then
                sqlite3 "$db_path" "INSERT INTO interactions (session_id, owner, role, content, thinking, timestamp, is_compact_summary) VALUES ('${session_short_id}', '${owner}', 'assistant', '${assistant_escaped}', '${thinking_escaped}', '${timestamp}', 0);" 2>/dev/null || true
            fi
        done
    fi

    # Clear pre_compact_backups for this session (merged into interactions)
    sqlite3 "$db_path" "DELETE FROM pre_compact_backups WHERE session_id = '${session_short_id}';" 2>/dev/null || true

    # Update JSON file (without interactions and preCompactBackups)
    jq --argjson extracted "$interactions_json" \
       --arg status "complete" \
       --arg endedAt "$now" \
       --arg updatedAt "$now" \
       --argjson interactionCount "$merged_count" '
        # Update files
        .files = ((.files // []) + ($extracted.files // []) | unique_by(.path)) |
        # Update metrics
        .metrics = (.metrics // {}) + {
            userMessages: $interactionCount,
            assistantResponses: $interactionCount,
            thinkingBlocks: ($extracted.metrics.thinkingBlocks // 0),
            toolUsage: ($extracted.toolUsage // [])
        } |
        # Remove interactions and preCompactBackups (now in SQLite)
        del(.interactions) |
        del(.preCompactBackups) |
        # Set status and timestamps
        .status = $status |
        .endedAt = $endedAt |
        .updatedAt = $updatedAt
    ' "$session_file" > "${session_file}.tmp" && mv "${session_file}.tmp" "$session_file"

    echo "[memoria] Session auto-saved with ${merged_count} interactions in SQLite (${backup_count} from backup): ${session_file}" >&2
else
    # No transcript, just update status
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    jq --arg status "complete" --arg endedAt "$now" --arg updatedAt "$now" '
        .status = $status | .endedAt = $endedAt | .updatedAt = $updatedAt |
        del(.interactions) | del(.preCompactBackups)
    ' "$session_file" > "${session_file}.tmp" && mv "${session_file}.tmp" "$session_file"

    echo "[memoria] Session completed (no transcript): ${session_file}" >&2
fi

# ============================================
# Update master session workPeriods.endedAt (if linked)
# ============================================
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
            echo "[memoria] Master session workPeriods.endedAt updated: ${master_session_path}" >&2
        fi
    fi
fi

exit 0
