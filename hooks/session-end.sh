#!/usr/bin/env bash
# SessionEnd hook for memoria plugin
# Fallback processing if LLM didn't update session JSON
# Uses session_id from stdin to find session file (supports concurrent sessions)

set -euo pipefail

# Check for jq
if ! command -v jq &> /dev/null; then
    echo '{"error": "jq is required for session saving. Install with: brew install jq"}' >&2
    exit 0
fi

# Read input from stdin
input_json=$(cat)

# Extract fields from input
transcript_path=$(echo "$input_json" | jq -r '.transcript_path // empty')
session_id=$(echo "$input_json" | jq -r '.session_id // empty')
cwd=$(echo "$input_json" | jq -r '.cwd // empty')

# Use cwd from input or fallback to PWD
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi

# Resolve paths
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")
memoria_dir="${cwd}/.memoria"
sessions_dir="${memoria_dir}/sessions"

# ============================================
# Find session file using session_id from stdin
# Pattern: .memoria/sessions/YYYY/MM/*_{session_short_id}.json
# This approach supports concurrent sessions (no shared state file)
# ============================================
session_path=""
file_id=""

if [ -z "$session_id" ]; then
    echo "[memoria] No session_id provided, skipping" >&2
    exit 0
fi

session_short_id="${session_id:0:8}"

# Search for session file by pattern
# The file name format is: YYYY-MM-DD_xxxxxxxx.json where xxxxxxxx is session_short_id
if [ -d "$sessions_dir" ]; then
    # Find file matching *_{session_short_id}.json
    found_file=$(find "$sessions_dir" -type f -name "*_${session_short_id}.json" 2>/dev/null | head -1)

    if [ -n "$found_file" ] && [ -f "$found_file" ]; then
        session_path="$found_file"
        file_id=$(basename "$found_file" .json)
        echo "[memoria] Found session file: ${session_path}" >&2
    fi
fi

# If no existing file found, create new one (fallback for edge cases)
if [ -z "$session_path" ]; then
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    date_part=$(echo "$now" | cut -d'T' -f1)
    year_part=$(echo "$date_part" | cut -d'-' -f1)
    month_part=$(echo "$date_part" | cut -d'-' -f2)
    file_id="${date_part}_${session_short_id}"

    year_month_dir="${sessions_dir}/${year_part}/${month_part}"
    mkdir -p "$year_month_dir"
    session_path="${year_month_dir}/${file_id}.json"
    echo "[memoria] Creating new session file: ${session_path}" >&2
fi

# ============================================
# Check if session needs fallback processing
# ============================================
needs_fallback=false
session_exists=false

if [ -f "$session_path" ]; then
    session_exists=true

    # Check if interactions is empty and title is empty
    interactions_count=$(jq '.interactions | length' "$session_path" 2>/dev/null || echo "0")
    title=$(jq -r '.title // ""' "$session_path" 2>/dev/null || echo "")

    if [ "$interactions_count" -eq 0 ] && [ -z "$title" ]; then
        needs_fallback=true
        echo "[memoria] Session has no interactions, running fallback processing" >&2
    fi
else
    needs_fallback=true
    echo "[memoria] Session file not found, creating with fallback" >&2
fi

# ============================================
# Fallback processing (if needed)
# ============================================
if [ "$needs_fallback" = true ]; then
    # Get git info
    current_branch=""
    git_user_name="unknown"
    git_user_email=""

    if git -C "$cwd" rev-parse --git-dir &> /dev/null 2>&1; then
        current_branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
        git_user_name=$(git -C "$cwd" config user.name 2>/dev/null || echo "unknown")
        git_user_email=$(git -C "$cwd" config user.email 2>/dev/null || echo "")
    fi

    # Current timestamp
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Parse transcript if available
    if [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
        # Extract messages from transcript
        messages=$(jq -s '
            def content_text:
                if .message.content | type == "string" then
                    .message.content
                elif .message.content | type == "array" then
                    [.message.content[] | select(.type == "text") | .text] | join("")
                else
                    ""
                end;
            def thinking_text:
                if .message.content | type == "array" then
                    [.message.content[] | select(.type == "thinking") | .thinking] | join("")
                else
                    ""
                end;
            def is_noise($content):
                ($content | tostring | test("<(local-command-|command-name|command-message|command-args)"; "i"));

            [.[] |
                select((.type == "user" or .type == "assistant") and .message != null) |
                .content = content_text |
                .thinking = thinking_text |
                {
                    type: .type,
                    timestamp: (.timestamp // now | tostring),
                    content: (.content | if . == "" then null else . end),
                    thinking: (.thinking | if . == "" then null else . end)
                } |
                select((.content // "") != "" or (.thinking // "") != "") |
                select(((.content // "") | is_noise(.) | not)) |
                with_entries(select(.value != null))
            ]
        ' "$transcript_path" 2>/dev/null || echo "[]")

        message_count=$(echo "$messages" | jq 'length')

        if [ "$message_count" -gt 0 ]; then
            # Extract title from first user message (100 char limit)
            title=$(echo "$messages" | jq -r '
                [.[] | select(.type == "user") | .content // ""][0] // "" |
                gsub("\\s+"; " ") | gsub("^\\s+|\\s+$"; "") |
                if length > 100 then .[0:100] + "..." else . end
            ')

            # Extract first user request
            first_request=$(echo "$messages" | jq -r '
                [.[] | select(.type == "user") | .content // ""][0] // ""
            ')

            # Extract first assistant thinking
            first_thinking=$(echo "$messages" | jq -r '
                [.[] | select(.type == "assistant") | .thinking // ""][0] // ""
            ')

            # Extract web links
            web_links=$(echo "$messages" | jq -c '
                def extract_links($text):
                    ($text | tostring | scan("https?://[^\\s)\\]}>]+"));
                reduce [
                    .[] |
                    select(.type == "assistant") |
                    [(.content // ""), (.thinking // "")] |
                    map(extract_links(.))
                ][] as $links ([]; . + $links)
                | unique
            ')

            # Extract files modified from tool results
            files_modified=$(jq -s -c '
                [.[] | select(.type == "tool_result" and .input.file_path != null) |
                .input.file_path] | unique
            ' "$transcript_path" 2>/dev/null || echo "[]")

            # Extract tags
            tags=$(echo "$messages" | jq -c '
                [.[] | (.content // "" | tostring)] | join(" ") | ascii_downcase |
                (
                    (if test("auth") then ["auth"] else [] end) +
                    (if test("api") then ["api"] else [] end) +
                    (if test("ui|component|react") then ["ui"] else [] end) +
                    (if test("test") then ["test"] else [] end) +
                    (if test("bug|fix") then ["bugfix"] else [] end) +
                    (if test("feature") then ["feature"] else [] end) +
                    (if test("refactor") then ["refactor"] else [] end) +
                    (if test("doc") then ["docs"] else [] end) +
                    (if test("config") then ["config"] else [] end) +
                    (if test("db|database") then ["db"] else [] end)
                ) | .[0:3]
            ')

            # Build fallback interaction
            interaction=$(jq -n \
                --arg topic "$title" \
                --arg timestamp "$now" \
                --arg request "$first_request" \
                --arg thinking "$first_thinking" \
                --argjson webLinks "$web_links" \
                --argjson filesModified "$files_modified" \
                '{
                    id: "int-001",
                    topic: $topic,
                    timestamp: $timestamp,
                    request: (if $request == "" then null else $request end),
                    thinking: (if $thinking == "" then null else $thinking end),
                    webLinks: (if ($webLinks | length) == 0 then null else $webLinks end),
                    filesModified: (if ($filesModified | length) == 0 then null else $filesModified end)
                } | with_entries(select(.value != null))')

            # Update or create session JSON
            if [ "$session_exists" = true ]; then
                updated_session=$(jq \
                    --arg title "$title" \
                    --argjson tags "$tags" \
                    --argjson interaction "$interaction" \
                    '.title = $title | .tags = $tags | .interactions = [$interaction]' \
                    "$session_path")
                echo "$updated_session" > "$session_path"
            else
                date_part=$(echo "$now" | cut -d'T' -f1)
                year_part=$(echo "$date_part" | cut -d'-' -f1)
                month_part=$(echo "$date_part" | cut -d'-' -f2)

                sessions_dir="${memoria_dir}/sessions/${year_part}/${month_part}"
                mkdir -p "$sessions_dir"

                session_json=$(jq -n \
                    --arg id "$file_id" \
                    --arg sessionId "${session_id:-$file_id}" \
                    --arg createdAt "$now" \
                    --arg branch "$current_branch" \
                    --arg projectDir "$cwd" \
                    --arg userName "$git_user_name" \
                    --arg userEmail "$git_user_email" \
                    --arg title "$title" \
                    --argjson tags "$tags" \
                    --argjson interaction "$interaction" \
                    '{
                        id: $id,
                        sessionId: $sessionId,
                        createdAt: $createdAt,
                        context: {
                            branch: (if $branch == "" then null else $branch end),
                            projectDir: $projectDir,
                            user: {
                                name: $userName,
                                email: (if $userEmail == "" then null else $userEmail end)
                            } | with_entries(select(.value != null))
                        } | with_entries(select(.value != null)),
                        title: $title,
                        goal: "",
                        tags: $tags,
                        interactions: [$interaction]
                    }')

                echo "$session_json" > "$session_path"
            fi

            echo "[memoria] Fallback processing completed: ${session_path}" >&2
        fi
    fi
fi

exit 0
