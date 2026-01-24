import { getPatterns } from "@/lib/memoria/patterns";
import { PatternList } from "@/components/patterns/pattern-list";

export default async function PatternsPage() {
  const patterns = await getPatterns();
  const totalPatterns = patterns.reduce((sum, p) => sum + p.patterns.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Patterns</h1>
        <p className="text-sm text-muted-foreground">
          {totalPatterns} pattern{totalPatterns !== 1 ? "s" : ""} from{" "}
          {patterns.length} user{patterns.length !== 1 ? "s" : ""}
        </p>
      </div>
      <PatternList patterns={patterns} />
    </div>
  );
}
