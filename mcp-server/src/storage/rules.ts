import { getRulesPath } from "./paths.js";
import { readJson, writeJson } from "./json-file.js";
import {
  RulesSchema,
  AddRuleInputSchema,
  type Rules,
  type RuleItem,
  type AddRuleInput,
} from "../schemas/index.js";

const RULES_ID = "coding-standards";

export async function getRules(): Promise<Rules> {
  const data = await readJson<Rules>(getRulesPath());

  if (!data) {
    // Return empty rules structure
    const now = new Date().toISOString();
    return {
      id: RULES_ID,
      createdAt: now,
      updatedAt: now,
      rules: [],
    };
  }

  return RulesSchema.parse(data);
}

export async function addRule(ruleInput: AddRuleInput): Promise<Rules> {
  const validated = AddRuleInputSchema.parse(ruleInput);

  const existing = await getRules();
  const now = new Date().toISOString();

  const updated: Rules = {
    ...existing,
    rules: [...existing.rules, validated],
    updatedAt: now,
  };

  RulesSchema.parse(updated);
  await writeJson(getRulesPath(), updated);
  return updated;
}

export async function updateRule(
  index: number,
  ruleItem: RuleItem
): Promise<Rules | null> {
  const existing = await getRules();

  if (index < 0 || index >= existing.rules.length) {
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

  RulesSchema.parse(updated);
  await writeJson(getRulesPath(), updated);
  return updated;
}

export async function removeRule(index: number): Promise<Rules | null> {
  const existing = await getRules();

  if (index < 0 || index >= existing.rules.length) {
    return null;
  }

  const now = new Date().toISOString();
  const updatedRules = existing.rules.filter((_, i) => i !== index);

  const updated: Rules = {
    ...existing,
    rules: updatedRules,
    updatedAt: now,
  };

  RulesSchema.parse(updated);
  await writeJson(getRulesPath(), updated);
  return updated;
}
