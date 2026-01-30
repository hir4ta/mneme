---
name: init
description: Initialize memoria in the current project
user-invocable: true
---

# Initialize memoria

<instructions>
Create the `.memoria` directory structure in the current project.

1. Check if `.memoria` already exists - if so, inform the user it's already initialized
2. Create the directory structure:
   - `.memoria/sessions/`
   - `.memoria/rules/`
   - `.memoria/patterns/`
3. Copy default tags from the plugin's `hooks/default-tags.json` to `.memoria/tags.json`
4. Create empty rules files:
   - `.memoria/rules/dev-rules.json`
   - `.memoria/rules/review-guidelines.json`
5. Initialize SQLite database `.memoria/local.db` with the schema

Use this JSON template for the rules files:
```json
{
  "schemaVersion": 1,
  "createdAt": "<current ISO timestamp>",
  "updatedAt": "<current ISO timestamp>",
  "items": []
}
```

For SQLite initialization, run:
```bash
sqlite3 .memoria/local.db < /path/to/memoria/lib/schema.sql
```

Or if schema.sql is not available, create minimal schema:
```bash
sqlite3 .memoria/local.db "
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    thinking TEXT,
    tool_calls TEXT,
    timestamp TEXT NOT NULL,
    is_compact_summary INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_owner ON interactions(owner);

CREATE TABLE IF NOT EXISTS pre_compact_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    interactions TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_backups_session ON pre_compact_backups(session_id);
"
```

After creation, confirm success and explain that memoria will now track sessions in this project.
</instructions>
