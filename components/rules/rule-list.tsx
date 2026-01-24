import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Rules } from "@/lib/memoria/types";

interface RuleListProps {
  rules: Rules | null;
}

export function RuleList({ rules }: RuleListProps) {
  if (!rules || rules.rules.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No coding rules defined yet.</p>
        <p className="text-sm mt-2">
          Rules will appear here when you add them through the /memoria command.
        </p>
      </div>
    );
  }

  // Group rules by category
  const rulesByCategory = rules.rules.reduce(
    (acc, rule) => {
      const category = rule.category || "General";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(rule);
      return acc;
    },
    {} as Record<string, typeof rules.rules>
  );

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Last updated: {new Date(rules.updatedAt).toLocaleDateString("ja-JP")}
      </p>
      {Object.entries(rulesByCategory).map(([category, categoryRules]) => (
        <Card key={category}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">{category}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryRules.map((rule, i) => (
                <div key={i} className="border-l-2 border-muted pl-4 py-2">
                  <p className="text-sm font-medium">{rule.rule}</p>
                  {rule.example && (
                    <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                      {rule.example}
                    </pre>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Added by {rule.addedBy}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
