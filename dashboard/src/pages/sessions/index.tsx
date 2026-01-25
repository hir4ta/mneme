import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteSession, getSessions } from "@/lib/api";
import type { Session } from "@/lib/types";

function SessionCard({
  session,
  onDelete,
}: {
  session: Session;
  onDelete: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this session?")) return;

    setIsDeleting(true);
    try {
      await deleteSession(session.id);
      onDelete();
    } catch {
      alert("Failed to delete session");
    } finally {
      setIsDeleting(false);
    }
  };

  const date = new Date(
    session.endedAt || session.createdAt,
  ).toLocaleDateString("ja-JP");

  return (
    <Link to={`/sessions/${session.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <span
                className={
                  session.status === "completed"
                    ? "text-green-600"
                    : "text-blue-600"
                }
              >
                {session.status === "completed" ? "[done]" : "[...]"}
              </span>
              <span className="line-clamp-1">{session.summary}</span>
            </CardTitle>
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
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <span>{session.user.name}</span>
            <span>-</span>
            <span>{date}</span>
            {session.context.branch && (
              <>
                <span>-</span>
                <span className="font-mono text-xs">
                  {session.context.branch}
                </span>
              </>
            )}
          </div>
          {session.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {session.tags.slice(0, 5).map((tag) => (
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

export function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "in_progress"
  >("all");

  const fetchSessions = useCallback(async () => {
    try {
      const data = await getSessions();
      setSessions(data);
      setError(null);
    } catch {
      setError("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (statusFilter !== "all" && session.status !== statusFilter) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSummary = session.summary.toLowerCase().includes(query);
        const matchesTags = session.tags.some((tag) =>
          tag.toLowerCase().includes(query),
        );
        const matchesUser = session.user.name.toLowerCase().includes(query);
        if (!matchesSummary && !matchesTags && !matchesUser) {
          return false;
        }
      }
      return true;
    });
  }, [sessions, searchQuery, statusFilter]);

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (error) {
    return <div className="text-center py-12 text-destructive">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No sessions found.</p>
          <p className="text-sm mt-2">
            Sessions will appear here after using Claude Code with the memoria
            plugin.
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-4 items-center">
            <Input
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "all" | "completed" | "in_progress",
                )
              }
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
            </select>
            {(searchQuery || statusFilter !== "all") && (
              <span className="text-sm text-muted-foreground">
                {filteredSessions.length} of {sessions.length} sessions
              </span>
            )}
          </div>

          {filteredSessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No sessions match your filters.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onDelete={fetchSessions}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
