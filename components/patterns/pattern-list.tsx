import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Pattern, PatternItem } from "@/lib/memoria/types";

interface PatternListProps {
  patterns: Pattern[];
}

export function PatternList({ patterns }: PatternListProps) {
  if (patterns.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No patterns detected yet.</p>
        <p className="text-sm mt-2">
          Patterns will appear here as Claude Code learns your coding style.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {patterns.map((pattern) => (
        <Card key={pattern.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              {pattern.user.name}&apos;s Patterns
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Updated {new Date(pattern.updatedAt).toLocaleDateString("ja-JP")}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pattern.patterns.map((item, i) => (
                <PatternItemCard key={item.id || i} item={item} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PatternItemCard({ item }: { item: PatternItem }) {
  const typeColor =
    item.type === "good"
      ? "bg-green-100 text-green-800"
      : "bg-red-100 text-red-800";

  return (
    <div className="border-l-2 border-muted pl-4 py-2">
      <div className="flex items-center gap-2 mb-1">
        <Badge className={typeColor} variant="secondary">
          {item.type === "good" ? "Good" : "Bad"}
        </Badge>
        <span className="text-xs text-muted-foreground capitalize">
          {item.source}
        </span>
      </div>
      <p className="text-sm">{item.description}</p>
      {item.example && (
        <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
          {item.example}
        </pre>
      )}
      {item.suggestion && (
        <p className="mt-2 text-xs text-muted-foreground">
          Suggestion: {item.suggestion}
        </p>
      )}
    </div>
  );
}
