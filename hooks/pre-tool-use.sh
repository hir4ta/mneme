#!/usr/bin/env bash
#
# pre-tool-use.sh - Pre-tool use hook for Edit|Write operations
#
# This hook is called before Edit or Write tools are executed.
# It can be used for TDD mode checking and change preparation.
#
# Input (stdin): JSON with tool_name, tool_input
# Output: JSON with continue (boolean) and optional additionalContext

set -euo pipefail

# Read stdin
input_json=$(cat)

# Extract relevant fields
tool_name=$(echo "$input_json" | jq -r '.tool_name // ""')
file_path=$(echo "$input_json" | jq -r '.tool_input.file_path // .tool_input.path // ""')

# TDD mode recommendation (optional)
# This hook does not enforce TDD - use /memoria:tdd skill for TDD workflow
# The skill provides guidance but does not block non-TDD edits

# Example TDD check (commented out for now):
# if [[ -n "$file_path" && "$file_path" =~ ^src/ && ! "$file_path" =~ \.(test|spec)\.(ts|js|tsx|jsx)$ ]]; then
#   # Check if corresponding test exists
#   test_file="${file_path/src/tests}"
#   test_file="${test_file%.ts}.test.ts"
#   if [[ ! -f "$test_file" ]]; then
#     echo '{"continue": true, "additionalContext": "Note: No test file found for this implementation. Consider using /memoria:tdd for test-driven development."}'
#     exit 0
#   fi
# fi

# Allow tool execution
echo '{"continue": true}'
