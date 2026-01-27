#!/usr/bin/env bash
# SessionStart hook for memoria plugin
# Initializes session JSON and injects minimal context via additionalContext

set -euo pipefail

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

# Determine plugin root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

# Find .memoria directory
memoria_dir="${cwd}/.memoria"
sessions_dir="${memoria_dir}/sessions"
rules_dir="${memoria_dir}/rules"
patterns_dir="${memoria_dir}/patterns"

# Ensure directories exist
mkdir -p "$sessions_dir"
mkdir -p "$rules_dir"
mkdir -p "$patterns_dir"

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
# Find related sessions (same branch) for auto-linking
# ============================================
related_session_ids="[]"
if [ -d "$sessions_dir" ] && [ -n "$current_branch" ]; then
    # Find sessions on same branch (last 3, excluding current)
    related_session_ids=$(find "$sessions_dir" -mindepth 3 -maxdepth 3 -name "*.json" -type f 2>/dev/null | \
        xargs -I {} jq -r --arg branch "$current_branch" --arg current "$file_id" \
        'select(.context.branch == $branch and .id != $current) | .id' {} 2>/dev/null | \
        head -3 | jq -R -s -c 'split("\n") | map(select(length > 0))')

    # Fallback if jq pipeline fails
    if [ -z "$related_session_ids" ] || [ "$related_session_ids" = "null" ]; then
        related_session_ids="[]"
    fi
fi

# ============================================
# Initialize session JSON (only if not exists)
# ============================================
session_path="${session_year_month_dir}/${file_id}.json"

if [ -f "$session_path" ]; then
    echo "[memoria] Session resumed: ${session_path}" >&2
else
    session_json=$(jq -n \
        --arg id "$file_id" \
        --arg sessionId "${session_id:-$session_short_id}" \
        --arg createdAt "$now" \
        --arg branch "$current_branch" \
        --arg projectDir "$cwd" \
        --arg userName "$git_user_name" \
        --arg userEmail "$git_user_email" \
        --argjson relatedSessions "$related_session_ids" \
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
            sessionType: null,
            relatedSessions: (if ($relatedSessions | length) == 0 then null else $relatedSessions end),
            interactions: []
        } | with_entries(select(.value != null))')

    echo "$session_json" > "$session_path"
    echo "[memoria] Session initialized: ${session_path}" >&2
fi

# Session path for additionalContext
current_session_relative_path=".memoria/sessions/${year_part}/${month_part}/${file_id}.json"

# ============================================
# Initialize tags.json if not exists
# ============================================
tags_path="${memoria_dir}/tags.json"
default_tags_path="${SCRIPT_DIR}/default-tags.json"

if [ ! -f "$tags_path" ]; then
    if [ -f "$default_tags_path" ]; then
        cp "$default_tags_path" "$tags_path"
        echo "[memoria] Tags master file created: ${tags_path}" >&2
    fi
fi

# ============================================
# Ensure rules templates exist
# ============================================
rules_timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

init_rules_file() {
    local path="$1"
    if [ ! -f "$path" ]; then
        cat <<RULEEOF > "$path"
{
  "schemaVersion": 1,
  "createdAt": "${rules_timestamp}",
  "updatedAt": "${rules_timestamp}",
  "items": []
}
RULEEOF
    fi
}

init_rules_file "${rules_dir}/review-guidelines.json"
init_rules_file "${rules_dir}/dev-rules.json"

# ============================================
# Find related sessions (same branch, recent)
# ============================================
related_sessions=""
if [ -d "$sessions_dir" ] && [ -n "$current_branch" ]; then
    # Find sessions on same branch (last 5)
    session_files=$(find "$sessions_dir" -mindepth 3 -maxdepth 3 -name "*.json" -type f 2>/dev/null | head -10)

    for file in $session_files; do
        if [ -f "$file" ]; then
            branch_match=$(jq -r --arg branch "$current_branch" 'select(.context.branch == $branch) | "\(.id): \(.title // "no title")"' "$file" 2>/dev/null || echo "")
            if [ -n "$branch_match" ]; then
                related_sessions="${related_sessions}  - ${branch_match}\\n"
            fi
        fi
    done
fi

# ============================================
# Output minimal context injection
# ============================================
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<memoria>\\n**Session:** ${file_id}\\n**Path:** ${current_session_relative_path}\\n\\n**REQUIRED:** Update session JSON with Write tool.\\n- Set sessionType: decision|implementation|research|exploration|discussion|debug|review\\n- Set title, goal, tags when purpose is clear\\n- Add interactions for decisions/changes (id, topic, timestamp, request, thinking, choice, reasoning, filesModified)\\n\\n**Commands:** /memoria:resume, /memoria:save, /memoria:search, /memoria:review\\n${related_sessions:+\\nRelated sessions (same branch):\\n${related_sessions}}</memoria>"
  }
}
EOF

exit 0
