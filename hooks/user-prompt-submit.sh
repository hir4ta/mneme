#!/usr/bin/env bash
#
# user-prompt-submit.sh - UserPromptSubmit hook for mneme plugin
#
# Purpose: Search mneme for relevant context and inject as additionalContext
#
# Input (stdin): JSON with prompt, cwd
# Output (stdout): JSON with hookSpecificOutput.additionalContext (if matches found)
# Exit codes: 0 = success (continue with optional context)
#
# Dependencies: jq
#

set -euo pipefail

# Read input from stdin
input_json=$(cat)

# Check for jq (required dependency)
if ! command -v jq &> /dev/null; then
    echo "[mneme] Warning: jq not found, memory search skipped." >&2
    exit 0  # Non-blocking - continue without memory search
fi

# Extract prompt and cwd
prompt=$(echo "$input_json" | jq -r '.prompt // empty' 2>/dev/null || echo "")
cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")

# Exit if no prompt or short prompt (less than 10 chars)
if [ -z "$prompt" ] || [ ${#prompt} -lt 10 ]; then
    exit 0
fi

# Use PWD if cwd is empty
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi

# Define mneme directory
mneme_dir="${cwd}/.mneme"

# Local database path
local_db_path="${mneme_dir}/local.db"

# Exit if no .mneme directory
if [ ! -d "$mneme_dir" ]; then
    exit 0
fi

# Skip if prompt starts with /mneme (user is explicitly using mneme)
if [[ "$prompt" == /mneme* ]]; then
    exit 0
fi

# Extract keywords from prompt (first 5 significant words, excluding common words)
# Simple extraction: take words longer than 3 chars, limit to 5
raw_keywords=$(echo "$prompt" | tr '[:upper:]' '[:lower:]' | \
    tr -cs '[:alnum:]' '\n' | \
    awk 'length > 3' | \
    grep -vE '^(this|that|with|from|have|will|would|could|should|what|when|where|which|there|their|them|they|been|being|were|does|done|make|just|only|also|into|over|such|than|then|some|these|those|very|after|before|about|through)$' | \
    head -5)

# Exit if no keywords extracted
if [ -z "$raw_keywords" ]; then
    exit 0
fi

# Expand keywords using tag aliases from tags.json (fuzzy-search style)
tags_path="${mneme_dir}/tags.json"
expanded_keywords="$raw_keywords"

if [ -f "$tags_path" ]; then
    # For each keyword, check if it matches any tag id, label, or alias
    # If matched, expand to include all related terms
    while IFS= read -r kw; do
        [ -z "$kw" ] && continue
        # Search for matching tag and get all related terms
        related_terms=$(jq -r --arg kw "$kw" '
            .tags[]? |
            select(
                (.id | ascii_downcase) == $kw or
                (.label | ascii_downcase) == $kw or
                (.aliases[]? | ascii_downcase) == $kw
            ) |
            [.id, .label] + .aliases | .[] | ascii_downcase
        ' "$tags_path" 2>/dev/null | sort -u)

        if [ -n "$related_terms" ]; then
            # Add related terms to expanded keywords
            expanded_keywords="${expanded_keywords}
${related_terms}"
        fi
    done <<< "$raw_keywords"
fi

# Remove duplicates and build grep pattern
keywords=$(echo "$expanded_keywords" | sort -u | tr '\n' '|' | sed 's/|$//')

# Exit if no keywords
if [ -z "$keywords" ]; then
    exit 0
fi

# Search local SQLite database for interactions
search_local_db() {
    local pattern="$1"
    local results=""

    # Check if sqlite3 is available and local DB exists
    if ! command -v sqlite3 &> /dev/null || [ ! -f "$local_db_path" ]; then
        echo ""
        return
    fi

    # Convert pattern to SQLite FTS5 or LIKE-compatible format
    # Replace | with OR for FTS5, escape special chars
    local fts_pattern=$(echo "$pattern" | sed 's/|/ OR /g')
    local like_pattern=$(echo "$pattern" | sed 's/|/%/g')

    # Try FTS5 first, fallback to LIKE
    local db_matches=""

    # Search interactions (project-local database)
    # Limit to 3 most recent matches
    db_matches=$(sqlite3 -separator '|' "$local_db_path" "
        SELECT DISTINCT session_id, substr(content, 1, 100) as snippet
        FROM interactions
        WHERE content LIKE '%${like_pattern}%' OR thinking LIKE '%${like_pattern}%'
        ORDER BY timestamp DESC
        LIMIT 3;
    " 2>/dev/null || echo "")

    if [ -n "$db_matches" ]; then
        while IFS='|' read -r session_id snippet; do
            [ -z "$session_id" ] && continue
            # Truncate snippet and clean up
            snippet=$(echo "$snippet" | tr '\n' ' ' | sed 's/  */ /g' | head -c 80)
            results="${results}[interaction:${session_id:0:8}] ${snippet}...\n"
        done <<< "$db_matches"
    fi

    echo -e "$results"
}

# Search function - simple grep-based search
search_mneme() {
    local pattern="$1"
    local results=""

    # Search sessions (limit to recent 10 files)
    if [ -d "${mneme_dir}/sessions" ]; then
        local session_matches=$(find "${mneme_dir}/sessions" -name "*.json" -type f 2>/dev/null | \
            xargs -I{} sh -c "grep -l -i -E '$pattern' '{}' 2>/dev/null || true" | \
            head -3)

        for file in $session_matches; do
            if [ -f "$file" ]; then
                local title=$(jq -r '.title // .summary.title // ""' "$file" 2>/dev/null | head -1)
                local id=$(jq -r '.id // ""' "$file" 2>/dev/null)
                if [ -n "$title" ] && [ -n "$id" ]; then
                    results="${results}[session:${id}] ${title}\n"
                fi
            fi
        done
    fi

    # Search decisions
    if [ -d "${mneme_dir}/decisions" ]; then
        local decision_matches=$(find "${mneme_dir}/decisions" -name "*.json" -type f 2>/dev/null | \
            xargs -I{} sh -c "grep -l -i -E '$pattern' '{}' 2>/dev/null || true" | \
            head -3)

        for file in $decision_matches; do
            if [ -f "$file" ]; then
                local title=$(jq -r '.title // ""' "$file" 2>/dev/null | head -1)
                local decision=$(jq -r '.decision // ""' "$file" 2>/dev/null | head -1)
                if [ -n "$title" ]; then
                    results="${results}[decision] ${title}: ${decision}\n"
                fi
            fi
        done
    fi

    # Search patterns
    if [ -d "${mneme_dir}/patterns" ]; then
        for file in "${mneme_dir}/patterns"/*.json; do
            if [ -f "$file" ]; then
                local pattern_matches=$(jq -r --arg p "$pattern" \
                    '.patterns[]? | select(.errorPattern | test($p; "i")) | "[pattern] \(.errorPattern | .[0:50])... → \(.solution | .[0:50])..."' \
                    "$file" 2>/dev/null | head -2)
                if [ -n "$pattern_matches" ]; then
                    results="${results}${pattern_matches}\n"
                fi
            fi
        done
    fi

    # Search local SQLite database
    local db_results=$(search_local_db "$pattern")
    if [ -n "$db_results" ]; then
        results="${results}${db_results}"
    fi

    echo -e "$results"
}

# Perform search
search_results=$(search_mneme "$keywords")

# Exit if no results
if [ -z "$search_results" ] || [ "$search_results" = "\n" ]; then
    exit 0
fi

# Escape for JSON
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

# Build context message
context_message="<mneme-context>
Related memories found:
$(echo -e "$search_results")
Use /mneme:search for more details.
</mneme-context>"

context_escaped=$(escape_for_json "$context_message")

# Output JSON with additionalContext
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "${context_escaped}"
  }
}
EOF

exit 0
