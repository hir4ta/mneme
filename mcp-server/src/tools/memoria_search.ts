import { z } from "zod";
import {
  searchSessions,
  searchDecisions,
  listAllPatterns,
} from "../storage/index.js";
import { successResponse, errorResponse, type ToolResponse } from "./common.js";

export const SearchInputSchema = z.object({
  query: z.string().describe("Search query"),
  type: z
    .enum(["session", "decision", "pattern", "all"])
    .optional()
    .default("all")
    .describe("Type of content to search"),
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

export const TOOL_DEFINITION = {
  name: "memoria_search",
  description:
    "Search across sessions, decisions, and patterns. Returns matching results with relevance scores.",
  inputSchema: SearchInputSchema,
};

export async function handler(input: SearchInput): Promise<ToolResponse> {
  try {
    const validated = SearchInputSchema.parse(input);
    const queryLower = validated.query.toLowerCase();

    const results: {
      type: string;
      id: string;
      title: string;
      score: number;
      matches: string[];
    }[] = [];

    // Search sessions
    if (validated.type === "all" || validated.type === "session") {
      const sessionResults = await searchSessions(validated.query);
      for (const result of sessionResults) {
        results.push({
          type: "session",
          id: result.session.id,
          title: result.session.summary,
          score: result.score,
          matches: result.matches,
        });
      }
    }

    // Search decisions
    if (validated.type === "all" || validated.type === "decision") {
      const decisionResults = await searchDecisions(validated.query);
      for (const result of decisionResults) {
        results.push({
          type: "decision",
          id: result.decision.id,
          title: result.decision.title,
          score: result.score,
          matches: result.matches,
        });
      }
    }

    // Search patterns
    if (validated.type === "all" || validated.type === "pattern") {
      const allPatterns = await listAllPatterns();
      for (const pattern of allPatterns) {
        for (const item of pattern.patterns) {
          let score = 0;
          const matches: string[] = [];

          if (item.description.toLowerCase().includes(queryLower)) {
            score += 3;
            matches.push("description");
          }
          if (item.example?.toLowerCase().includes(queryLower)) {
            score += 2;
            matches.push("example");
          }
          if (item.suggestion?.toLowerCase().includes(queryLower)) {
            score += 1;
            matches.push("suggestion");
          }

          if (score > 0) {
            results.push({
              type: "pattern",
              id: item.id || `${pattern.user.name}-pattern`,
              title: item.description,
              score,
              matches,
            });
          }
        }
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    return successResponse({
      query: validated.query,
      count: results.length,
      results,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
