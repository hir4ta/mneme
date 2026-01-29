#!/usr/bin/env bash
# UserPromptSubmit hook for memoria plugin
# Searches memoria for relevant context based on user prompt

set -euo pipefail

# Read input from stdin
input_json=$(cat)

# Check for jq
if ! command -v jq &> /dev/null; then
    exit 0
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

# Define memoria directory
memoria_dir="${cwd}/.memoria"

# Exit if no .memoria directory
if [ ! -d "$memoria_dir" ]; then
    exit 0
fi

# Skip if prompt starts with /memoria (user is explicitly using memoria)
if [[ "$prompt" == /memoria* ]]; then
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
tags_path="${memoria_dir}/tags.json"
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

# Search function - simple grep-based search
search_memoria() {
    local pattern="$1"
    local results=""

    # Search sessions (limit to recent 10 files)
    if [ -d "${memoria_dir}/sessions" ]; then
        local session_matches=$(find "${memoria_dir}/sessions" -name "*.json" -type f 2>/dev/null | \
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
    if [ -d "${memoria_dir}/decisions" ]; then
        local decision_matches=$(find "${memoria_dir}/decisions" -name "*.json" -type f 2>/dev/null | \
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
    if [ -d "${memoria_dir}/patterns" ]; then
        for file in "${memoria_dir}/patterns"/*.json; do
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

    echo -e "$results"
}

# Perform search
search_results=$(search_memoria "$keywords")

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
context_message="<memoria-context>
Related memories found:
$(echo -e "$search_results")
Use /memoria:search for more details.
</memoria-context>"

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
