import { getDecisionsDir, getDecisionPath } from "./paths.js";
import { readJson, writeJson, deleteJson, listJsonFiles } from "./json-file.js";
import { generateDecisionId } from "./id.js";
import {
  DecisionSchema,
  CreateDecisionInputSchema,
  type Decision,
  type CreateDecisionInput,
} from "../schemas/index.js";

export async function createDecision(
  data: CreateDecisionInput
): Promise<Decision> {
  const validated = CreateDecisionInputSchema.parse(data);

  const id = await generateDecisionId(validated.title);
  const now = new Date().toISOString();

  const decision: Decision = {
    ...validated,
    id,
    createdAt: now,
    status: "active",
    alternatives: validated.alternatives ?? [],
    relatedSessions: validated.relatedSessions ?? [],
    tags: validated.tags ?? [],
  };

  // Validate full decision
  DecisionSchema.parse(decision);

  await writeJson(getDecisionPath(id), decision);
  return decision;
}

export async function getDecision(id: string): Promise<Decision | null> {
  const data = await readJson<Decision>(getDecisionPath(id));
  if (!data) return null;

  return DecisionSchema.parse(data);
}

export async function updateDecision(
  id: string,
  data: Partial<Decision>
): Promise<Decision | null> {
  const existing = await getDecision(id);
  if (!existing) return null;

  const updated: Decision = {
    ...existing,
    ...data,
    id: existing.id, // Prevent ID change
    createdAt: existing.createdAt, // Prevent createdAt change
  };

  DecisionSchema.parse(updated);
  await writeJson(getDecisionPath(id), updated);
  return updated;
}

export async function deleteDecision(id: string): Promise<void> {
  await deleteJson(getDecisionPath(id));
}

export interface ListDecisionsOptions {
  limit?: number;
  tag?: string;
  status?: "active" | "superseded" | "deprecated";
}

export async function listDecisions(
  options: ListDecisionsOptions = {}
): Promise<Decision[]> {
  const files = await listJsonFiles(getDecisionsDir());
  const decisions: Decision[] = [];

  for (const file of files) {
    const data = await readJson<Decision>(file);
    if (!data) continue;

    try {
      const decision = DecisionSchema.parse(data);

      // Apply filters
      if (options.tag && !decision.tags.includes(options.tag)) {
        continue;
      }
      if (options.status && decision.status !== options.status) {
        continue;
      }

      decisions.push(decision);
    } catch {
      // Skip invalid decisions
      console.error(`Skipping invalid decision file: ${file}`);
    }
  }

  // Sort by createdAt descending (newest first)
  decisions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Apply limit
  if (options.limit && options.limit > 0) {
    return decisions.slice(0, options.limit);
  }

  return decisions;
}

export interface DecisionSearchResult {
  decision: Decision;
  score: number;
  matches: string[];
}

export async function searchDecisions(
  query: string
): Promise<DecisionSearchResult[]> {
  const decisions = await listDecisions();
  const results: DecisionSearchResult[] = [];
  const queryLower = query.toLowerCase();

  for (const decision of decisions) {
    let score = 0;
    const matches: string[] = [];

    // Check title
    if (decision.title.toLowerCase().includes(queryLower)) {
      score += 5;
      matches.push("title");
    }

    // Check decision content
    if (decision.decision.toLowerCase().includes(queryLower)) {
      score += 3;
      matches.push("decision");
    }

    // Check reasoning
    if (decision.reasoning.toLowerCase().includes(queryLower)) {
      score += 2;
      matches.push("reasoning");
    }

    // Check tags
    for (const tag of decision.tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += 1;
        matches.push(`tag:${tag}`);
      }
    }

    if (score > 0) {
      results.push({ decision, score, matches });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}
