#!/usr/bin/env bash
#
# session-start.sh - SessionStart hook for memoria plugin
#
# Purpose: Initialize session JSON and inject context via additionalContext
#
# Input (stdin): JSON with session_id, cwd, trigger (startup|resume|clear|compact)
# Output (stdout): JSON with hookSpecificOutput.additionalContext
# Exit codes: 0 = success (continue session)
#
# Dependencies: jq
#

set -euo pipefail

# Read input from stdin
input_json=$(cat)

# Check for jq (required dependency)
if ! command -v jq &> /dev/null; then
    echo "[memoria] Warning: jq not found. Install with: brew install jq" >&2
    echo "[memoria] Session tracking disabled for this session." >&2
    exit 0  # Non-blocking - allow session to continue without memoria
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

# Check if memoria is initialized
if [ ! -d "$memoria_dir" ]; then
    echo "[memoria] Not initialized in this project. Run: npx @hir4ta/memoria --init" >&2
    exit 0
fi

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

# Get project name from directory
project_name=$(basename "$cwd")

# Get repository name from git remote origin
repository=""
if git -C "$cwd" rev-parse --git-dir &> /dev/null 2>&1; then
    git_remote_url=$(git -C "$cwd" remote get-url origin 2>/dev/null || echo "")
    if [ -n "$git_remote_url" ]; then
        # Extract user/repo from SSH or HTTPS URL
        # git@github.com:user/repo.git → user/repo
        # https://github.com/user/repo.git → user/repo
        # Extract user/repo from SSH or HTTPS URL (BSD sed compatible)
        repository=$(echo "$git_remote_url" | sed -E 's|.*[:/]([^/]+/[^/]+)(\.git)?$|\1|' | sed 's/\.git$//')
    fi
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
# Find recent sessions for auto-suggestion (latest 3)
# ============================================
recent_sessions_info=""
if [ -d "$sessions_dir" ] && [ "$is_resumed" = false ]; then
    # Get all sessions sorted by createdAt descending, excluding current
    recent_sessions=$(find "$sessions_dir" -name "*.json" -type f 2>/dev/null | while read -r f; do
        if [ -f "$f" ]; then
            session_data=$(jq -r '[.id, .createdAt, .title // "", .context.branch // ""] | @tsv' "$f" 2>/dev/null || echo "")
            if [ -n "$session_data" ]; then
                echo "$session_data"
            fi
        fi
    done | sort -t$'\t' -k2 -r | head -4)  # Get 4 to filter out current

    # Build recent sessions list (excluding current session)
    count=0
    while IFS=$'\t' read -r sid screated stitle sbranch; do
        if [ -n "$sid" ] && [ "$sid" != "$file_id" ] && [ $count -lt 3 ]; then
            count=$((count + 1))
            # Format: [id] title (date, branch)
            date_part_session=$(echo "$screated" | cut -d'T' -f1 2>/dev/null || echo "")
            title_display="${stitle:-no title}"
            branch_display="${sbranch:-no branch}"
            recent_sessions_info="${recent_sessions_info}  ${count}. [${sid}] ${title_display} (${date_part_session}, ${branch_display})\n"
        fi
    done <<< "$recent_sessions"
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
    # New session: create initial JSON (log-focused schema)
    # Note: summary, discussions, errors, handoff are set by /memoria:save
    session_json=$(jq -n \
        --arg id "$file_id" \
        --arg sessionId "${session_id:-$session_short_id}" \
        --arg createdAt "$now" \
        --arg branch "$current_branch" \
        --arg projectDir "$cwd" \
        --arg projectName "$project_name" \
        --arg repository "$repository" \
        --arg userName "$git_user_name" \
        --arg userEmail "$git_user_email" \
        '{
            id: $id,
            sessionId: $sessionId,
            createdAt: $createdAt,
            title: "",
            tags: [],
            context: {
                branch: (if $branch == "" then null else $branch end),
                projectDir: $projectDir,
                projectName: $projectName,
                repository: (if $repository == "" then null else $repository end),
                user: {
                    name: $userName,
                    email: (if $userEmail == "" then null else $userEmail end)
                } | with_entries(select(.value != null))
            } | with_entries(select(.value != null)),
            metrics: {
                userMessages: 0,
                assistantResponses: 0,
                thinkingBlocks: 0,
                toolUsage: []
            },
            files: [],
            status: null
        }')

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
needs_summary=false
if [ "$is_resumed" = true ]; then
    resume_note=" (Resumed)"
    # Check if title is empty
    session_title=$(jq -r '.title // ""' "$session_path" 2>/dev/null || echo "")
    if [ -z "$session_title" ]; then
        needs_summary=true
    fi
fi

# Build the session info (no auto-save instruction)
session_info="**Session:** ${file_id}${resume_note}
**Path:** ${session_relative_path}

Sessions are saved:
- **Automatically** before Auto-Compact (context 95% full)
- **Manually** via \`/memoria:save\` or asking \"save the session\""

# Add recent sessions suggestion for new sessions
if [ "$is_resumed" = false ] && [ -n "$recent_sessions_info" ]; then
    session_info="${session_info}

---
**Recent sessions:**
$(echo -e "$recent_sessions_info")
Continue from a previous session? Use \`/memoria:resume <id>\` or \`/memoria:resume\` to see more."
fi

# Add summary creation prompt if needed (for resumed sessions)
if [ "$needs_summary" = true ]; then
    session_info="${session_info}

---
**Note:** This session was resumed but has no summary yet.
When you have enough context, consider creating a summary with \`/memoria:save\` to capture:
- What was accomplished in the previous session
- Key decisions made
- Any ongoing work or next steps"
fi

session_info_escaped=$(escape_for_json "$session_info")

# Output context injection as JSON (superpowers style)
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${session_info_escaped}\n\n${using_memoria_escaped}"
  }
}
EOF

exit 0
