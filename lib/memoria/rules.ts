import { readFile, writeFile, mkdir } from "node:fs/promises";
import { getRulesDir, getRulesPath } from "./paths";
import type { Rules, RuleItem } from "./types";

export async function getRules(): Promise<Rules | null> {
  try {
    const filePath = getRulesPath();
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as Rules;
  } catch {
    return null;
  }
}

export async function addRule(ruleItem: RuleItem): Promise<Rules> {
  const rulesDir = getRulesDir();
  await mkdir(rulesDir, { recursive: true });

  const existing = await getRules();
  const now = new Date().toISOString();
  const filePath = getRulesPath();

  if (existing) {
    const updated: Rules = {
      ...existing,
      rules: [...existing.rules, ruleItem],
      updatedAt: now,
    };
    await writeFile(filePath, JSON.stringify(updated, null, 2));
    return updated;
  } else {
    const newRules: Rules = {
      id: "coding-standards",
      createdAt: now,
      updatedAt: now,
      rules: [ruleItem],
    };
    await writeFile(filePath, JSON.stringify(newRules, null, 2));
    return newRules;
  }
}

export async function updateRule(
  index: number,
  ruleItem: RuleItem
): Promise<Rules | null> {
  const existing = await getRules();
  if (!existing || index < 0 || index >= existing.rules.length) {
    return null;
  }

  const now = new Date().toISOString();
  const updatedRules = [...existing.rules];
  updatedRules[index] = ruleItem;

  const updated: Rules = {
    ...existing,
    rules: updatedRules,
    updatedAt: now,
  };

  const filePath = getRulesPath();
  await writeFile(filePath, JSON.stringify(updated, null, 2));
  return updated;
}

export async function removeRule(index: number): Promise<Rules | null> {
  const existing = await getRules();
  if (!existing || index < 0 || index >= existing.rules.length) {
    return null;
  }

  const now = new Date().toISOString();
  const updatedRules = existing.rules.filter((_, i) => i !== index);

  const updated: Rules = {
    ...existing,
    rules: updatedRules,
    updatedAt: now,
  };

  const filePath = getRulesPath();
  await writeFile(filePath, JSON.stringify(updated, null, 2));
  return updated;
}
