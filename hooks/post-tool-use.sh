#!/usr/bin/env bash
#
# post-tool-use.sh - Post-tool use hook for Bash operations
#
# This hook is called after Bash tool execution.
# It detects errors, searches for matching approved units in mneme,
# and suggests relevant past guidance.
#
# Input (stdin): JSON with tool_name, tool_input, tool_response, cwd
# Output (stdout): JSON with {"continue": true} and optional additionalContext
# Exit codes: 0 = success (non-blocking)
#
# Dependencies: jq

set -euo pipefail

continue_json='{"continue": true}'

if ! command -v jq >/dev/null 2>&1; then
  echo "$continue_json"
  exit 0
fi

# Read stdin
input_json=$(cat)

# Extract relevant fields (tool_response is the official field name)
exit_code=$(echo "$input_json" | jq -r '.tool_response.exit_code // .tool_result.exit_code // 0' 2>/dev/null || echo "0")
stderr=$(echo "$input_json" | jq -r '.tool_response.stderr // .tool_result.stderr // ""' 2>/dev/null || echo "")
cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")

# If no cwd, use PWD
if [ -z "$cwd" ]; then
  cwd="${PWD}"
fi
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")

# Check for error conditions
if [[ "$exit_code" != "0" && -n "$stderr" ]]; then
  # Error detected - search for matching approved units first.
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
  PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

  search_script=""
  runner=""
  if [ -f "${PLUGIN_ROOT}/dist/lib/prompt-search.js" ]; then
    search_script="${PLUGIN_ROOT}/dist/lib/prompt-search.js"
    runner="node"
  elif [ -f "${PLUGIN_ROOT}/lib/prompt-search.ts" ]; then
    search_script="${PLUGIN_ROOT}/lib/prompt-search.ts"
    runner="tsx"
  fi

  matched_unit=""
  if [ -n "$search_script" ]; then
    stderr_sample=$(echo "$stderr" | head -c 500)
    if [ -n "$stderr_sample" ]; then
      search_output=""
      if [ "$runner" = "tsx" ]; then
        search_output=$(npx tsx "$search_script" --query "$stderr_sample" --project "$cwd" --limit 5 2>/dev/null || echo "")
      else
        search_output=$(node "$search_script" --query "$stderr_sample" --project "$cwd" --limit 5 2>/dev/null || echo "")
      fi

      matched_unit=$(echo "$search_output" | jq -r '
        if .success == true then
          .results
          | map(select(.type == "unit" and .score >= 3))
          | .[0]
          | if . == null then empty else
              "id=\(.id)\ttitle=\(.title)\tsnippet=\(.snippet)"
            end
        else
          empty
        end
      ' 2>/dev/null || echo "")
    fi
  fi

  # Build suggestion message.
  if [ -n "$matched_unit" ]; then
    unit_id=$(echo "$matched_unit" | awk -F'\t' '{print $1}' | sed 's/^id=//')
    unit_title=$(echo "$matched_unit" | awk -F'\t' '{print $2}' | sed 's/^title=//')
    unit_snippet=$(echo "$matched_unit" | awk -F'\t' '{print $3}' | sed 's/^snippet=//')

    suggestion="**Relevant unit found:**\\n"
    suggestion+="Unit: ${unit_title} (${unit_id})\\n"
    if [ -n "$unit_snippet" ]; then
      suggestion+="Guidance: ${unit_snippet}\\n"
    fi
    suggestion+="\\nApply this guidance?"
  else
    # No match - just note the error.
    suggestion="Error detected (exit code: $exit_code). No matching approved unit found in mneme."
  fi

  # Output with additionalContext (JSON-escaped)
  jq -n --arg context "$suggestion" '{continue: true, additionalContext: $context}'
else
  # No error - continue normally
  echo "$continue_json"
fi
