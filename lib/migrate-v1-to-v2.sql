-- Migration script: v1 (project-local) to v2 (global)
-- This script adds new columns to existing tables for global DB support
-- Run on existing local.db before merging into global.db

-- Add new columns to interactions table
ALTER TABLE interactions ADD COLUMN project_path TEXT;
ALTER TABLE interactions ADD COLUMN repository TEXT;
ALTER TABLE interactions ADD COLUMN repository_url TEXT;
ALTER TABLE interactions ADD COLUMN repository_root TEXT;

-- Add new columns to pre_compact_backups table
ALTER TABLE pre_compact_backups ADD COLUMN project_path TEXT;

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_interactions_project ON interactions(project_path);
CREATE INDEX IF NOT EXISTS idx_interactions_repository ON interactions(repository);
CREATE INDEX IF NOT EXISTS idx_backups_project ON pre_compact_backups(project_path);

-- Create migrations table
CREATE TABLE IF NOT EXISTS migrations (
    project_path TEXT PRIMARY KEY,
    migrated_at TEXT DEFAULT (datetime('now'))
);

-- Update schema version
INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (2, datetime('now'));
