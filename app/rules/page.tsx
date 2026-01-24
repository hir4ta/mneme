import { getRules } from "@/lib/memoria/rules";
import { RuleList } from "@/components/rules/rule-list";

export default async function RulesPage() {
  const rules = await getRules();
  const ruleCount = rules?.rules.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Coding Rules</h1>
        <p className="text-sm text-muted-foreground">
          {ruleCount} rule{ruleCount !== 1 ? "s" : ""}
        </p>
      </div>
      <RuleList rules={rules} />
    </div>
  );
}
