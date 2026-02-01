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
export {
  calculateSimilarity,
  expandAliases,
  levenshtein,
  search
};
