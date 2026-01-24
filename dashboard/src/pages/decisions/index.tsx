import { useState, useEffect } from "react";
import { Link } from "react-router";
import { getDecisions, deleteDecision } from "@/lib/api";
import type { Decision } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function DecisionCard({
  decision,
  onDelete,
}: {
  decision: Decision;
  onDelete: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this decision?")) return;

    setIsDeleting(true);
    try {
      await deleteDecision(decision.id);
      onDelete();
    } catch {
      alert("Failed to delete decision");
    } finally {
      setIsDeleting(false);
    }
  };

  const date = new Date(decision.createdAt).toLocaleDateString("ja-JP");

  const statusColors = {
    draft: "outline",
    active: "default",
    superseded: "secondary",
    deprecated: "destructive",
  } as const;

  return (
    <Link to={`/decisions/${decision.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base font-medium">
              {decision.title}
            </CardTitle>
            <div className="flex items-center gap-2">
              {decision.source === "auto" && (
                <Badge variant="outline" className="text-xs">
                  auto
                </Badge>
              )}
              <Badge variant={statusColors[decision.status]}>
                {decision.status}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-muted-foreground hover:text-destructive"
              >
                {isDeleting ? "..." : "x"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
            {decision.decision}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{decision.user.name}</span>
            <span>-</span>
            <span>{date}</span>
          </div>
          {decision.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {decision.tags.slice(0, 5).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDecisions = async () => {
    try {
      const data = await getDecisions();
      setDecisions(data);
      setError(null);
    } catch {
      setError("Failed to load decisions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDecisions();
  }, []);

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (error) {
    return <div className="text-center py-12 text-destructive">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Decisions</h1>
        <p className="text-sm text-muted-foreground">
          {decisions.length} decision{decisions.length !== 1 ? "s" : ""}
        </p>
      </div>

      {decisions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No decisions found.</p>
          <p className="text-sm mt-2">
            Use /memoria:decision to record design decisions.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {decisions.map((decision) => (
            <DecisionCard
              key={decision.id}
              decision={decision}
              onDelete={fetchDecisions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
