#!/usr/bin/env bash
# SessionEnd hook for memoria plugin
# Saves the current session when it ends

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
reason=$(echo "$input_json" | jq -r '.reason // "unknown"')
cwd=$(echo "$input_json" | jq -r '.cwd // empty')

# Validate required fields
if [ -z "$transcript_path" ] || [ -z "$session_id" ]; then
    exit 0
fi

# Use cwd from input or fallback to PWD
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi

# Resolve paths
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")
memoria_dir="${cwd}/.memoria"
sessions_dir="${memoria_dir}/sessions"

# Create sessions directory if not exists
mkdir -p "$sessions_dir"

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
date_part=$(echo "$now" | cut -d'T' -f1)
session_short_id="${session_id:0:8}"
file_id="${date_part}_${session_short_id}"

# Check if transcript file exists
if [ ! -f "$transcript_path" ]; then
    exit 0
fi

# Parse transcript and extract messages
# JSONL format: each line is a JSON object with type "user" or "assistant"
messages=$(jq -s '
    [.[] | select((.type == "user" or .type == "assistant") and .message != null) |
    {
        type: .type,
        timestamp: (.timestamp // now | tostring),
        content: (
            if .message.content | type == "string" then
                .message.content
            elif .message.content | type == "array" then
                [.message.content[] | select(.type == "text") | .text] | join("")
            else
                ""
            end
        ),
        thinking: (
            if .message.content | type == "array" then
                [.message.content[] | select(.type == "thinking") | .thinking] | join("") | if . == "" then null else . end
            else
                null
            end
        )
    } | with_entries(select(.value != null and .value != ""))]
' "$transcript_path" 2>/dev/null || echo "[]")

# Check if we have messages
message_count=$(echo "$messages" | jq 'length')
if [ "$message_count" -eq 0 ]; then
    exit 0
fi

# Extract files modified from tool results
files_modified=$(jq -s '
    [.[] | select(.type == "tool_result" and .input.file_path != null) |
    {
        path: .input.file_path,
        action: (
            if .tool == "Write" then "created"
            elif .tool == "Edit" then "modified"
            elif .tool == "Delete" then "deleted"
            else "modified"
            end
        )
    }] | unique_by(.path)
' "$transcript_path" 2>/dev/null || echo "[]")

# Generate summary from first user message
summary=$(echo "$messages" | jq -r '
    [.[] | select(.type == "user")] |
    if length > 0 then
        .[0].content | if length > 150 then .[0:150] + "..." else . end
    else
        "Empty session"
    end
')

# Extract tags from message content
tags=$(echo "$messages" | jq -r '
    [.[] | .content // ""] | join(" ") | ascii_downcase |
    (
        (if test("auth") then ["auth"] else [] end) +
        (if test("api") then ["api"] else [] end) +
        (if test("ui|component|react") then ["ui"] else [] end) +
        (if test("test") then ["test"] else [] end) +
        (if test("bug|fix") then ["bug"] else [] end) +
        (if test("feature") then ["feature"] else [] end) +
        (if test("refactor") then ["refactor"] else [] end) +
        (if test("doc") then ["docs"] else [] end) +
        (if test("config") then ["config"] else [] end) +
        (if test("db|database") then ["db"] else [] end)
    ) | .[0:3]
')

# Get first message timestamp
first_timestamp=$(echo "$messages" | jq -r '.[0].timestamp // "'$now'"')

# Build session JSON
session_json=$(jq -n \
    --arg id "$file_id" \
    --arg sessionId "$session_id" \
    --arg createdAt "$first_timestamp" \
    --arg endedAt "$now" \
    --arg userName "$git_user_name" \
    --arg userEmail "$git_user_email" \
    --arg branch "$current_branch" \
    --arg projectDir "$cwd" \
    --argjson tags "$tags" \
    --arg summary "$summary" \
    --argjson messages "$messages" \
    --argjson filesModified "$files_modified" \
    --arg endReason "$reason" \
    '{
        id: $id,
        sessionId: $sessionId,
        createdAt: $createdAt,
        endedAt: $endedAt,
        user: {
            name: $userName,
            email: (if $userEmail == "" then null else $userEmail end)
        } | with_entries(select(.value != null)),
        context: {
            branch: (if $branch == "" then null else $branch end),
            projectDir: $projectDir
        } | with_entries(select(.value != null)),
        tags: $tags,
        status: "completed",
        summary: $summary,
        messages: $messages,
        filesModified: $filesModified,
        endReason: $endReason
    }')

# Save session
session_path="${sessions_dir}/${file_id}.json"
echo "$session_json" > "$session_path"

# Log to stderr (not shown to user but helpful for debugging)
echo "[memoria] Session saved to ${session_path}" >&2

# ============================================
# Auto-detect design decisions from conversation
# ============================================

decisions_dir="${memoria_dir}/decisions"
mkdir -p "$decisions_dir"

# Extract potential decisions from assistant messages
# Look for patterns indicating design decisions
detected_decisions=$(echo "$messages" | jq -r '
    # Get all assistant messages with thinking or content
    [.[] | select(.type == "assistant")] |

    # Combine thinking and content for analysis
    map({
        thinking: (.thinking // ""),
        content: (.content // ""),
        timestamp: .timestamp
    }) |

    # Filter messages that contain decision-related keywords
    map(select(
        (.thinking + " " + .content) | test(
            "決定|採用|選択|することにした|ことにする|方針|architecture|decision|approach|strategy|instead of|rather than|選んだ|使うことに|実装方針|設計判断";
            "i"
        )
    )) |

    # Extract decision-like sentences
    map({
        timestamp: .timestamp,
        text: ((.thinking // "") + "\n" + (.content // ""))
    })
')

decision_count=$(echo "$detected_decisions" | jq 'length')

if [ "$decision_count" -gt 0 ]; then
    # Process each detected decision
    decision_index=0
    echo "$detected_decisions" | jq -c '.[]' | while read -r decision_data; do
        decision_index=$((decision_index + 1))

        timestamp=$(echo "$decision_data" | jq -r '.timestamp')
        text=$(echo "$decision_data" | jq -r '.text')

        # Generate decision ID
        decision_id="${date_part}-auto-${session_short_id}-$(printf "%03d" $decision_index)"

        # Extract a title from the text (first significant sentence)
        title=$(echo "$text" | head -c 500 | grep -oE '(決定|採用|選択|方針|実装)[^。．\n]{5,50}' | head -1 || echo "Auto-detected decision")
        if [ -z "$title" ] || [ "$title" = "Auto-detected decision" ]; then
            title=$(echo "$text" | head -c 100 | tr '\n' ' ' | sed 's/^[[:space:]]*//' | cut -c1-50)
            [ -n "$title" ] && title="${title}..."
        fi

        # Extract key decision content (sentences with decision keywords)
        decision_content=$(echo "$text" | grep -oE '[^。．\n]*?(決定|採用|選択|することにした|ことにする|方針)[^。．\n]*[。．]?' | head -3 | tr '\n' ' ' || echo "$text" | head -c 200)

        # Build decision JSON
        decision_json=$(jq -n \
            --arg id "$decision_id" \
            --arg title "$title" \
            --arg decision "$decision_content" \
            --arg createdAt "$timestamp" \
            --arg userName "$git_user_name" \
            --arg userEmail "$git_user_email" \
            --arg branch "$current_branch" \
            --arg projectDir "$cwd" \
            --arg sessionId "$file_id" \
            --arg source "auto" \
            '{
                id: $id,
                title: $title,
                decision: $decision,
                reasoning: "Auto-detected from session conversation",
                alternatives: [],
                tags: ["auto-detected"],
                createdAt: $createdAt,
                user: {
                    name: $userName,
                    email: (if $userEmail == "" then null else $userEmail end)
                } | with_entries(select(.value != null)),
                context: {
                    branch: (if $branch == "" then null else $branch end),
                    projectDir: $projectDir
                } | with_entries(select(.value != null)),
                relatedSessions: [$sessionId],
                source: $source,
                status: "draft"
            }')

        # Save decision (only if not duplicate)
        decision_path="${decisions_dir}/${decision_id}.json"
        if [ ! -f "$decision_path" ]; then
            echo "$decision_json" > "$decision_path"
            echo "[memoria] Decision auto-detected: ${decision_path}" >&2
        fi
    done
fi

exit 0
