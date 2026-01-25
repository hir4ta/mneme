import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteSession, getSession, updateSession } from "@/lib/api";
import type { Session } from "@/lib/types";

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const [editTags, setEditTags] = useState("");

  useEffect(() => {
    if (!id) return;
    getSession(id)
      .then((data) => {
        setSession(data);
        setEditSummary(data.summary);
        setEditTags(data.tags.join(", "));
        setError(null);
      })
      .catch(() => setError("Failed to load session"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!session || !id) return;
    try {
      const updated = await updateSession(id, {
        ...session,
        summary: editSummary,
        tags: editTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setSession(updated);
      setIsEditing(false);
    } catch {
      alert("Failed to save");
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm("Delete this session?")) return;
    try {
      await deleteSession(id);
      navigate("/");
    } catch {
      alert("Failed to delete");
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (error || !session) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{error || "Session not found"}</p>
        <Link to="/" className="text-primary underline mt-4 block">
          Back to sessions
        </Link>
      </div>
    );
  }

  const date = new Date(session.endedAt || session.createdAt).toLocaleString(
    "ja-JP",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            &larr; Back
          </Link>
          <h1 className="text-2xl font-bold">Session Detail</h1>
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
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                className="text-lg font-bold"
              />
            ) : (
              session.summary
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">User:</span>{" "}
              {session.user.name}
            </div>
            <div>
              <span className="text-muted-foreground">Date:</span> {date}
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>{" "}
              <Badge
                variant={
                  session.status === "completed" ? "default" : "secondary"
                }
              >
                {session.status}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Branch:</span>{" "}
              <span className="font-mono">
                {session.context.branch || "N/A"}
              </span>
            </div>
          </div>

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
                {session.tags.length > 0 ? (
                  session.tags.map((tag) => (
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

      {session.filesModified.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Files Modified</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm font-mono">
              {session.filesModified.map((file) => (
                <li
                  key={`${file.action}:${file.path}`}
                  className="flex items-center gap-2"
                >
                  <Badge
                    variant={
                      file.action === "created"
                        ? "default"
                        : file.action === "deleted"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-xs"
                  >
                    {file.action}
                  </Badge>
                  {file.path}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Messages ({session.messages.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {session.messages.map((msg) => (
              <div
                key={`${msg.type}-${msg.timestamp}`}
                className={`p-4 rounded-lg ${
                  msg.type === "user" ? "bg-muted" : "bg-card border"
                }`}
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Badge
                    variant={msg.type === "user" ? "outline" : "secondary"}
                  >
                    {msg.type}
                  </Badge>
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString("ja-JP")}
                  </span>
                </div>
                {msg.thinking && (
                  <details className="mb-2">
                    <summary className="text-sm text-muted-foreground cursor-pointer">
                      Thinking...
                    </summary>
                    <pre className="text-xs bg-muted p-2 rounded mt-1 whitespace-pre-wrap overflow-x-auto">
                      {msg.thinking}
                    </pre>
                  </details>
                )}
                <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
