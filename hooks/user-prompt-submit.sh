#!/usr/bin/env bash
#
# user-prompt-submit.sh - UserPromptSubmit hook for mneme plugin
#
# Purpose: Search mneme for relevant context and approved rules,
# inject as additionalContext using shared search-core logic.
# Also injects Claude Session ID (workaround for anthropics/claude-code#16538).
#
# Input (stdin): JSON with prompt, session_id, cwd
# Output (stdout): JSON with hookSpecificOutput.additionalContext (if matches found)
#

set -euo pipefail

# Source shared helpers
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

input_json=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  echo "[mneme] Warning: jq not found, memory search skipped." >&2
  exit 0
fi

prompt=$(echo "$input_json" | jq -r ".prompt // empty" 2>/dev/null || echo "")
cwd=$(echo "$input_json" | jq -r ".cwd // empty" 2>/dev/null || echo "")
session_id=$(echo "$input_json" | jq -r ".session_id // empty" 2>/dev/null || echo "")

# Determine if search should run (session ID is always injected regardless)
run_search=true
if [ -z "$prompt" ] || [ ${#prompt} -lt 10 ]; then
  run_search=false
fi

if [[ "$prompt" == /mneme* ]]; then
  run_search=false
fi

if [ -z "$cwd" ]; then
  cwd="${PWD}"
fi
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")

if ! validate_mneme "$cwd"; then
  exit 0
fi

# --- Search (skipped for short prompts and /mneme commands) ---
context_message=""
rules_message=""

if [ "$run_search" = true ]; then
  # Cap very large prompts to avoid overly expensive search
  if [ ${#prompt} -gt 4000 ]; then
    prompt="${prompt:0:4000}"
  fi

  PLUGIN_ROOT="$(get_plugin_root)"

  search_script=$(find_script "$PLUGIN_ROOT" "prompt-search")
  if [ -n "$search_script" ]; then
    # Detect changed files for file-based session recommendation
    changed_files=""
    if command -v git >/dev/null 2>&1 && git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      changed_files=$(cd "$cwd" && {
        git diff --name-only HEAD 2>/dev/null
        git diff --name-only --cached 2>/dev/null
      } | sort -u | head -20 | paste -sd "," - 2>/dev/null || echo "")
    fi

    search_output=$(invoke_node "$search_script" \
      --query "$prompt" --project "$cwd" --limit 5 \
      ${changed_files:+--files "$changed_files"} 2>/dev/null || echo "")

    if [ -n "$search_output" ]; then
      success=$(echo "$search_output" | jq -r ".success // false" 2>/dev/null || echo "false")
      if [ "$success" = "true" ]; then
        # Format session/interaction context
        context_lines=$(echo "$search_output" | jq -r '
          .results
          | map(select(.score >= 3 and (.type == "session" or .type == "unit")))
          | .[:3]
          | map("[\(.type):\(.id)] \(.title) | match: \((.matchedFields // []) | join(","))")
          | join("\n")
        ')

        # Format file-based session recommendations
        file_rec_lines=$(echo "$search_output" | jq -r '
          .fileRecommendations // []
          | .[:3]
          | map("[session:\(.sessionId)] \(.title) | files: \(.matchedFiles | join(", "))")
          | join("\n")
        ')

        if [ -n "$context_lines" ] && [ "$context_lines" != "null" ] || \
           [ -n "$file_rec_lines" ] && [ "$file_rec_lines" != "null" ]; then
          context_parts=""
          if [ -n "$context_lines" ] && [ "$context_lines" != "null" ]; then
            context_parts="Related context found (sessions/units):
${context_lines}"
          fi
          if [ -n "$file_rec_lines" ] && [ "$file_rec_lines" != "null" ]; then
            if [ -n "$context_parts" ]; then
              context_parts="${context_parts}
"
            fi
            context_parts="${context_parts}Related sessions (editing same files):
${file_rec_lines}"
          fi
          context_message="<mneme-context>
${context_parts}
To explore deeper: use /mneme:search with specific technical terms, error messages, or file paths.
</mneme-context>"
        fi

        # Format approved rules
        rules_lines=$(echo "$search_output" | jq -r '
          .rules // []
          | map(select(.score >= 2))
          | .[:5]
          | map("[\(.sourceType):\(.id)] (\(.priority // "—")) \(.text)")
          | join("\n")
        ')

        if [ -n "$rules_lines" ] && [ "$rules_lines" != "null" ]; then
          rules_message="<mneme-rules>
Approved development rules (apply during this response):
${rules_lines}
</mneme-rules>"
        fi
      fi
    fi
  fi
fi

# --- Assemble full context ---
full_context=""

# Session ID injection (workaround for anthropics/claude-code#16538:
# Plugin SessionStart hooks don't surface additionalContext to Claude)
if [ -n "$session_id" ]; then
  full_context="**Claude Session ID:** ${session_id}"
fi

if [ -n "$context_message" ]; then
  if [ -n "$full_context" ]; then
    full_context="${full_context}
${context_message}"
  else
    full_context="$context_message"
  fi
fi
if [ -n "$rules_message" ]; then
  if [ -n "$full_context" ]; then
    full_context="${full_context}

${rules_message}"
  else
    full_context="$rules_message"
  fi
fi

if [ -z "$full_context" ]; then
  exit 0
fi

jq -n --arg context "$full_context" \
  '{
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: $context
    }
  }'

exit 0
