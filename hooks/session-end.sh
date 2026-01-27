#!/usr/bin/env bash
#
# session-end.sh - SessionEnd hook for memoria plugin
#
# Auto-save session by extracting interactions from transcript using jq.
# This ensures all thinking, user messages, and responses are preserved
# without relying on Claude to update the session file.
#
# Input (stdin): JSON with session_id, transcript_path, cwd
# Output: None (cannot block session end)

set -euo pipefail

# Read input from stdin
input_json=$(cat)

# Extract fields
session_id=$(echo "$input_json" | jq -r '.session_id // empty' 2>/dev/null || echo "")
transcript_path=$(echo "$input_json" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")

if [ -z "$session_id" ]; then
    exit 0
fi

# Use cwd from input or fallback to PWD
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi

# Resolve paths
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")
sessions_dir="${cwd}/.memoria/sessions"

# Find session file
session_short_id="${session_id:0:8}"
session_file=""

if [ -d "$sessions_dir" ]; then
    session_file=$(find "$sessions_dir" -type f -name "${session_short_id}.json" 2>/dev/null | head -1)
fi

if [ -z "$session_file" ] || [ ! -f "$session_file" ]; then
    exit 0
fi

# Extract interactions from transcript if available
if [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
    # Extract interactions using jq
    interactions_json=$(cat "$transcript_path" | jq -s '
        # User messages (text only, exclude tool results)
        [.[] | select(.type == "user" and .message.role == "user" and (.message.content | type) == "string") | {
            timestamp: .timestamp,
            content: .message.content
        }] as $user_messages |

        # Get user message timestamps for grouping
        ($user_messages | map(.timestamp)) as $user_timestamps |

        # All assistant messages with thinking or text
        [.[] | select(.type == "assistant") | . as $msg |
            ($msg.message.content // []) |
            {
                timestamp: $msg.timestamp,
                thinking: ([.[] | select(.type == "thinking") | .thinking] | join("\n")),
                text: ([.[] | select(.type == "text") | .text] | join("\n"))
            } | select(.thinking != "" or .text != "")
        ] as $all_assistant |

        # Tool usage summary
        [.[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use") | .name] |
        group_by(.) | map({name: .[0], count: length}) | sort_by(-.count) as $tool_usage |

        # Build interactions by grouping all assistant responses between user messages
        [range(0; $user_messages | length) | . as $i |
            $user_messages[$i] as $user |
            # Get next user message timestamp (or far future if last)
            (if $i + 1 < ($user_messages | length) then $user_messages[$i + 1].timestamp else "9999-12-31T23:59:59Z" end) as $next_user_ts |
            # Collect all assistant responses between this user message and next
            [$all_assistant[] | select(.timestamp > $user.timestamp and .timestamp < $next_user_ts)] as $turn_responses |
            if ($turn_responses | length) > 0 then {
                id: ("int-" + (($i + 1) | tostring | if length < 3 then "00"[0:(3-length)] + . else . end)),
                timestamp: $user.timestamp,
                user: $user.content,
                thinking: ([$turn_responses[].thinking | select(. != "")] | join("\n")),
                assistant: ([$turn_responses[].text | select(. != "")] | join("\n"))
            } else empty end
        ] as $interactions |

        # File changes from tool usage
        [.[] | select(.type == "assistant") | .message.content[]? |
            select(.type == "tool_use" and (.name == "Edit" or .name == "Write")) |
            {
                path: .input.file_path,
                action: (if .name == "Write" then "create" else "edit" end)
            }
        ] | unique_by(.path) as $files |

        {
            interactions: $interactions,
            toolUsage: $tool_usage,
            files: $files,
            metrics: {
                userMessages: ($user_messages | length),
                assistantResponses: ($all_assistant | length),
                thinkingBlocks: ([$all_assistant[].thinking | select(. != "")] | length)
            }
        }
    ' 2>/dev/null || echo '{"interactions":[],"toolUsage":[],"files":[],"metrics":{}}')

    # Update session file with extracted data
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    jq --argjson extracted "$interactions_json" \
       --arg status "complete" \
       --arg endedAt "$now" \
       --arg updatedAt "$now" '
        # Merge extracted interactions (append to existing)
        .interactions = ((.interactions // []) + ($extracted.interactions // [])) |
        # Update files
        .files = ((.files // []) + ($extracted.files // []) | unique_by(.path)) |
        # Update metrics
        .metrics = (.metrics // {}) + {
            userMessages: ($extracted.metrics.userMessages // 0),
            assistantResponses: ($extracted.metrics.assistantResponses // 0),
            thinkingBlocks: ($extracted.metrics.thinkingBlocks // 0),
            toolUsage: ($extracted.toolUsage // [])
        } |
        # Set status and timestamps
        .status = $status |
        .endedAt = $endedAt |
        .updatedAt = $updatedAt
    ' "$session_file" > "${session_file}.tmp" && mv "${session_file}.tmp" "$session_file"

    echo "[memoria] Session auto-saved with $(echo "$interactions_json" | jq '.interactions | length') interactions: ${session_file}" >&2
else
    # No transcript, just update status
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    jq --arg status "complete" --arg endedAt "$now" --arg updatedAt "$now" '
        .status = $status | .endedAt = $endedAt | .updatedAt = $updatedAt
    ' "$session_file" > "${session_file}.tmp" && mv "${session_file}.tmp" "$session_file"

    echo "[memoria] Session completed (no transcript): ${session_file}" >&2
fi

exit 0
