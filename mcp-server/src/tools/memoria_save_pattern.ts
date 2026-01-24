import { z } from "zod";
import { addPattern, getGitUser } from "../storage/index.js";
import { successResponse, errorResponse, type ToolResponse } from "./common.js";

export const SavePatternInputSchema = z.object({
  type: z.enum(["good", "bad"]).describe("Whether this is a good or bad pattern"),
  description: z.string().describe("Description of the pattern"),
  example: z.string().optional().describe("Code example demonstrating the pattern"),
  suggestion: z
    .string()
    .optional()
    .describe("Suggestion for improvement (for bad patterns)"),
});

export type SavePatternInput = z.infer<typeof SavePatternInputSchema>;

export const TOOL_DEFINITION = {
  name: "memoria_save_pattern",
  description:
    "Save a coding pattern (good or bad) observed during development.",
  inputSchema: SavePatternInputSchema,
};

export async function handler(input: SavePatternInput): Promise<ToolResponse> {
  try {
    const validated = SavePatternInputSchema.parse(input);

    const gitUser = getGitUser();
    if (!gitUser) {
      return errorResponse(
        "Could not determine Git user. Please configure git user.name and user.email."
      );
    }

    const pattern = await addPattern(gitUser, {
      ...validated,
      source: "manual",
      sourceId: "mcp-tool",
    });

    return successResponse({
      message: "Pattern saved successfully",
      user: gitUser.name,
      patternCount: pattern.patterns.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
