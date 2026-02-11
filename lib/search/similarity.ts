/**
 * Similarity detection utilities for finding duplicates and conflicts
 */

/**
 * Result of similarity check
 */
export interface SimilarityResult {
  isDuplicate: boolean;
  isSimilar: boolean;
  hasConflict: boolean;
  similarity: number;
  matchedItem?: { id: string; text: string };
  conflictReason?: string;
}

/**
 * Extract tokens from text for comparison
 * Normalizes and tokenizes text for Jaccard similarity
 */
export function extractTokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      // Remove punctuation except hyphens in compound words
      .replace(/[^\w\s-]/g, " ")
      // Split on whitespace
      .split(/\s+/)
      // Filter empty tokens and very short tokens
      .filter((token) => token.length > 2)
      // Remove common stop words
      .filter((token) => !STOP_WORDS.has(token))
  );
}

/**
 * Calculate Jaccard similarity between two token sets
 * Returns value between 0 (no overlap) and 1 (identical)
 */
export function jaccardSimilarity(
  tokensA: string[],
  tokensB: string[],
): number {
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

/**
 * Check similarity of a new item against existing items
 */
export function checkSimilarity(
  newText: string,
  existingItems: Array<{ id: string; text: string }>,
  options: {
    duplicateThreshold?: number;
    similarThreshold?: number;
  } = {},
): SimilarityResult {
  const { duplicateThreshold = 0.9, similarThreshold = 0.7 } = options;

  const newTokens = extractTokens(newText);
  let highestSimilarity = 0;
  let bestMatch: { id: string; text: string } | undefined;

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

  // Check for conflict
  const conflictResult = bestMatch
    ? detectConflict(newText, bestMatch.text)
    : { hasConflict: false };

  return {
    isDuplicate,
    isSimilar,
    hasConflict: conflictResult.hasConflict,
    similarity: highestSimilarity,
    matchedItem: isDuplicate || isSimilar ? bestMatch : undefined,
    conflictReason: conflictResult.reason,
  };
}

/**
 * Detect if two texts contain conflicting instructions
 * Looks for patterns like "always X" vs "never X"
 */
export function detectConflict(
  textA: string,
  textB: string,
): { hasConflict: boolean; reason?: string } {
  const normalizedA = textA.toLowerCase();
  const normalizedB = textB.toLowerCase();

  // Check for opposite keywords
  for (const [positive, negative] of ANTONYM_PAIRS) {
    const aHasPositive = positive.test(normalizedA);
    const aHasNegative = negative.test(normalizedA);
    const bHasPositive = positive.test(normalizedB);
    const bHasNegative = negative.test(normalizedB);

    // Check if they give opposite instructions about the same topic
    if ((aHasPositive && bHasNegative) || (aHasNegative && bHasPositive)) {
      // Extract common topic words
      const topicTokensA = extractTokens(normalizedA);
      const topicTokensB = extractTokens(normalizedB);
      const commonTokens = topicTokensA.filter((t) => topicTokensB.includes(t));

      // If there are common topic words, it's likely a conflict
      if (commonTokens.length >= 2) {
        const commonTopic = commonTokens.slice(0, 3).join(", ");
        return {
          hasConflict: true,
          reason: `Conflicting instructions about: ${commonTopic}`,
        };
      }
    }
  }

  return { hasConflict: false };
}

/**
 * Find all similar items in a collection
 */
export function findSimilarItems(
  newText: string,
  existingItems: Array<{ id: string; text: string }>,
  threshold = 0.5,
): Array<{ id: string; text: string; similarity: number }> {
  const newTokens = extractTokens(newText);
  const results: Array<{ id: string; text: string; similarity: number }> = [];

  for (const item of existingItems) {
    const itemTokens = extractTokens(item.text);
    const similarity = jaccardSimilarity(newTokens, itemTokens);

    if (similarity >= threshold) {
      results.push({ ...item, similarity });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity);
}

// Common English stop words to filter out
const STOP_WORDS = new Set([
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
  "whom",
]);

// Antonym pairs for conflict detection
const ANTONYM_PAIRS: Array<[RegExp, RegExp]> = [
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
  [/\baccept\b/, /\breject\b/],
];
