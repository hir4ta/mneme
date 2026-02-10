export const getOpenAIKey = (): string | null => {
  return process.env.OPENAI_API_KEY || null;
};

export function getTopTags(
  sessions: { tags?: string[] }[],
  limit: number,
): { name: string; count: number }[] {
  const tagCount: Record<string, number> = {};
  for (const session of sessions) {
    for (const tag of session.tags || []) {
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    }
  }
  return Object.entries(tagCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function getSessionTypeBreakdown(
  sessions: { sessionType?: string | null }[],
): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const session of sessions) {
    const type = session.sessionType || "unknown";
    breakdown[type] = (breakdown[type] || 0) + 1;
  }
  return breakdown;
}

export function buildSummaryPrompt(
  sessions: { title: string; sessionType?: string | null; tags?: string[] }[],
  decisions: { title: string; status: string }[],
): string {
  const sessionList = sessions
    .map((s) => `- ${s.title} (${s.sessionType || "unknown"})`)
    .join("\n");
  const decisionList = decisions
    .map((d) => `- ${d.title} (${d.status})`)
    .join("\n");

  return `Provide a brief weekly development summary (2-3 sentences) based on this activity:

Sessions (${sessions.length}):
${sessionList || "None"}

Decisions (${decisions.length}):
${decisionList || "None"}

Focus on key accomplishments and patterns.`;
}

export async function generateAISummary(
  apiKey: string,
  prompt: string,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error("OpenAI API request failed");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Unable to generate summary.";
}
