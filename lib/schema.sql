-- memoria SQLite Schema (v2)
-- Global database for private interactions across all projects
-- Location: ~/.claude/memoria/global.db

-- interactions: 会話履歴（プライベート、全プロジェクト横断）
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project_path TEXT NOT NULL,              -- プロジェクトの絶対パス
    repository TEXT,                         -- 表示用: owner/repo
    repository_url TEXT,                     -- 正規化した remote origin URL
    repository_root TEXT,                    -- リポジトリの絶対パス
    owner TEXT NOT NULL,                     -- git config user.name
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    thinking TEXT,
    tool_calls TEXT,
    timestamp TEXT NOT NULL,
    is_compact_summary INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_owner ON interactions(owner);
CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_interactions_project ON interactions(project_path);
CREATE INDEX IF NOT EXISTS idx_interactions_repository ON interactions(repository);

-- pre_compact_backups: Auto-Compact前のバックアップ
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

-- interactions_fts: 全文検索（FTS5）
CREATE VIRTUAL TABLE IF NOT EXISTS interactions_fts USING fts5(
    content,
    thinking,
    content=interactions,
    content_rowid=id,
    tokenize='unicode61'
);

-- FTS5 triggers for automatic sync
CREATE TRIGGER IF NOT EXISTS interactions_ai AFTER INSERT ON interactions BEGIN
    INSERT INTO interactions_fts(rowid, content, thinking)
    VALUES (new.id, new.content, new.thinking);
END;

CREATE TRIGGER IF NOT EXISTS interactions_ad AFTER DELETE ON interactions BEGIN
    INSERT INTO interactions_fts(interactions_fts, rowid, content, thinking)
    VALUES ('delete', old.id, old.content, old.thinking);
END;

CREATE TRIGGER IF NOT EXISTS interactions_au AFTER UPDATE ON interactions BEGIN
    INSERT INTO interactions_fts(interactions_fts, rowid, content, thinking)
    VALUES ('delete', old.id, old.content, old.thinking);
    INSERT INTO interactions_fts(rowid, content, thinking)
    VALUES (new.id, new.content, new.thinking);
END;

-- interaction_embeddings: セマンティック検索用（将来）
CREATE TABLE IF NOT EXISTS interaction_embeddings (
    interaction_id INTEGER PRIMARY KEY,
    embedding BLOB,
    model TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (interaction_id) REFERENCES interactions(id) ON DELETE CASCADE
);

-- schema_version: スキーマバージョン管理
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
);

-- スキーマバージョン 2（グローバルDB対応）
INSERT OR IGNORE INTO schema_version (version) VALUES (2);
