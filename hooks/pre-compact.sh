#!/usr/bin/env bash
# PreCompact hook for memoria plugin
# Saves a partial session before context compaction

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
trigger=$(echo "$input_json" | jq -r '.trigger // "manual"')
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

# Get current git branch
current_branch=""
if git -C "$cwd" rev-parse --git-dir &> /dev/null 2>&1; then
    current_branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
fi

# Current timestamp
now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
date_part=$(echo "$now" | cut -d'T' -f1)
year_part=$(echo "$date_part" | cut -d'-' -f1)
month_part=$(echo "$date_part" | cut -d'-' -f2)
session_short_id="${session_id:0:8}"
file_id="${date_part}_${session_short_id}"

# Create sessions directory (year/month) if not exists
sessions_dir="${memoria_dir}/sessions/${year_part}/${month_part}"
mkdir -p "$sessions_dir"

# Check if transcript file exists
if [ ! -f "$transcript_path" ]; then
    exit 0
fi

# Parse transcript and extract messages
# JSONL format: each line is a JSON object with type "user" or "assistant"
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
        ($content | test("<(local-command-|command-name|command-message|command-args)"; "i"));

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

# Check if we have messages
message_count=$(echo "$messages" | jq 'length')
if [ "$message_count" -eq 0 ]; then
    exit 0
fi

user_message_count=$(echo "$messages" | jq '[.[] | select(.type == "user")] | length')
assistant_message_count=$(echo "$messages" | jq '[.[] | select(.type == "assistant")] | length')
tool_use_count=$(jq -s '[.[] | select(.type == "tool_result")] | length' "$transcript_path" 2>/dev/null || echo "0")

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

# Extract explicit user requests
user_requests=$(echo "$messages" | jq -c '
    def normalize: (if . == null then "" elif type == "string" then . else tostring end) | gsub("\\s+"; " ") | gsub("^\\s+|\\s+$"; "");
    def clean_markdown:
        gsub("`"; "") | gsub("^@"; "") | gsub("^#+\\s*"; "") |
        gsub("^[-*•]\\s+"; "") | gsub("\\*\\*"; "");
    def extract_files($text):
        ($text | scan("@?[A-Za-z0-9._/-]+\\.[A-Za-z0-9]+") | map(gsub("^@"; "")));
    def split_sentences:
        gsub("。"; "。\n") | gsub("？"; "？\n") | gsub("\\?"; "?\n") | split("\n");
    def is_request:
        test("してほしい|して欲しい|にしてほしい|にして欲しい|してください|でお願いします|お願いします|お願い|やって|やってください|対応して|使って|利用して|採用|にする|にして|方針|必須|前提|禁止|変更して|追加して|削除して|確認して|見て|レビュー|チェック|不要|いらない|必要ない"; "i");
    def clip($s; $max):
        if ($s | length) > $max then ($s[0:$max] + "...") else $s end;
    def normalize_request:
        clean_markdown
        | gsub("(?i)(お願いします|お願い|してください|してほしい|して欲しい|して下さい|やってください|やって|対応して|実施して)"; "")
        | gsub("(?i)(確認してほしい|確認してください|確認して|確認)"; "確認")
        | gsub("(?i)(不要かな|不要です|不要|いらない|必要ない)"; "削除")
        | gsub("[。．.!！?？]+$"; "")
        | normalize
        | if test("は削除$") then gsub("(.+)は削除$"; "削除: \\1") else . end
        | if test("確認$") then gsub("(.+)確認$"; "確認: \\1") else . end;
    def unique_ordered:
        reduce .[] as $item ([]; if index($item) then . else . + [$item] end);

    (
    [
        .[] |
        select(.type == "user" and (.content // "") != "") |
        (.content | split_sentences[]) |
        normalize |
        select(length > 0) |
        select(is_request) |
        normalize_request |
        select(length > 0) |
        clip(.; 120)
    ] | unique_ordered | .[0:8]
    ) as $requests
    | $requests
')

# Summary title from explicit request or first user message
summary_title=$(echo "$messages" | jq -r '
    def normalize: (if . == null then "" elif type == "string" then . else tostring end) | gsub("\\s+"; " ") | gsub("^\\s+|\\s+$"; "");
    def clean_markdown:
        gsub("`"; "") | gsub("^@"; "") | gsub("^#+\\s*"; "") |
        gsub("^[-*•]\\s+"; "") | gsub("\\*\\*"; "");
    def extract_files($text):
        ($text | scan("@?[A-Za-z0-9._/-]+\\.[A-Za-z0-9]+") | map(gsub("^@"; "")));
    def split_sentences:
        gsub("。"; "。\n") | gsub("？"; "？\n") | gsub("\\?"; "?\n") | split("\n");
    def is_request:
        test("してほしい|して欲しい|にしてほしい|にして欲しい|してください|でお願いします|お願いします|お願い|やって|やってください|対応して|使って|利用して|採用|にする|にして|方針|必須|前提|禁止|変更して|追加して|削除して|確認して|見て|レビュー|チェック|不要|いらない|必要ない"; "i");
    def clip($s; $max):
        if ($s | length) > $max then ($s[0:$max] + "...") else $s end;
    def normalize_request:
        clean_markdown
        | gsub("(?i)(お願いします|お願い|してください|してほしい|して欲しい|して下さい|やってください|やって|対応して|実施して)"; "")
        | gsub("(?i)(確認してほしい|確認してください|確認して|確認)"; "確認")
        | gsub("(?i)(不要かな|不要です|不要|いらない|必要ない)"; "削除")
        | gsub("[。．.!！?？]+$"; "")
        | normalize
        | if test("は削除$") then gsub("(.+)は削除$"; "削除: \\1") else . end
        | if test("確認$") then gsub("(.+)確認$"; "確認: \\1") else . end;
    def unique_ordered:
        reduce .[] as $item ([]; if index($item) then . else . + [$item] end);
    def request_candidates:
        [
            .[] |
            select(.type == "user" and (.content // "") != "") |
            (.content | split_sentences[]) |
            normalize |
            select(length > 0) |
            select(is_request) |
            normalize_request |
            select(length > 0)
        ] | unique_ordered;
    def file_candidates:
        [
            .[] |
            select(.type == "user" and (.content // "") != "") |
            (.content | extract_files(.))[]
        ] | unique_ordered;
    def first_user_line:
        [
            .[] |
            select(.type == "user" and (.content // "") != "") |
            (.content | split_sentences[]) |
            normalize |
            select(length > 0) |
            clean_markdown |
            gsub("[。．.!！?？]+$"; "") |
            select(length > 0)
        ][0];

    (request_candidates) as $reqs |
    (file_candidates) as $files |
    if ($reqs | length) > 0 then
        ($reqs[0:2] | join(" / ")) as $base
        | if ($files | length) > 0 and ($base | contains($files[0]) | not) then
            ($files[0] + " " + $base)
          else
            $base
          end
        | clip(.; 50)
    elif ($files | length) > 0 then
        ($files[0] + " 作業") | clip(.; 50)
    else
        (first_user_line // "セッションまとめ") | clip(.; 50)
    end
')

# Assistant actions from tool results
assistant_actions_from_tools=$(jq -s -c '
    def normalize: gsub("\\s+"; " ") | gsub("^\\s+|\\s+$"; "");

    [
        .[] |
        select(.type == "tool_result") |
        (
            if (.tool == "Write" or .tool == "Edit" or .tool == "Delete") then
                "\(.tool): \(.input.file_path // "")"
            elif (.tool | type == "string") and (.tool | length > 0) then
                if (.input.command? and (.input.command | type == "string")) then
                    "\(.tool): \(.input.command)"
                elif (.input.file_path? and (.input.file_path | type == "string")) then
                    "\(.tool): \(.input.file_path)"
                else
                    "\(.tool)"
                end
            else
                empty
            end
        )
    ] | map(normalize) | map(select(length > 0)) | unique
' "$transcript_path" 2>/dev/null || echo "[]")

# Assistant actions from assistant messages
assistant_actions_from_messages=$(echo "$messages" | jq -c '
    def normalize: (if . == null then "" elif type == "string" then . else tostring end) | gsub("\\s+"; " ") | gsub("^\\s+|\\s+$"; "");
    def clean_line:
        normalize | gsub("^[-*•]\\s+"; "") | gsub("^#+\\s*"; "") |
        gsub("`"; "") | gsub("\\*\\*"; "") | gsub("^@"; "") |
        gsub("[。．.!！?？]+$"; "");
    def is_heading($line):
        ($line | test("^#+\\s+")) or ($line | test("^\\*\\*"));
    def heading_mode($line):
        if $line | test("削除|remove"; "i") then "削除"
        elif $line | test("追加|改善|更新|変更|修正|整理|移行|統一|調整|add|improve|update|refactor|fix"; "i") then "更新"
        else null end;
    def is_boring($line):
        $line | test("完了しました|対応します|確認しました|確認済み|確認した|わかりました|承知しました|了解しました|進めます|やります|します$|します。$|します！$");
    def is_action_line($line):
        ($line | test("修正|変更|追加|削除|更新|実装|対応|改善|整理|移行|統一|調整|作成|導入|削減|簡略化|統合|分割|置換|改名|rename|remove|add|update|fix|refactor|improve|implement|clean|optimi|確認|レビュー|チェック"; "i"))
        and (
            $line | test("\\.[A-Za-z0-9]+") or
            $line | test("セクション|項目|設定|構成|UI|API|ルール|セッション|ダッシュボード|README|docs|USAGE|MD|JSON|TS|JS|CSS|ファイル"; "i")
        );
    def extract_actions($text):
        ($text | split("\n")) as $lines
        | reduce $lines[] as $raw ({mode: null, actions: []};
            ($raw | normalize) as $line
            | if $line == "" then .
              elif is_heading($line) then . + {mode: heading_mode($line)}
              elif $line | test("^[-*•]\\s+") then
                ($line | clean_line) as $item
                | if $item == "" then .
                  elif .mode != null then .actions += ["\(.mode): \($item)"]
                  elif is_action_line($item) and (is_boring($item) | not) then .actions += [$item]
                  else .
                  end
              else
                ($line | clean_line) as $plain
                | if is_action_line($plain) and (is_boring($plain) | not) then .actions += [$plain] else . end
              end
        )
        | .actions;
    def unique_ordered:
        reduce .[] as $item ([]; if index($item) then . else . + [$item] end);

    [
        .[] |
        select(.type == "assistant") |
        (.content // "") |
        extract_actions(.)
    ] | add // [] | unique_ordered
')

assistant_actions=$(jq -c -n --argjson a "$assistant_actions_from_tools" --argjson b "$assistant_actions_from_messages" '
    def unique_ordered:
        reduce .[] as $item ([]; if index($item) then . else . + [$item] end);
    ($a + $b) | unique_ordered
')

# Web links from assistant messages and tool results
links_from_messages=$(echo "$messages" | jq -c '
    def extract_links($text):
        ($text | scan("https?://[^\\s)\\]}>]+"));
    reduce [
        .[] |
        select(.type == "assistant") |
        [(.content // ""), (.thinking // "")] |
        map(extract_links(.))
    ][] as $links ([]; . + $links)
    | unique
')

links_from_tools=$(jq -s -c '
    def extract_links($text):
        ($text | scan("https?://[^\\s)\\]}>]+"));
    reduce [
        .[] |
        select(.type == "tool_result") |
        [(.output // ""), (.content // "")] |
        map(extract_links(.))
    ][] as $links ([]; . + $links)
    | unique
' "$transcript_path" 2>/dev/null || echo "[]")

web_links=$(jq -c -n --argjson a "$links_from_messages" --argjson b "$links_from_tools" '$a + $b | unique')

# Extract tags from message content
tags=$(echo "$messages" | jq -r '
    [.[] | (.content // "" | tostring)] | join(" ") | ascii_downcase |
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

files_modified_paths=$(echo "$files_modified" | jq -c '[.[] | .path]')

# Build partial session JSON
session_json=$(jq -n \
    --arg id "$file_id" \
    --arg sessionId "$session_id" \
    --arg createdAt "$now" \
    --arg branch "$current_branch" \
    --arg projectDir "$cwd" \
    --argjson tags "$tags" \
    --arg summaryTitle "$summary_title" \
    --argjson userRequests "$user_requests" \
    --argjson assistantActions "$assistant_actions" \
    --argjson webLinks "$web_links" \
    --argjson filesModifiedPaths "$files_modified_paths" \
    --argjson keyDecisions "[]" \
    --argjson messageCount "$message_count" \
    --argjson userMessageCount "$user_message_count" \
    --argjson assistantMessageCount "$assistant_message_count" \
    --argjson toolUseCount "$tool_use_count" \
    --argjson messages "$messages" \
    --argjson filesModified "$files_modified" \
    --arg compactedAt "$now" \
    --arg compactTrigger "$trigger" \
    '{
        id: $id,
        sessionId: $sessionId,
        createdAt: $createdAt,
        status: "in_progress",
        context: {
            branch: (if $branch == "" then null else $branch end),
            projectDir: $projectDir
        } | with_entries(select(.value != null)),
        tags: $tags,
        summary: {
            title: $summaryTitle,
            userRequests: $userRequests,
            assistantActions: $assistantActions,
            webLinks: $webLinks,
            filesModified: $filesModifiedPaths,
            keyDecisions: $keyDecisions,
            stats: {
                messageCount: $messageCount,
                userMessageCount: $userMessageCount,
                assistantMessageCount: $assistantMessageCount,
                toolUseCount: $toolUseCount
            }
        },
        messages: $messages,
        filesModified: $filesModified,
        compactedAt: $compactedAt,
        compactTrigger: $compactTrigger
    }')

# Save session
session_path="${sessions_dir}/${file_id}.json"
echo "$session_json" > "$session_path"

# Log to stderr
echo "[memoria] Partial session saved to ${session_path}" >&2

exit 0
