#!/usr/bin/env bash
#
# pre-compact.sh - Backup interactions before Auto-Compact
#
# Saves current interactions to global SQLite (~/.claude/memoria/global.db)
# pre_compact_backups table before context is compressed.
# Does NOT create summary - summary creation is manual via /memoria:save.
#
# Input (stdin): JSON with session_id, transcript_path, cwd, trigger
# Output (stdout): JSON with {"continue": true}
# Exit codes: 0 = success (non-blocking, always continues)
#
# Dependencies: jq, sqlite3

set -euo pipefail

# Read stdin
input_json=$(cat)

# Extract fields
session_id=$(echo "$input_json" | jq -r '.session_id // empty')
transcript_path=$(echo "$input_json" | jq -r '.transcript_path // empty')
cwd=$(echo "$input_json" | jq -r '.cwd // empty')

# If no cwd, use PWD
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi

# Find session file
if [ -z "$session_id" ]; then
    echo '{"continue": true}'
    exit 0
fi

session_short_id="${session_id:0:8}"
memoria_dir="${cwd}/.memoria"
sessions_dir="${memoria_dir}/sessions"

# Global database path
global_db_dir="${MEMORIA_DATA_DIR:-$HOME/.claude/memoria}"
db_path="${global_db_dir}/global.db"

session_file=$(find "$sessions_dir" -name "${session_short_id}.json" -type f 2>/dev/null | head -1)

if [ -z "$session_file" ] || [ ! -f "$session_file" ]; then
    echo '{"continue": true}'
    exit 0
fi

# Get git user for owner field
owner=$(git -C "$cwd" config user.name 2>/dev/null || whoami || echo "unknown")

# Escape project path for SQL
project_path_escaped="${cwd//\'/\'\'}"

# Determine plugin root directory for schema
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
schema_path="${PLUGIN_ROOT}/lib/schema.sql"

# Initialize global SQLite database if not exists
init_database() {
    if [ ! -d "$global_db_dir" ]; then
        mkdir -p "$global_db_dir"
    fi
    if [ ! -f "$db_path" ]; then
        if [ -f "$schema_path" ]; then
            sqlite3 "$db_path" < "$schema_path"
            echo "[memoria] Global SQLite database initialized: ${db_path}" >&2
        else
            # Minimal schema if schema.sql not found
            sqlite3 "$db_path" <<'SQLEOF'
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    repository TEXT,
    repository_url TEXT,
    repository_root TEXT,
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
CREATE INDEX IF NOT EXISTS idx_interactions_project ON interactions(project_path);

CREATE TABLE IF NOT EXISTS pre_compact_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    owner TEXT NOT NULL,
    interactions TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_backups_session ON pre_compact_backups(session_id);
CREATE INDEX IF NOT EXISTS idx_backups_project ON pre_compact_backups(project_path);
SQLEOF
        fi
    fi
    # Configure pragmas
    sqlite3 "$db_path" "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;" 2>/dev/null || true
}

echo "[memoria] PreCompact: Backing up interactions before Auto-Compact..." >&2

# Extract current interactions from transcript (same logic as session-end.sh)
if [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
    # Initialize database
    init_database

    interactions_json=$(cat "$transcript_path" | jq -s '
        # User messages (text only, exclude tool results)
        [.[] | select(.type == "user" and .message.role == "user" and (.message.content | type) == "string") | {
            timestamp: .timestamp,
            content: .message.content
        }] as $user_messages |

        # All assistant messages with thinking or text
        [.[] | select(.type == "assistant") | . as $msg |
            ($msg.message.content // []) |
            {
                timestamp: $msg.timestamp,
                thinking: ([.[] | select(.type == "thinking") | .thinking] | join("\n")),
                text: ([.[] | select(.type == "text") | .text] | join("\n"))
            } | select(.thinking != "" or .text != "")
        ] as $all_assistant |

        # Build interactions by grouping all assistant responses between user messages
        [range(0; $user_messages | length) | . as $i |
            $user_messages[$i] as $user |
            # Get next user message timestamp (or far future if last)
            (if $i + 1 < ($user_messages | length) then $user_messages[$i + 1].timestamp else "9999-12-31T23:59:59Z" end) as $next_user_ts |
            # Collect all assistant responses between this user message and next
            [$all_assistant[] | select(.timestamp > $user.timestamp and .timestamp < $next_user_ts)] as $turn_responses |
            if ($turn_responses | length) > 0 then {
                id: ("int-" + (($i + 1) | tostring | if length < 3 then "00"[0:(3-length)] + . else . end)),
                timestamp: $user.timestamp,
                user: $user.content,
                thinking: ([$turn_responses[].thinking | select(. != "")] | join("\n")),
                assistant: ([$turn_responses[].text | select(. != "")] | join("\n"))
            } else empty end
        ]
    ' 2>/dev/null || echo '[]')

    interaction_count=$(echo "$interactions_json" | jq 'length')

    if [ "$interaction_count" -gt 0 ]; then
        # Escape single quotes for SQL
        interactions_escaped="${interactions_json//\'/\'\'}"

        # Insert backup into global SQLite with project_path
        sqlite3 "$db_path" "INSERT INTO pre_compact_backups (session_id, project_path, owner, interactions) VALUES ('${session_short_id}', '${project_path_escaped}', '${owner}', '${interactions_escaped}');" 2>/dev/null || true

        echo "[memoria] PreCompact: Backed up ${interaction_count} interactions to global DB" >&2
    else
        echo "[memoria] PreCompact: No interactions to backup" >&2
    fi
fi

# Continue with compaction (non-blocking)
echo '{"continue": true}'
