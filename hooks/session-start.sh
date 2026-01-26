#!/usr/bin/env bash
# SessionStart hook for memoria plugin
# Initializes session JSON, creates .current-session, and injects context

set -euo pipefail

# Determine plugin root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Read using-memoria skill content
using_memoria_content=$(cat "${PLUGIN_ROOT}/skills/using-memoria/skill.md" 2>/dev/null || echo "")

# Read input from stdin
input_json=$(cat)

# Extract fields from input (requires jq)
if ! command -v jq &> /dev/null; then
    echo '{"error": "jq is required. Install with: brew install jq"}' >&2
    exit 0
fi

cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")
session_id=$(echo "$input_json" | jq -r '.session_id // empty' 2>/dev/null || echo "")

# If no cwd, use PWD
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi

# Resolve cwd to absolute path
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")

# Find .memoria directory
memoria_dir="${cwd}/.memoria"
sessions_dir="${memoria_dir}/sessions"
rules_dir="${memoria_dir}/rules"

# Ensure directories exist
mkdir -p "$sessions_dir"
mkdir -p "$rules_dir"

# Current timestamp and date parts
now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
date_part=$(echo "$now" | cut -d'T' -f1)
year_part=$(echo "$date_part" | cut -d'-' -f1)
month_part=$(echo "$date_part" | cut -d'-' -f2)

# Generate session ID: YYYY-MM-DD_short-uuid
if [ -n "$session_id" ]; then
    session_short_id="${session_id:0:8}"
else
    session_short_id=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' | cut -c1-8 || date +%s | md5sum | cut -c1-8)
fi
file_id="${date_part}_${session_short_id}"

# Create sessions directory (year/month)
session_year_month_dir="${sessions_dir}/${year_part}/${month_part}"
mkdir -p "$session_year_month_dir"

# Get git info
current_branch=""
git_user_name="unknown"
git_user_email=""

if git -C "$cwd" rev-parse --git-dir &> /dev/null 2>&1; then
    current_branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    git_user_name=$(git -C "$cwd" config user.name 2>/dev/null || echo "unknown")
    git_user_email=$(git -C "$cwd" config user.email 2>/dev/null || echo "")
fi

# ============================================
# Initialize session JSON
# ============================================
session_path="${session_year_month_dir}/${file_id}.json"

session_json=$(jq -n \
    --arg id "$file_id" \
    --arg sessionId "${session_id:-$session_short_id}" \
    --arg createdAt "$now" \
    --arg branch "$current_branch" \
    --arg projectDir "$cwd" \
    --arg userName "$git_user_name" \
    --arg userEmail "$git_user_email" \
    '{
        id: $id,
        sessionId: $sessionId,
        createdAt: $createdAt,
        context: {
            branch: (if $branch == "" then null else $branch end),
            projectDir: $projectDir,
            user: {
                name: $userName,
                email: (if $userEmail == "" then null else $userEmail end)
            } | with_entries(select(.value != null))
        } | with_entries(select(.value != null)),
        title: "",
        goal: "",
        tags: [],
        interactions: []
    }')

echo "$session_json" > "$session_path"
echo "[memoria] Session initialized: ${session_path}" >&2

# ============================================
# Create .current-session file
# ============================================
current_session_path="${memoria_dir}/.current-session"
current_session_relative_path=".memoria/sessions/${year_part}/${month_part}/${file_id}.json"

jq -n \
    --arg id "$file_id" \
    --arg path "$current_session_relative_path" \
    '{
        id: $id,
        path: $path
    }' > "$current_session_path"

echo "[memoria] Current session file created: ${current_session_path}" >&2

# ============================================
# Initialize tags.json if not exists
# ============================================
tags_path="${memoria_dir}/tags.json"
default_tags_path="${SCRIPT_DIR}/default-tags.json"

if [ ! -f "$tags_path" ]; then
    if [ -f "$default_tags_path" ]; then
        cp "$default_tags_path" "$tags_path"
        echo "[memoria] Tags master file created from default: ${tags_path}" >&2
    else
        echo "[memoria] Warning: default-tags.json not found at ${default_tags_path}" >&2
    fi
fi

# ============================================
# Ensure rules templates exist
# ============================================
rules_timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

init_rules_file() {
    local path="$1"
    if [ ! -f "$path" ]; then
        cat <<EOF > "$path"
{
  "schemaVersion": 1,
  "createdAt": "${rules_timestamp}",
  "updatedAt": "${rules_timestamp}",
  "items": []
}
EOF
    fi
}

init_rules_file "${rules_dir}/review-guidelines.json"
init_rules_file "${rules_dir}/dev-rules.json"

# ============================================
# Find related sessions
# ============================================
related_sessions=""
if [ -d "$sessions_dir" ]; then
    session_files=$(find "$sessions_dir" -mindepth 3 -maxdepth 3 -name "*.json" -type f 2>/dev/null | head -5)

    if [ -n "$session_files" ]; then
        for file in $session_files; do
            if [ -f "$file" ]; then
                session_info=$(jq -r '"\(.id): \(.title // "no title") [branch: \(.context.branch // "unknown")]"' "$file" 2>/dev/null || echo "")
                if [ -n "$session_info" ]; then
                    related_sessions="${related_sessions}  - ${session_info}\n"
                fi
            fi
        done
    fi
fi

# ============================================
# Build context message
# ============================================
context_parts=""
if [ -n "$related_sessions" ]; then
    context_parts="[memoria] Related sessions found:\n\n${related_sessions}\nUse \`/memoria:resume <id>\` to resume a previous session."
fi

# Escape for JSON
escape_for_json() {
    local input="$1"
    local output=""
    local i char
    for (( i=0; i<${#input}; i++ )); do
        char="${input:$i:1}"
        case "$char" in
            $'\\') output+='\\\\';;
            '"') output+='\\"';;
            $'\n') output+='\\n';;
            $'\r') output+='\\r';;
            $'\t') output+='\\t';;
            *) output+="$char";;
        esac
    done
    printf '%s' "$output"
}

using_memoria_escaped=$(escape_for_json "$using_memoria_content")
context_escaped=$(escape_for_json "$context_parts")

# ============================================
# Build update rules for Claude Code LLM
# ============================================
update_rules="## memoria Real-time Update Rules

**This session's JSON file:**
- ID: ${file_id}
- Path: ${current_session_relative_path}

**Update Timing:** Update with Write tool when meaningful changes occur.

| Trigger | Update |
|---------|--------|
| Session purpose becomes clear | Update title, goal |
| User instruction handled | Add to interactions |
| Technical decision made | proposals, choice, reasoning in interaction |
| Error encountered/resolved | problem, choice, reasoning in interaction |
| File modified | actions, filesModified in interaction |
| URL referenced | webLinks in interaction |
| New keyword appears | tags (reference tags.json) |

**How to add interaction:**
\`\`\`json
{
  \"id\": \"int-XXX\",
  \"topic\": \"Topic of this interaction (search keyword)\",
  \"timestamp\": \"ISO8601 format\",
  \"request\": \"User instruction (null for error resolution)\",
  \"problem\": \"Error content (only for error resolution)\",
  \"thinking\": \"Thought process (important info lost in Auto-Compact)\",
  \"webLinks\": [\"Referenced URLs\"],
  \"proposals\": [{\"option\": \"Option\", \"description\": \"Description\"}],
  \"choice\": \"Final selection\",
  \"reasoning\": \"Why this choice\",
  \"actions\": [{\"type\": \"create|edit|delete\", \"path\": \"path\", \"summary\": \"summary\"}],
  \"filesModified\": [\"Modified files\"]
}
\`\`\`

**Tag selection:**
1. Read .memoria/tags.json
2. Find matching tag from aliases
3. Use id if found (e.g., \"フロント\" -> \"frontend\")
4. Add new tag to tags.json if not found
5. **Limit: 5-10 tags max, ordered by relevance (most relevant first)**

**Notes:**
- interaction id is sequential (int-001, int-002, ...)
- Record important info in thinking that would be lost in Auto-Compact
- Update title, goal when a new major theme emerges"

update_rules_escaped=$(escape_for_json "$update_rules")

# Output context injection as JSON
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<memoria-plugin>\nYou have memoria installed - a long-term memory plugin for Claude Code.\n\n**Your memoria skills are available:**\n- /memoria:resume - Resume a previous session\n- /memoria:save - Manually save current session\n- /memoria:decision - Record a design decision\n- /memoria:search - Search saved knowledge\n\nDashboard: npx @hir4ta/memoria --dashboard\n\n${context_escaped}\n\n${update_rules_escaped}\n\n**Full using-memoria skill:**\n${using_memoria_escaped}\n</memoria-plugin>"
  }
}
EOF

exit 0
