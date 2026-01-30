---
name: init
description: |
  Initialize memoria in the current project by creating .memoria directory structure.
  Use when: (1) setting up memoria in a new project, (2) the project doesn't have .memoria yet.
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
5. Initialize global SQLite database at `~/.claude/memoria/global.db` (if not exists)
   - Note: Data is stored globally, shared across all projects
   - Use `MEMORIA_DATA_DIR` env var to override location

Use this JSON template for the rules files:
```json
{
  "schemaVersion": 1,
  "createdAt": "<current ISO timestamp>",
  "updatedAt": "<current ISO timestamp>",
  "items": []
}
```

For SQLite initialization (global database):
```bash
# Global database location
MEMORIA_DB_DIR="${MEMORIA_DATA_DIR:-$HOME/.claude/memoria}"
mkdir -p "$MEMORIA_DB_DIR"

# Initialize with schema
sqlite3 "$MEMORIA_DB_DIR/global.db" < /path/to/memoria/lib/schema.sql
```

Or if schema.sql is not available, create minimal schema:
```bash
MEMORIA_DB_DIR="${MEMORIA_DATA_DIR:-$HOME/.claude/memoria}"
mkdir -p "$MEMORIA_DB_DIR"

sqlite3 "$MEMORIA_DB_DIR/global.db" "
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    repository TEXT,
    repository_url TEXT,
    repository_root TEXT,
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
CREATE INDEX IF NOT EXISTS idx_interactions_project ON interactions(project_path);
CREATE INDEX IF NOT EXISTS idx_interactions_repo ON interactions(repository);

CREATE TABLE IF NOT EXISTS pre_compact_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    owner TEXT NOT NULL,
    interactions TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_backups_session ON pre_compact_backups(session_id);
CREATE INDEX IF NOT EXISTS idx_backups_project ON pre_compact_backups(project_path);

CREATE TABLE IF NOT EXISTS migrations (
    project_path TEXT PRIMARY KEY,
    migrated_at TEXT DEFAULT (datetime('now'))
);
"
```

**Note:** The global database stores data from all projects. Each interaction includes `project_path` and `repository` fields for filtering.

After creation, confirm success and explain that memoria will now track sessions in this project.
</instructions>
