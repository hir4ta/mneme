import { z } from "zod";
import { getSession } from "../storage/index.js";
import { successResponse, errorResponse, type ToolResponse } from "./common.js";

export const GetSessionInputSchema = z.object({
  id: z.string().describe("The session ID to retrieve"),
});

export type GetSessionInput = z.infer<typeof GetSessionInputSchema>;

export const TOOL_DEFINITION = {
  name: "memoria_get_session",
  description:
    "Get full details of a specific session including messages, thinking, and tool uses.",
  inputSchema: GetSessionInputSchema,
};

export async function handler(input: GetSessionInput): Promise<ToolResponse> {
  try {
    const validated = GetSessionInputSchema.parse(input);

    const session = await getSession(validated.id);

    if (!session) {
      return errorResponse(`Session not found: ${validated.id}`);
    }

    return successResponse(session);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
