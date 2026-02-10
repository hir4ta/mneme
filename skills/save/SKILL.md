---
name: save
description: |
  Extract and persist session outputs, then generate development rule candidates (decision/pattern/rule).
  Use when: (1) finishing meaningful implementation work, (2) capturing reusable guidance,
  (3) before ending a long session.
disable-model-invocation: false
---

# /mneme:save

Save session outputs and generate development rule candidates for approval.

## Core intent

`/mneme:save` is a source-writing command. It updates:
- `sessions/`
- `decisions/`
- `patterns/`
- `rules/`

Then development rule candidates should be generated and reviewed inline.

## Required emphasis format (Claude Code safe)

Claude Code docs do not provide a built-in "required badge" syntax for skills.
Use explicit section markers and XML-style tags for hard constraints:

```markdown
<required>
- field A
- field B
</required>
```

Always render missing required fields as blocking errors before write.

## Execution phases

1. **Master session merge**
- Merge linked/resumed child sessions into the master session.

2. **Interactions commit**
- Save transcript interactions to `.mneme/local.db` via `mneme_save_interactions`.
- Do NOT call `mneme_mark_session_committed` yet (wait until after Phase 3).

3. **Session summary extraction (required MCP)**
- Extract from the conversation: `title`, `goal`, `outcome`, `description`, `tags`, `sessionType`.
- Additionally extract **structured context** (auto-compact で失われるデータを保全):
  - `plan`: セッションの目標、タスク一覧（完了は `[x] ` prefix）、残タスク
  - `discussions`: 設計議論（topic, decision, reasoning, alternatives）
  - `errors`: 遭遇したエラーと解決策（error, context, solution, files）
  - `handoff`: 引き継ぎ情報（stoppedReason, notes, nextSteps）
  - `references`: 参照したドキュメントURL、ファイルパス（type, url, path, title, description）
- **MUST call `mneme_update_session_summary`** MCP tool with all extracted data.
  This writes the summary to `.mneme/sessions/` JSON file, ensuring the session is preserved on SessionEnd.
- **Then call `mneme_mark_session_committed`** to finalize the commit.

<required>
- Call `mneme_update_session_summary` with: `claudeSessionId`, `title`, `summary` (`goal`, `outcome`), `tags`, `sessionType`
- Call `mneme_mark_session_committed` AFTER `mneme_update_session_summary` succeeds
- Do NOT skip this step even for short/research sessions
</required>

### Structured context extraction guide

Auto-compact はコンテキストウィンドウの約80%使用時に発動し、古いメッセージを要約で置換します。
以下の情報は要約で失われやすいため、structured data として明示的に保存します。

**plan** — 該当する場合のみ:
- `goals`: セッション開始時に設定された目標
- `tasks`: 実行したタスクリスト。完了済みは `[x] タスク名`、未完了は `[ ] タスク名`
- `remaining`: 次回以降に持ち越すタスク

**discussions** — 設計方針の議論があった場合:
- 「AとBどちらにする？」→「Aにした」のような意思決定を抽出
- `alternatives` に検討して採用しなかった選択肢を記録

**errors** — ビルドエラー、テスト失敗、実行時エラーがあった場合:
- エラーメッセージ、発生コンテキスト、解決策を記録
- 同じエラーに再度遭遇しないための知見として保全

**handoff** — セッション終了時に必ず:
- `stoppedReason`: なぜここで止めるか（完了、時間切れ、ブロッカー等）
- `notes`: 次のセッションで知っておくべき注意点
- `nextSteps`: 次にやるべき具体的アクション

**references** — 外部リソースを参照した場合:
- WebFetch/WebSearch で確認した公式ドキュメントURL
- 重要な参照ファイルパス

4. **Decision extraction (source)**
- Persist concrete choices and rationale to `decisions/YYYY/MM/*.json`.

5. **Pattern extraction (source)**
- Persist repeatable success/failure patterns to `patterns/{user}.json`.

6. **Rule extraction (source)**
- Persist enforceable standards to:
  - `rules/dev-rules.json`
  - `rules/review-guidelines.json`

<required>
- Active rule must include: `id`, `key`, `text`, `category`, `tags`, `priority`, `rationale`
- `priority` must be one of: `p0`, `p1`, `p2`
</required>

7. **開発ルール候補のレポート**
- 保存した decisions/patterns/rules の内容をユーザーに一覧表示。
- status は設定不要（デフォルトで approved）。
- エンジニアがダッシュボードで適用・解除を判断する。
- インライン承認は行わない。

8. **Auto quality checks (required MCP)**
- Run `mneme_rule_linter` (`ruleType: "all"`).
- Run `mneme_search_eval` (`mode: "run"`).

## Source definitions (must follow)

- **Decision**: what option was chosen and why.
- **Pattern**: what repeatedly works or fails.
- **Rule**: what should be enforced in future work.

## Priority rubric (must use)

- `p0`: security/data-loss/outage/compliance break risk
- `p1`: correctness/reliability risk with user impact
- `p2`: maintainability/readability/process quality

When confidence is low, default to `p1` and include rationale.

## Mandatory tags

Each extracted item must include at least one semantic tag.

<required>
- Decision: `tags` required
- Pattern: `tags` required
- Rule: `tags` required
</required>

Recommended controlled tags:
- `security`, `api`, `database`, `testing`, `performance`, `reliability`, `workflow`, `ui`

## Validation gate (must pass)

After writing sources and before rule generation, run:

```bash
npm run validate:sources
```

If validation fails, fix artifacts first, then continue.

## Output to user

Report at minimum:
- interactions saved count
- created/updated counts for decisions/patterns/rules
- validation result (`validate:sources`)
- rule linter result (`mneme_rule_linter`)
- search benchmark result (`mneme_search_eval`)
- saved decisions/patterns/rules summary
