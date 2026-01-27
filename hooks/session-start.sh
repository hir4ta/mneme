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

# Generate session ID based on session_id (not date)
if [ -n "$session_id" ]; then
    session_short_id="${session_id:0:8}"
else
    session_short_id=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' | cut -c1-8 || date +%s | md5sum | cut -c1-8)
fi

# file_id is now just the session_short_id (no date prefix)
file_id="${session_short_id}"

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
# Find existing session file or create new one
# ============================================
session_path=""
is_resumed=false

# Search for existing session file across all year/month directories
if [ -d "$sessions_dir" ]; then
    existing_file=$(find "$sessions_dir" -name "${file_id}.json" -type f 2>/dev/null | head -1)
    if [ -n "$existing_file" ] && [ -f "$existing_file" ]; then
        session_path="$existing_file"
        is_resumed=true
    fi
fi

# If no existing file, create in current year/month directory
if [ -z "$session_path" ]; then
    session_year_month_dir="${sessions_dir}/${year_part}/${month_part}"
    mkdir -p "$session_year_month_dir"
    session_path="${session_year_month_dir}/${file_id}.json"
fi

# ============================================
# Find related sessions (same branch) for auto-linking
# ============================================
related_session_ids="[]"
if [ -d "$sessions_dir" ] && [ -n "$current_branch" ]; then
    # Find sessions on same branch (last 3, excluding current)
    related_session_ids=$(find "$sessions_dir" -name "*.json" -type f 2>/dev/null | \
        xargs -I {} jq -r --arg branch "$current_branch" --arg current "$file_id" \
        'select(.context.branch == $branch and .id != $current) | .id' {} 2>/dev/null | \
        head -3 | jq -R -s -c 'split("\n") | map(select(length > 0))')

    # Fallback if jq pipeline fails
    if [ -z "$related_session_ids" ] || [ "$related_session_ids" = "null" ]; then
        related_session_ids="[]"
    fi
fi

# ============================================
# Initialize or update session JSON
# ============================================
if [ "$is_resumed" = true ]; then
    # Resume: reset status to null for re-processing at SessionEnd
    jq --arg resumedAt "$now" '.status = null | .resumedAt = $resumedAt' "$session_path" > "${session_path}.tmp" \
        && mv "${session_path}.tmp" "$session_path"
    echo "[memoria] Session resumed (status reset): ${session_path}" >&2
else
    # New session: create initial JSON with analysis-friendly structure
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
            summary: {
                title: "",
                goal: "",
                outcome: null,
                description: ""
            },
            metrics: {
                durationMinutes: 0,
                filesCreated: 0,
                filesModified: 0,
                filesDeleted: 0,
                decisionsCount: 0,
                errorsEncountered: 0,
                errorsResolved: 0
            },
            files: [],
            decisions: [],
            errors: [],
            interactions: [],
            preCompactBackups: [],
            webLinks: [],
            tags: [],
            sessionType: null,
            relatedSessions: (if ($relatedSessions | length) == 0 then null else $relatedSessions end)
        } | with_entries(select(.value != null))')

    echo "$session_json" > "$session_path"
    echo "[memoria] Session initialized: ${session_path}" >&2
fi

# Get relative path for additionalContext
# Extract year/month from session_path
session_relative_path="${session_path#$cwd/}"

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
# Find related sessions for display (only when resuming)
# ============================================
related_sessions=""
if [ "$is_resumed" = true ] && [ -d "$sessions_dir" ] && [ -n "$current_branch" ]; then
    session_files=$(find "$sessions_dir" -name "*.json" -type f 2>/dev/null | head -10)

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
# Build additionalContext (superpowers style)
# ============================================
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Read using-memoria skill content
using_memoria_content=$(cat "${PLUGIN_ROOT}/skills/using-memoria/skill.md" 2>/dev/null || echo "")

# Escape for JSON using pure bash (superpowers style)
escape_for_json() {
    local input="$1"
    local output=""
    local i char
    for (( i=0; i<${#input}; i++ )); do
        char="${input:$i:1}"
        case "$char" in
            $'\\') output+='\\' ;;
            '"') output+='\"' ;;
            $'\n') output+='\n' ;;
            $'\r') output+='\r' ;;
            $'\t') output+='\t' ;;
            *) output+="$char" ;;
        esac
    done
    printf '%s' "$output"
}

using_memoria_escaped=$(escape_for_json "$using_memoria_content")

resume_note=""
if [ "$is_resumed" = true ]; then
    resume_note=" (Resumed)"
fi

# Build the auto-save instruction
auto_save_instruction="<EXTREMELY_IMPORTANT>
You MUST update the session file at the END of EVERY response.

This is not optional. This is not negotiable. You cannot skip this.

**Session:** ${file_id}${resume_note}
**Path:** ${session_relative_path}

## What to do after EVERY response

1. Read the current session file
2. Add to 'interactions' array:
   - id: \"int-NNN\" (increment)
   - timestamp: ISO8601
   - topic: searchable summary
   - request: user's question
   - thinking: your key insights
   - response: summary of your response
   - toolsUsed: [{name, target}]
   - filesModified: [paths]
3. Update 'summary': title, goal, outcome, description
4. Update 'metrics', 'decisions', 'errors', 'tags' as needed
5. Write the updated JSON back

Do this silently. No confirmation messages needed.
</EXTREMELY_IMPORTANT>"

auto_save_escaped=$(escape_for_json "$auto_save_instruction")

# Output context injection as JSON (superpowers style)
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${auto_save_escaped}\n\n${using_memoria_escaped}"
  }
}
EOF

exit 0
