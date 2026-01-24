import { z } from "zod";
import { listSessions } from "../storage/index.js";
import { successResponse, errorResponse, type ToolResponse } from "./common.js";

export const ListSessionsInputSchema = z.object({
  limit: z.number().optional().describe("Maximum number of sessions to return"),
  branch: z.string().optional().describe("Filter by Git branch name"),
  status: z
    .enum(["completed", "in_progress"])
    .optional()
    .describe("Filter by session status"),
  user: z.string().optional().describe("Filter by user name"),
});

export type ListSessionsInput = z.infer<typeof ListSessionsInputSchema>;

export const TOOL_DEFINITION = {
  name: "memoria_list_sessions",
  description:
    "List saved sessions. Returns a summary of recent sessions including ID, summary, date, status, and tags.",
  inputSchema: ListSessionsInputSchema,
};

export async function handler(input: ListSessionsInput): Promise<ToolResponse> {
  try {
    const validated = ListSessionsInputSchema.parse(input);

    const sessions = await listSessions({
      limit: validated.limit,
      branch: validated.branch,
      status: validated.status,
      user: validated.user,
    });

    // Format as summary (not full session data)
    const summaries = sessions.map((session) => ({
      id: session.id,
      summary: session.summary,
      createdAt: session.createdAt,
      status: session.status,
      tags: session.tags,
      branch: session.context.branch,
      user: session.user.name,
    }));

    return successResponse({
      count: summaries.length,
      sessions: summaries,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
