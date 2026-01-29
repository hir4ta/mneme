// lib/similarity.ts
function extractTokens(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, " ").split(/\s+/).filter((token) => token.length > 2).filter((token) => !STOP_WORDS.has(token));
}
function jaccardSimilarity(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}
function checkSimilarity(newText, existingItems, options = {}) {
  const { duplicateThreshold = 0.9, similarThreshold = 0.7 } = options;
  const newTokens = extractTokens(newText);
  let highestSimilarity = 0;
  let bestMatch;
  for (const item of existingItems) {
    const itemTokens = extractTokens(item.text);
    const similarity = jaccardSimilarity(newTokens, itemTokens);
    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      bestMatch = item;
    }
  }
  const isDuplicate = highestSimilarity >= duplicateThreshold;
  const isSimilar = highestSimilarity >= similarThreshold && !isDuplicate;
  const conflictResult = bestMatch ? detectConflict(newText, bestMatch.text) : { hasConflict: false };
  return {
    isDuplicate,
    isSimilar,
    hasConflict: conflictResult.hasConflict,
    similarity: highestSimilarity,
    matchedItem: isDuplicate || isSimilar ? bestMatch : void 0,
    conflictReason: conflictResult.reason
  };
}
function detectConflict(textA, textB) {
  const normalizedA = textA.toLowerCase();
  const normalizedB = textB.toLowerCase();
  for (const [positive, negative] of ANTONYM_PAIRS) {
    const aHasPositive = positive.test(normalizedA);
    const aHasNegative = negative.test(normalizedA);
    const bHasPositive = positive.test(normalizedB);
    const bHasNegative = negative.test(normalizedB);
    if (aHasPositive && bHasNegative || aHasNegative && bHasPositive) {
      const topicTokensA = extractTokens(normalizedA);
      const topicTokensB = extractTokens(normalizedB);
      const commonTokens = topicTokensA.filter((t) => topicTokensB.includes(t));
      if (commonTokens.length >= 2) {
        const commonTopic = commonTokens.slice(0, 3).join(", ");
        return {
          hasConflict: true,
          reason: `Conflicting instructions about: ${commonTopic}`
        };
      }
    }
  }
  return { hasConflict: false };
}
function findSimilarItems(newText, existingItems, threshold = 0.5) {
  const newTokens = extractTokens(newText);
  const results = [];
  for (const item of existingItems) {
    const itemTokens = extractTokens(item.text);
    const similarity = jaccardSimilarity(newTokens, itemTokens);
    if (similarity >= threshold) {
      results.push({ ...item, similarity });
    }
  }
  return results.sort((a, b) => b.similarity - a.similarity);
}
var STOP_WORDS = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "you",
  "your",
  "we",
  "our",
  "they",
  "their",
  "what",
  "which",
  "who",
  "whom"
]);
var ANTONYM_PAIRS = [
  [/\balways\b/, /\bnever\b/],
  [/\buse\b/, /\bavoid\b/],
  [/\bdo\b/, /\bdon'?t\b/],
  [/\bshould\b/, /\bshouldn'?t\b/],
  [/\bmust\b/, /\bmustn'?t\b/],
  [/\brequired\b/, /\bforbidden\b/],
  [/\brecommended\b/, /\bdiscouraged\b/],
  [/\bprefer\b/, /\bavoid\b/],
  [/\benable\b/, /\bdisable\b/],
  [/\binclude\b/, /\bexclude\b/],
  [/\ballow\b/, /\bdisallow\b/],
  [/\baccept\b/, /\breject\b/]
];
export {
  checkSimilarity,
  detectConflict,
  extractTokens,
  findSimilarItems,
  jaccardSimilarity
};
