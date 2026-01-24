import { z } from "zod";
import { createDecision, getGitUser } from "../storage/index.js";
import { successResponse, errorResponse, type ToolResponse } from "./common.js";

export const SaveDecisionInputSchema = z.object({
  title: z.string().describe("Title of the design decision"),
  decision: z.string().describe("The decision that was made"),
  reasoning: z.string().describe("Why this decision was made"),
  alternatives: z
    .array(
      z.object({
        option: z.string().describe("Alternative option considered"),
        rejected: z.string().describe("Why this option was rejected"),
      })
    )
    .optional()
    .describe("Alternative options that were considered"),
  tags: z.array(z.string()).optional().describe("Tags for categorization"),
  relatedSessions: z
    .array(z.string())
    .optional()
    .describe("Related session IDs"),
});

export type SaveDecisionInput = z.infer<typeof SaveDecisionInputSchema>;

export const TOOL_DEFINITION = {
  name: "memoria_save_decision",
  description:
    "Save a design decision with its reasoning and any alternatives that were considered.",
  inputSchema: SaveDecisionInputSchema,
};

export async function handler(input: SaveDecisionInput): Promise<ToolResponse> {
  try {
    const validated = SaveDecisionInputSchema.parse(input);

    const gitUser = getGitUser();
    if (!gitUser) {
      return errorResponse(
        "Could not determine Git user. Please configure git user.name and user.email."
      );
    }

    const decision = await createDecision({
      ...validated,
      user: gitUser,
    });

    return successResponse({
      message: "Decision saved successfully",
      id: decision.id,
      title: decision.title,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
