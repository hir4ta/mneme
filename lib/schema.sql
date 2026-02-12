-- mneme SQLite Schema (v4)
-- Project-local database for private interactions
-- Location: .mneme/local.db

-- interactions: 会話履歴（プライベート、プロジェクトローカル）
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,                -- mnemeセッションID（先頭8文字）
    claude_session_id TEXT,                  -- Claude CodeセッションID（フルUUID）
    project_path TEXT NOT NULL,              -- プロジェクトの絶対パス
    repository TEXT,                         -- 表示用: owner/repo
    repository_url TEXT,                     -- 正規化した remote origin URL
    repository_root TEXT,                    -- リポジトリの絶対パス
    owner TEXT NOT NULL,                     -- git config user.name
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    thinking TEXT,
    tool_calls TEXT,                         -- JSON: ツール詳細、planMode情報
    timestamp TEXT NOT NULL,
    is_compact_summary INTEGER DEFAULT 0,
    agent_id TEXT,                           -- サブエージェントID（NULLならメイン）
    agent_type TEXT,                         -- サブエージェントタイプ（Explore, Plan, Bash等）
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_claude_session ON interactions(claude_session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_owner ON interactions(owner);
CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_interactions_project ON interactions(project_path);
CREATE INDEX IF NOT EXISTS idx_interactions_repository ON interactions(repository);
CREATE INDEX IF NOT EXISTS idx_interactions_agent ON interactions(agent_id);

-- session_save_state: インクリメンタル保存の状態追跡
CREATE TABLE IF NOT EXISTS session_save_state (
    claude_session_id TEXT PRIMARY KEY,      -- Claude CodeセッションID（フルUUID）
    mneme_session_id TEXT NOT NULL,          -- mnemeセッションID（先頭8文字）
    project_path TEXT NOT NULL,              -- プロジェクトの絶対パス
    last_saved_timestamp TEXT,               -- 最後に保存したinteractionのtimestamp
    last_saved_line INTEGER DEFAULT 0,       -- トランスクリプトの最後に処理した行数
    is_committed INTEGER DEFAULT 0,          -- /mneme:save で確定済みか
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_save_state_mneme_session ON session_save_state(mneme_session_id);
CREATE INDEX IF NOT EXISTS idx_save_state_project ON session_save_state(project_path);

-- pre_compact_backups: Auto-Compact前のバックアップ（レガシー、後方互換用）
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

-- file_index: ファイル操作インデックス（セッション推薦用）
CREATE TABLE IF NOT EXISTS file_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    file_path TEXT NOT NULL,                -- プロジェクトルートからの相対パス
    tool_name TEXT,                         -- Read, Edit, Write, etc.
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_file_index_session ON file_index(session_id);
CREATE INDEX IF NOT EXISTS idx_file_index_project_file ON file_index(project_path, file_path);

-- schema_version: スキーマバージョン管理
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
);

-- スキーマバージョン 4（インクリメンタル保存対応）
INSERT OR IGNORE INTO schema_version (version) VALUES (4);

-- スキーマバージョン 5（ファイルインデックス追加）
INSERT OR IGNORE INTO schema_version (version) VALUES (5);
