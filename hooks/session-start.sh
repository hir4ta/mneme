#!/usr/bin/env bash
# SessionStart hook for memoria plugin
# Finds related sessions and injects context

set -euo pipefail

# Determine plugin root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Read using-memoria skill content
using_memoria_content=$(cat "${PLUGIN_ROOT}/skills/using-memoria/skill.md" 2>/dev/null || echo "")

# Read input from stdin
input_json=$(cat)

# Extract cwd from input (requires jq or basic parsing)
cwd=""
if command -v jq &> /dev/null; then
    cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")
fi

# If no cwd, use PWD
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi

# Find .memoria directory
memoria_dir="${cwd}/.memoria"
sessions_dir="${memoria_dir}/sessions"

# Get current git branch
current_branch=""
if [ -d "${cwd}/.git" ] || git -C "$cwd" rev-parse --git-dir &> /dev/null 2>&1; then
    current_branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
fi

# Find related sessions
related_sessions=""
if [ -d "$sessions_dir" ]; then
    # Get up to 5 most recent session files
    session_files=$(find "$sessions_dir" -name "*.json" -type f 2>/dev/null | head -5)

    if [ -n "$session_files" ] && command -v jq &> /dev/null; then
        for file in $session_files; do
            if [ -f "$file" ]; then
                session_info=$(jq -r '"\(.id): \(.summary // "no summary") [branch: \(.context.branch // "unknown")]"' "$file" 2>/dev/null || echo "")
                if [ -n "$session_info" ]; then
                    related_sessions="${related_sessions}  - ${session_info}\n"
                fi
            fi
        done
    fi
fi

# Find draft decisions (auto-detected but not reviewed)
decisions_dir="${memoria_dir}/decisions"
draft_decisions=""
if [ -d "$decisions_dir" ] && command -v jq &> /dev/null; then
    decision_files=$(find "$decisions_dir" -name "*.json" -type f 2>/dev/null)

    for file in $decision_files; do
        if [ -f "$file" ]; then
            # Check if it's a draft (auto-detected)
            is_draft=$(jq -r 'select(.status == "draft") | .id' "$file" 2>/dev/null || echo "")
            if [ -n "$is_draft" ]; then
                decision_info=$(jq -r '"\(.id): \(.title // "no title")"' "$file" 2>/dev/null || echo "")
                if [ -n "$decision_info" ]; then
                    draft_decisions="${draft_decisions}  - ${decision_info}\n"
                fi
            fi
        fi
    done
fi

# Build context message
context_parts=""
if [ -n "$related_sessions" ]; then
    context_parts="[memoria] 関連セッションが見つかりました:\n\n${related_sessions}\n\`/memoria:resume <id>\` で過去のセッションを再開できます。"
fi

if [ -n "$draft_decisions" ]; then
    context_parts="${context_parts}\n\n[memoria] 未レビューの設計決定（自動検出）:\n\n${draft_decisions}\nダッシュボードで確認・編集できます: \`npx @hir4ta/memoria --dashboard\`"
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

# Output context injection as JSON
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<memoria-plugin>\nYou have memoria installed - a long-term memory plugin for Claude Code.\n\n**Your memoria skills are available:**\n- /memoria:resume - Resume a previous session\n- /memoria:save - Manually save current session\n- /memoria:decision - Record a design decision\n- /memoria:search - Search saved knowledge\n\nDashboard: npx @hir4ta/memoria --dashboard\n\n${context_escaped}\n\n**Full using-memoria skill:**\n${using_memoria_escaped}\n</memoria-plugin>"
  }
}
EOF

exit 0
