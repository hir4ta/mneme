#!/usr/bin/env bash
#
# user-prompt-submit.sh - UserPromptSubmit hook for mneme plugin
#
# Purpose: Search mneme for relevant context and inject as additionalContext
# using shared search-core logic (same ranking as search-server).
#
# Input (stdin): JSON with prompt, cwd
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

if [ -z "$prompt" ] || [ ${#prompt} -lt 10 ]; then
  exit 0
fi

if [[ "$prompt" == /mneme* ]]; then
  exit 0
fi

if [ -z "$cwd" ]; then
  cwd="${PWD}"
fi
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")

# Cap very large prompts to avoid overly expensive search
if [ ${#prompt} -gt 4000 ]; then
  prompt="${prompt:0:4000}"
fi

if ! validate_mneme "$cwd"; then
  exit 0
fi

PLUGIN_ROOT="$(get_plugin_root)"

search_script=$(find_script "$PLUGIN_ROOT" "prompt-search")
if [ -z "$search_script" ]; then
  exit 0
fi

search_output=$(invoke_node "$search_script" \
  --query "$prompt" --project "$cwd" --limit 5 2>/dev/null || echo "")

if [ -z "$search_output" ]; then
  exit 0
fi

success=$(echo "$search_output" | jq -r ".success // false" 2>/dev/null || echo "false")
if [ "$success" != "true" ]; then
  exit 0
fi

result_count=$(echo "$search_output" | jq ".results | length" 2>/dev/null || echo "0")
if [ "$result_count" -eq 0 ]; then
  exit 0
fi

context_lines=$(echo "$search_output" | jq -r '
  .results
  | map(select(.score >= 3 and (.type == "session" or .type == "unit")))
  | .[:3]
  | map("[\(.type):\(.id)] \(.title) | match: \((.matchedFields // []) | join(","))")
  | join("\n")
')

if [ -z "$context_lines" ] || [ "$context_lines" = "null" ]; then
  exit 0
fi

context_message="<mneme-context>
Related context found (sessions/units):
${context_lines}
Use /mneme:search for details.
</mneme-context>"

jq -n --arg context "$context_message" \
  '{
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: $context
    }
  }'

exit 0
