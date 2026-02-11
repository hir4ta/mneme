#!/usr/bin/env node

// lib/prompt-search.ts
import * as fs6 from "node:fs";
import * as path6 from "node:path";

// lib/approved-rules-search.ts
import * as fs4 from "node:fs";
import * as path4 from "node:path";

// lib/search-helpers.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";

// lib/fuzzy-search.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";

// lib/utils.ts
import * as fs from "node:fs";
import * as path from "node:path";
function safeReadJson(filePath, fallback) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}
function findJsonFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (item.name.endsWith(".json")) {
      results.push(fullPath);
    }
  }
  return results;
}

// lib/fuzzy-search.ts
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        // deletion
        matrix[i][j - 1] + 1,
        // insertion
        matrix[i - 1][j - 1] + cost
        // substitution
      );
    }
  }
  return matrix[a.length][b.length];
}
function expandAliases(query, tags) {
  const results = /* @__PURE__ */ new Set([query]);
  const lowerQuery = query.toLowerCase();
  for (const tag of tags) {
    const allTerms = [tag.id, tag.label, ...tag.aliases].map(
      (t) => t.toLowerCase()
    );
    if (allTerms.includes(lowerQuery)) {
      results.add(tag.id);
      results.add(tag.label);
      for (const alias of tag.aliases) {
        results.add(alias);
      }
    }
  }
  return Array.from(results);
}
function calculateSimilarity(text, query) {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerText === lowerQuery) return 10;
  if (lowerText.includes(lowerQuery)) return 5;
  if (lowerQuery.includes(lowerText)) return 3;
  const distance = levenshtein(lowerText, lowerQuery);
  if (distance <= 2) return 2;
  if (distance <= 3) return 1;
  return 0;
}
async function search(options) {
  const {
    query,
    mnemeDir,
    targets = ["sessions", "decisions"],
    limit = 20,
    timeout = 1e4
  } = options;
  const startTime = Date.now();
  const results = [];
  const tagsPath = path2.join(mnemeDir, "tags.json");
  const tagsData = safeReadJson(tagsPath, { tags: [] });
  const expandedQueries = expandAliases(query, tagsData.tags);
  if (targets.includes("sessions")) {
    const sessionsDir = path2.join(mnemeDir, "sessions");
    if (fs2.existsSync(sessionsDir)) {
      const files = findJsonFiles(sessionsDir);
      for (const file of files) {
        if (Date.now() - startTime > timeout) break;
        const session = safeReadJson(file, {});
        const score = scoreDocument(session, expandedQueries, [
          "title",
          "goal",
          "tags"
        ]);
        if (score > 0) {
          results.push({
            type: "session",
            id: session.id || path2.basename(file, ".json"),
            score,
            title: session.title || "Untitled",
            highlights: []
          });
        }
      }
    }
  }
  if (targets.includes("decisions")) {
    const decisionsDir = path2.join(mnemeDir, "decisions");
    if (fs2.existsSync(decisionsDir)) {
      const files = findJsonFiles(decisionsDir);
      for (const file of files) {
        if (Date.now() - startTime > timeout) break;
        const decision = safeReadJson(file, {});
        const score = scoreDocument(decision, expandedQueries, [
          "title",
          "decision",
          "tags"
        ]);
        if (score > 0) {
          results.push({
            type: "decision",
            id: decision.id || path2.basename(file, ".json"),
            score,
            title: decision.title || "Untitled",
            highlights: []
          });
        }
      }
    }
  }
  if (targets.includes("patterns")) {
    const patternsDir = path2.join(mnemeDir, "patterns");
    if (fs2.existsSync(patternsDir)) {
      const files = findJsonFiles(patternsDir);
      for (const file of files) {
        if (Date.now() - startTime > timeout) break;
        const pattern = safeReadJson(file, {});
        const patterns = pattern.patterns || [];
        for (const p of patterns) {
          const score = scoreDocument(p, expandedQueries, [
            "description",
            "errorPattern",
            "tags"
          ]);
          if (score > 0) {
            results.push({
              type: "pattern",
              id: `${path2.basename(file, ".json")}-${p.type || "unknown"}`,
              score,
              title: p.description || "Untitled pattern",
              highlights: []
            });
          }
        }
      }
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
function scoreDocument(doc, queries, fields) {
  let totalScore = 0;
  for (const field of fields) {
    const value = doc[field];
    if (typeof value === "string") {
      for (const q of queries) {
        totalScore += calculateSimilarity(value, q);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          for (const q of queries) {
            totalScore += calculateSimilarity(item, q);
          }
        }
      }
    }
  }
  return totalScore;
}
var isMain = process.argv[1]?.endsWith("fuzzy-search.js") || process.argv[1]?.endsWith("fuzzy-search.ts");
if (isMain && process.argv.length > 2) {
  const args = process.argv.slice(2);
  const queryIndex = args.indexOf("--query");
  const query = queryIndex !== -1 ? args[queryIndex + 1] : "";
  const mnemeDir = `${process.cwd()}/.mneme`;
  if (!query) {
    console.error(JSON.stringify({ success: false, error: "Missing --query" }));
    process.exit(0);
  }
  search({ query, mnemeDir }).then((results) => {
    console.log(JSON.stringify({ success: true, results }));
  }).catch((error) => {
    console.error(JSON.stringify({ success: false, error: String(error) }));
  });
}

// lib/search-helpers.ts
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function countMatches(text, pattern) {
  const matches = text.match(new RegExp(pattern.source, "gi"));
  return matches ? matches.length : 0;
}
function fieldScore(text, pattern, baseScore) {
  if (!text) return 0;
  const count = countMatches(text, pattern);
  if (count === 0) return 0;
  return baseScore + (count > 1 ? Math.log2(count) * 0.5 : 0);
}
function isFuzzyMatch(word, target, maxDistance = 2) {
  if (word.length < 4) return false;
  const distance = levenshtein(word.toLowerCase(), target.toLowerCase());
  const threshold = Math.min(maxDistance, Math.floor(word.length / 3));
  return distance <= threshold;
}
function loadTags(mnemeDir) {
  const tagsPath = path3.join(mnemeDir, "tags.json");
  if (!fs3.existsSync(tagsPath)) return null;
  try {
    return JSON.parse(fs3.readFileSync(tagsPath, "utf-8"));
  } catch {
    return null;
  }
}
function expandKeywordsWithAliases(keywords, tags) {
  if (!tags) return keywords;
  const expanded = new Set(keywords.map((k) => k.toLowerCase()));
  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    for (const tag of tags.tags) {
      const matches = tag.id.toLowerCase() === lowerKeyword || tag.label.toLowerCase() === lowerKeyword || tag.aliases?.some((alias) => alias.toLowerCase() === lowerKeyword);
      if (!matches) continue;
      expanded.add(tag.id.toLowerCase());
      expanded.add(tag.label.toLowerCase());
      for (const alias of tag.aliases || []) {
        expanded.add(alias.toLowerCase());
      }
    }
  }
  return Array.from(expanded);
}
function walkJsonFiles(dir, callback) {
  if (!fs3.existsSync(dir)) return;
  const entries = fs3.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path3.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(fullPath, callback);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      callback(fullPath);
    }
  }
}

// lib/approved-rules-search.ts
function isApproved(status) {
  if (typeof status !== "string") return false;
  const s = status.toLowerCase();
  return s === "approved" || s === "active";
}
function priorityBoost(priority) {
  if (priority === "p0") return 2;
  if (priority === "p1") return 1;
  return 0;
}
function searchRuleFiles(mnemeDir, pattern) {
  const results = [];
  const rulesDir = path4.join(mnemeDir, "rules");
  if (!fs4.existsSync(rulesDir)) return results;
  for (const fileName of ["dev-rules.json", "review-guidelines.json"]) {
    const filePath = path4.join(rulesDir, fileName);
    if (!fs4.existsSync(filePath)) continue;
    try {
      const doc = JSON.parse(fs4.readFileSync(filePath, "utf-8"));
      const items = doc.items || doc.rules || [];
      for (const item of items) {
        if (!isApproved(item.status)) continue;
        let score = 0;
        const matched = [];
        const textScore = fieldScore(item.text, pattern, 4);
        if (textScore > 0) {
          score += textScore;
          matched.push("text");
        }
        const keyScore = fieldScore(item.key, pattern, 3);
        if (keyScore > 0) {
          score += keyScore;
          matched.push("key");
        }
        if (item.tags?.some((t) => pattern.test(t))) {
          score += 1;
          matched.push("tags");
        }
        score += priorityBoost(item.priority);
        if (score > 0) {
          results.push({
            sourceType: "rule",
            id: item.id || item.key || "",
            title: item.text || item.key || "",
            text: item.text || "",
            priority: item.priority,
            tags: item.tags || [],
            score,
            matchedFields: matched
          });
        }
      }
    } catch {
    }
  }
  return results;
}
function searchDecisionFiles(mnemeDir, pattern) {
  const results = [];
  const decisionsDir = path4.join(mnemeDir, "decisions");
  walkJsonFiles(decisionsDir, (filePath) => {
    try {
      const doc = JSON.parse(fs4.readFileSync(filePath, "utf-8"));
      if (!isApproved(doc.status)) return;
      let score = 0;
      const matched = [];
      const titleScore = fieldScore(doc.title, pattern, 3);
      if (titleScore > 0) {
        score += titleScore;
        matched.push("title");
      }
      const decisionScore = fieldScore(doc.decision, pattern, 4);
      if (decisionScore > 0) {
        score += decisionScore;
        matched.push("decision");
      }
      const reasoningScore = fieldScore(doc.reasoning, pattern, 2);
      if (reasoningScore > 0) {
        score += reasoningScore;
        matched.push("reasoning");
      }
      if (doc.tags?.some((t) => pattern.test(t))) {
        score += 1;
        matched.push("tags");
      }
      if (score > 0) {
        results.push({
          sourceType: "decision",
          id: doc.id || "",
          title: doc.title || "",
          text: doc.decision || doc.title || "",
          tags: doc.tags || [],
          score,
          matchedFields: matched
        });
      }
    } catch {
    }
  });
  return results;
}
function searchPatternFiles(mnemeDir, pattern) {
  const results = [];
  const patternsDir = path4.join(mnemeDir, "patterns");
  walkJsonFiles(patternsDir, (filePath) => {
    try {
      const doc = JSON.parse(fs4.readFileSync(filePath, "utf-8"));
      const items = doc.items || doc.patterns || [];
      for (const item of items) {
        if (!isApproved(item.status)) continue;
        let score = 0;
        const matched = [];
        const titleScore = fieldScore(item.title, pattern, 3);
        if (titleScore > 0) {
          score += titleScore;
          matched.push("title");
        }
        const patternScore = fieldScore(item.pattern, pattern, 3);
        if (patternScore > 0) {
          score += patternScore;
          matched.push("pattern");
        }
        if (item.tags?.some((t) => pattern.test(t))) {
          score += 1;
          matched.push("tags");
        }
        if (score > 0) {
          results.push({
            sourceType: "pattern",
            id: item.id || "",
            title: item.title || "",
            text: item.pattern || item.title || "",
            tags: item.tags || [],
            score,
            matchedFields: matched
          });
        }
      }
    } catch {
    }
  });
  return results;
}
function searchApprovedRules(options) {
  const { query, mnemeDir, limit = 5 } = options;
  const keywords = query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 2);
  if (keywords.length === 0) return [];
  const expanded = expandKeywordsWithAliases(keywords, loadTags(mnemeDir));
  const pattern = new RegExp(expanded.map(escapeRegex).join("|"), "i");
  const results = [
    ...searchRuleFiles(mnemeDir, pattern),
    ...searchDecisionFiles(mnemeDir, pattern),
    ...searchPatternFiles(mnemeDir, pattern)
  ];
  const seen = /* @__PURE__ */ new Set();
  return results.sort((a, b) => b.score - a.score).filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  }).slice(0, limit);
}

// lib/search-core.ts
import * as fs5 from "node:fs";
import * as path5 from "node:path";
function searchInteractions(keywords, projectPath, database, limit = 5) {
  if (!database) return [];
  try {
    const stmt = database.prepare(`
      SELECT
        i.session_id,
        i.content,
        i.timestamp,
        highlight(interactions_fts, 0, '[', ']') as content_highlight
      FROM interactions_fts
      JOIN interactions i ON interactions_fts.rowid = i.id
      WHERE interactions_fts MATCH ?
        AND i.project_path = ?
      ORDER BY rank
      LIMIT ?
    `);
    const rows = stmt.all(keywords.join(" OR "), projectPath, limit);
    return rows.map((row) => ({
      type: "interaction",
      id: row.session_id,
      title: `Interaction from ${row.timestamp}`,
      snippet: (row.content_highlight || row.content).substring(0, 150),
      score: 5,
      matchedFields: ["content"]
    }));
  } catch {
    try {
      const clauses = keywords.map(() => "(content LIKE ? OR thinking LIKE ?)");
      const sql = `
        SELECT DISTINCT session_id, substr(content, 1, 120) as snippet, timestamp
        FROM interactions
        WHERE project_path = ?
          AND (${clauses.join(" OR ")})
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      const args = [projectPath];
      for (const keyword of keywords) {
        const pattern = `%${keyword}%`;
        args.push(pattern, pattern);
      }
      args.push(limit);
      const stmt = database.prepare(sql);
      const rows = stmt.all(...args);
      return rows.map((row) => ({
        type: "interaction",
        id: row.session_id,
        title: `Interaction from ${row.timestamp}`,
        snippet: row.snippet,
        score: 3,
        matchedFields: ["content"]
      }));
    } catch {
      return [];
    }
  }
}
function searchSessions(mnemeDir, keywords, limit = 5) {
  const sessionsDir = path5.join(mnemeDir, "sessions");
  const results = [];
  const pattern = new RegExp(keywords.map(escapeRegex).join("|"), "i");
  walkJsonFiles(sessionsDir, (filePath) => {
    try {
      const session = JSON.parse(
        fs5.readFileSync(filePath, "utf-8")
      );
      const title = session.title || session.summary?.title || "";
      let score = 0;
      const matchedFields = [];
      const titleScore = fieldScore(title, pattern, 3);
      if (titleScore > 0) {
        score += titleScore;
        matchedFields.push("title");
      }
      if (session.tags?.some((t) => pattern.test(t))) {
        score += 1;
        matchedFields.push("tags");
      }
      const goalScore = fieldScore(session.summary?.goal, pattern, 2);
      if (goalScore > 0) {
        score += goalScore;
        matchedFields.push("summary.goal");
      }
      const descScore = fieldScore(session.summary?.description, pattern, 2);
      if (descScore > 0) {
        score += descScore;
        matchedFields.push("summary.description");
      }
      if (session.discussions?.some(
        (d) => pattern.test(d.topic || "") || pattern.test(d.decision || "")
      )) {
        score += 2;
        matchedFields.push("discussions");
      }
      if (session.errors?.some(
        (e) => pattern.test(e.error || "") || pattern.test(e.solution || "")
      )) {
        score += 2;
        matchedFields.push("errors");
      }
      if (score === 0 && keywords.length <= 2) {
        const titleWords = (title || "").toLowerCase().split(/\s+/);
        const tagWords = session.tags || [];
        for (const keyword of keywords) {
          if (titleWords.some((w) => isFuzzyMatch(keyword, w))) {
            score += 1;
            matchedFields.push("title~fuzzy");
          }
          if (tagWords.some((t) => isFuzzyMatch(keyword, t))) {
            score += 0.5;
            matchedFields.push("tags~fuzzy");
          }
        }
      }
      if (score > 0) {
        results.push({
          type: "session",
          id: session.id,
          title: title || session.id,
          snippet: session.summary?.description || session.summary?.goal || "",
          score,
          matchedFields
        });
      }
    } catch {
    }
  });
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
function searchKnowledge(options) {
  const {
    query,
    mnemeDir,
    projectPath,
    database = null,
    types = ["session", "interaction"],
    limit = 10,
    offset = 0
  } = options;
  const keywords = query.toLowerCase().split(/\s+/).map((token) => token.trim()).filter((token) => token.length > 2);
  if (keywords.length === 0) return [];
  const expandedKeywords = expandKeywordsWithAliases(
    keywords,
    loadTags(mnemeDir)
  );
  const results = [];
  const safeOffset = Math.max(0, offset);
  const fetchLimit = Math.max(limit + safeOffset, limit, 10);
  const normalizedTypes = new Set(types);
  if (normalizedTypes.has("session")) {
    results.push(...searchSessions(mnemeDir, expandedKeywords, fetchLimit));
  }
  if (normalizedTypes.has("interaction")) {
    results.push(
      ...searchInteractions(
        expandedKeywords,
        projectPath,
        database,
        fetchLimit
      )
    );
  }
  const seen = /* @__PURE__ */ new Set();
  return results.sort((a, b) => b.score - a.score).filter((result) => {
    const key = `${result.type}:${result.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(safeOffset, safeOffset + limit);
}

// lib/prompt-search.ts
var originalEmit = process.emit;
process.emit = (event, ...args) => {
  if (event === "warning" && typeof args[0] === "object" && args[0] !== null && "name" in args[0] && args[0].name === "ExperimentalWarning" && "message" in args[0] && typeof args[0].message === "string" && args[0].message.includes("SQLite")) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args]);
};
var { DatabaseSync } = await import("node:sqlite");
function getArg(args, name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? void 0 : args[index + 1];
}
function main() {
  const args = process.argv.slice(2);
  const query = getArg(args, "query");
  const projectPath = getArg(args, "project");
  const limit = Number.parseInt(getArg(args, "limit") || "5", 10);
  if (!query || !projectPath) {
    console.log(
      JSON.stringify({ success: false, error: "Missing required args" })
    );
    process.exit(1);
  }
  const mnemeDir = path6.join(projectPath, ".mneme");
  const dbPath = path6.join(mnemeDir, "local.db");
  let database = null;
  try {
    if (fs6.existsSync(dbPath)) {
      database = new DatabaseSync(dbPath);
      database.exec("PRAGMA journal_mode = WAL");
    }
    const results = searchKnowledge({
      query,
      mnemeDir,
      projectPath,
      database,
      limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 10)) : 5
    });
    const rules = searchApprovedRules({ query, mnemeDir, limit: 5 });
    console.log(JSON.stringify({ success: true, results, rules }));
  } catch (error) {
    console.log(
      JSON.stringify({ success: false, error: error.message })
    );
    process.exit(1);
  } finally {
    database?.close();
  }
}
main();
