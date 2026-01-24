import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { getDecision, updateDecision, deleteDecision } from "@/lib/api";
import type { Decision } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DecisionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDecision, setEditDecision] = useState("");
  const [editReasoning, setEditReasoning] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editStatus, setEditStatus] = useState<Decision["status"]>("active");

  useEffect(() => {
    if (!id) return;
    getDecision(id)
      .then((data) => {
        setDecision(data);
        setEditTitle(data.title);
        setEditDecision(data.decision);
        setEditReasoning(data.reasoning);
        setEditTags(data.tags.join(", "));
        setEditStatus(data.status);
        setError(null);
      })
      .catch(() => setError("Failed to load decision"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!decision || !id) return;
    try {
      const updated = await updateDecision(id, {
        ...decision,
        title: editTitle,
        decision: editDecision,
        reasoning: editReasoning,
        tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
        status: editStatus,
      });
      setDecision(updated);
      setIsEditing(false);
    } catch {
      alert("Failed to save");
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm("Delete this decision?")) return;
    try {
      await deleteDecision(id);
      navigate("/decisions");
    } catch {
      alert("Failed to delete");
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (error || !decision) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{error || "Decision not found"}</p>
        <Link to="/decisions" className="text-primary underline mt-4 block">
          Back to decisions
        </Link>
      </div>
    );
  }

  const date = new Date(decision.createdAt).toLocaleString("ja-JP");

  const statusColors = {
    draft: "outline",
    active: "default",
    superseded: "secondary",
    deprecated: "destructive",
  } as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/decisions"
            className="text-muted-foreground hover:text-foreground"
          >
            &larr; Back
          </Link>
          <h1 className="text-2xl font-bold">Decision Detail</h1>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>Save</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {isEditing ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-lg font-bold"
              />
            ) : (
              decision.title
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">User:</span>{" "}
              {decision.user.name}
            </div>
            <div>
              <span className="text-muted-foreground">Date:</span> {date}
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>{" "}
              {isEditing ? (
                <select
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(e.target.value as Decision["status"])
                  }
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="superseded">Superseded</option>
                  <option value="deprecated">Deprecated</option>
                </select>
              ) : (
                <Badge variant={statusColors[decision.status]}>
                  {decision.status}
                </Badge>
              )}
            </div>
            {decision.source && (
              <div>
                <span className="text-muted-foreground">Source:</span>{" "}
                <Badge variant="outline">
                  {decision.source === "auto" ? "Auto-detected" : "Manual"}
                </Badge>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">
              Decision
            </h3>
            {isEditing ? (
              <textarea
                value={editDecision}
                onChange={(e) => setEditDecision(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm min-h-[100px]"
              />
            ) : (
              <p className="whitespace-pre-wrap">{decision.decision}</p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">
              Reasoning
            </h3>
            {isEditing ? (
              <textarea
                value={editReasoning}
                onChange={(e) => setEditReasoning(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm min-h-[100px]"
              />
            ) : (
              <p className="whitespace-pre-wrap">{decision.reasoning}</p>
            )}
          </div>

          {decision.alternatives.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Alternatives Considered
              </h3>
              <ul className="space-y-2">
                {decision.alternatives.map((alt, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{alt.option}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      - {alt.rejected}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <span className="text-muted-foreground text-sm">Tags:</span>
            {isEditing ? (
              <Input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
                className="mt-1"
              />
            ) : (
              <div className="flex flex-wrap gap-1 mt-1">
                {decision.tags.length > 0 ? (
                  decision.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground text-sm">No tags</span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
