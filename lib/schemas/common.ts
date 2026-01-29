import { z } from "zod";

// User schema
export const UserSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
});

export type User = z.infer<typeof UserSchema>;

// Session context schema
export const SessionContextSchema = z.object({
  branch: z.string().nullable().optional(),
  projectDir: z.string(),
  projectName: z.string().optional(),
  repository: z.string().nullable().optional(),
  user: UserSchema.optional(),
});

export type SessionContext = z.infer<typeof SessionContextSchema>;

// PR Source schema - for tracking knowledge extracted from GitHub PRs
export const PRSourceSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  prNumber: z.number(),
  url: z.string(),
  commentId: z.number().optional(),
});

export type PRSource = z.infer<typeof PRSourceSchema>;
