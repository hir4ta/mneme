import { getDecisions } from "@/lib/memoria/decisions";
import { DecisionList } from "@/components/decisions/decision-list";

export default async function DecisionsPage() {
  const decisions = await getDecisions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Decisions</h1>
        <p className="text-sm text-muted-foreground">
          {decisions.length} decision{decisions.length !== 1 ? "s" : ""}
        </p>
      </div>
      <DecisionList decisions={decisions} />
    </div>
  );
}
