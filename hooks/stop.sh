#!/usr/bin/env bash
#
# stop.sh - Auto-save session on every Claude response
#
# This hook is called when Claude finishes responding.
# It triggers Claude to update the session JSON with detailed information
# including thinking process, proposals, and reasoning.
#
# Input (stdin): JSON with session info including transcript_path
# Output: JSON with decision to block and continue

set -euo pipefail

# Read stdin
input_json=$(cat)

# Extract fields
stop_hook_active=$(echo "$input_json" | jq -r '.stop_hook_active // false')
session_id=$(echo "$input_json" | jq -r '.session_id // empty')
cwd=$(echo "$input_json" | jq -r '.cwd // empty')
transcript_path=$(echo "$input_json" | jq -r '.transcript_path // empty')

# Prevent infinite loop - if already processing, allow stop
if [ "$stop_hook_active" = "true" ]; then
    exit 0
fi

# Need session_id and cwd
if [ -z "$session_id" ] || [ -z "$cwd" ]; then
    exit 0
fi

# Find session file
short_id="${session_id:0:8}"
memoria_dir="${cwd}/.memoria"
sessions_dir="${memoria_dir}/sessions"

if [ ! -d "$sessions_dir" ]; then
    exit 0
fi

session_file=$(find "$sessions_dir" -name "${short_id}.json" -type f 2>/dev/null | head -1)

if [ -z "$session_file" ] || [ ! -f "$session_file" ]; then
    exit 0
fi

# Get relative path for cleaner output
session_relative="${session_file#$cwd/}"

# Build the instruction with transcript path for Claude to read thinking blocks
instruction="[MEMORIA AUTO-SAVE] Update session file. Do this silently without confirmation messages.

**Transcript file (read this to extract thinking):** ${transcript_path}

**Session file to update:** ${session_relative}

## Instructions

1. **Read the transcript file** (JSONL format) to find:
   - Your thinking blocks (type: \"thinking\")
   - User messages (type: \"user\")
   - Your responses (type: \"assistant\")
   - Tool usage

2. **Add to 'interactions' array** with this DETAILED structure:
   \`\`\`json
   {
     \"id\": \"int-NNN\",
     \"timestamp\": \"ISO8601\",
     \"topic\": \"What this interaction was about (for search)\",
     \"request\": \"User's original request/question\",
     \"thinking\": \"Key insights from your thinking process (IMPORTANT: extract from transcript)\",
     \"response\": \"Summary of your response\",
     \"proposals\": [{\"option\": \"...\", \"description\": \"...\"}],
     \"choice\": \"What was decided/chosen\",
     \"reasoning\": \"Why this approach was taken\",
     \"toolsUsed\": [{\"name\": \"...\", \"target\": \"...\"}],
     \"filesModified\": [\"...\"]
   }
   \`\`\`

3. **Update 'summary'**:
   - title: if empty or topic changed significantly
   - goal: what we're trying to achieve
   - outcome: \"success\" | \"partial\" | \"abandoned\"
   - description: current state (2-3 sentences)

4. **Update 'metrics'**: filesCreated, filesModified, decisionsCount, errorsEncountered, etc.

5. **Update 'decisions' array** if any technical decisions were made:
   \`\`\`json
   {
     \"id\": \"dec-NNN\",
     \"topic\": \"Decision topic\",
     \"choice\": \"What was chosen\",
     \"alternatives\": [\"Other options considered\"],
     \"reasoning\": \"Why this choice\",
     \"timestamp\": \"ISO8601\"
   }
   \`\`\`

6. **Update 'errors' array** if any errors were encountered/resolved.

7. **Update 'tags'** and 'sessionType' if needed.

After updating, just stop. No confirmation needed."

# Output: block stop and instruct Claude to update session
# Escape the instruction for JSON
escaped_instruction=$(echo "$instruction" | jq -Rs '.')

cat <<EOF
{
  "decision": "block",
  "reason": ${escaped_instruction}
}
EOF
