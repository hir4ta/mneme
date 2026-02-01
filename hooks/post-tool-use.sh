#!/usr/bin/env bash
#
# post-tool-use.sh - Post-tool use hook for Bash operations
#
# This hook is called after Bash tool execution.
# It detects errors, searches for matching patterns in mneme,
# and suggests solutions from past error-solution patterns.
#
# Input (stdin): JSON with tool_name, tool_input, tool_response, cwd
# Output (stdout): JSON with {"continue": true} and optional additionalContext
# Exit codes: 0 = success (non-blocking)
#
# Dependencies: jq

set -euo pipefail

# Read stdin
input_json=$(cat)

# Extract relevant fields (tool_response is the official field name)
exit_code=$(echo "$input_json" | jq -r '.tool_response.exit_code // .tool_result.exit_code // 0')
stderr=$(echo "$input_json" | jq -r '.tool_response.stderr // .tool_result.stderr // ""')
command=$(echo "$input_json" | jq -r '.tool_input.command // ""')
cwd=$(echo "$input_json" | jq -r '.cwd // empty')

# If no cwd, use PWD
if [ -z "$cwd" ]; then
  cwd="${PWD}"
fi

# Check for error conditions
if [[ "$exit_code" != "0" && -n "$stderr" ]]; then
  # Error detected - search for matching patterns first

  patterns_dir="${cwd}/.mneme/patterns"
  matched_solution=""
  matched_pattern=""
  matched_reasoning=""

  # Search patterns if directory exists
  if [ -d "$patterns_dir" ]; then
    # Get first 500 chars of stderr for matching
    stderr_sample=$(echo "$stderr" | head -c 500)

    # Search through all pattern files
    for pattern_file in "$patterns_dir"/*.json; do
      [ -f "$pattern_file" ] || continue

      # Extract error-solution patterns and check for matches (tab-separated output)
      match_result=$(jq -r --arg stderr "$stderr_sample" '
        [.patterns // [] | .[] | select(type == "object" and .type == "error-solution")] as $patterns
        | [$patterns[] |
            . as $p |
            (if ($p.errorRegex // "" | length > 0) and ($stderr | test($p.errorRegex; "i")) then true
             elif ($p.errorPattern // "" | length > 0) and ($stderr | contains($p.errorPattern)) then true
             else false end) as $matched |
            select($matched)
          ]
        | if length > 0 then
            .[0] | "MATCH\t" + (.errorPattern // "unknown") + "\t" + (.solution // "no solution") + "\t" + (.reasoning // "")
          else
            empty
          end
      ' "$pattern_file" 2>/dev/null || echo "")

      if [[ "$match_result" == MATCH$'\t'* ]]; then
        # Parse the tab-separated match result
        matched_pattern=$(echo "$match_result" | cut -f2)
        matched_solution=$(echo "$match_result" | cut -f3)
        matched_reasoning=$(echo "$match_result" | cut -f4)
        break
      fi
    done
  fi

  # Build suggestion message
  if [ -n "$matched_solution" ]; then
    # Pattern match found - suggest the solution
    suggestion="**Past solution found:**\\n"
    suggestion+="Error pattern: ${matched_pattern}\\n"
    suggestion+="Solution: ${matched_solution}\\n"
    if [ -n "$matched_reasoning" ]; then
      suggestion+="Reasoning: ${matched_reasoning}\\n"
    fi
    suggestion+="\\nApply this solution?"
  else
    # No match - just note the error
    suggestion="Error detected (exit code: $exit_code). No matching pattern found in mneme."
  fi

  # Output with additionalContext
  printf '{"continue": true, "additionalContext": "%s"}\n' "$suggestion"
else
  # No error - continue normally
  echo '{"continue": true}'
fi
