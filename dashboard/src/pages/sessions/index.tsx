import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteSession, getSessions, getTags } from "@/lib/api";
import type { Session, SessionType, Tag } from "@/lib/types";

const SESSION_TYPES: { value: SessionType; label: string }[] = [
  { value: "decision", label: "Decision" },
  { value: "implementation", label: "Implementation" },
  { value: "research", label: "Research" },
  { value: "exploration", label: "Exploration" },
  { value: "discussion", label: "Discussion" },
  { value: "debug", label: "Debug" },
  { value: "review", label: "Review" },
];

function SessionCard({
  session,
  tags,
  onDelete,
}: {
  session: Session;
  tags: Tag[];
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

  const date = new Date(session.createdAt).toLocaleDateString("ja-JP");
  const userName = session.context.user?.name || "unknown";
  const interactionCount = session.interactions?.length || 0;

  // Get tag color from tags.json
  const getTagColor = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId);
    return tag?.color || "#6B7280";
  };

  return (
    <Link to={`/sessions/${session.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <span className="line-clamp-1">
                {session.title || "Untitled session"}
              </span>
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
            <span>{userName}</span>
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
            {session.sessionType && (
              <>
                <span>-</span>
                <Badge variant="outline" className="text-xs font-normal">
                  {session.sessionType}
                </Badge>
              </>
            )}
            {interactionCount > 0 && (
              <>
                <span>-</span>
                <span className="text-xs">
                  {interactionCount} interaction
                  {interactionCount !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
          {session.goal && (
            <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
              {session.goal}
            </p>
          )}
          {session.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {session.tags.slice(0, 5).map((tagId) => (
                <Badge
                  key={tagId}
                  variant="secondary"
                  className="text-xs"
                  style={{
                    backgroundColor: `${getTagColor(tagId)}20`,
                    color: getTagColor(tagId),
                    borderColor: getTagColor(tagId),
                  }}
                >
                  {tagId}
                </Badge>
              ))}
              {session.tags.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{session.tags.length - 5}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const fetchData = useCallback(async () => {
    try {
      const [sessionsData, tagsData] = await Promise.all([
        getSessions(),
        getTags(),
      ]);
      setSessions(sessionsData);
      setTags(tagsData.tags || []);
      setError(null);
    } catch {
      setError("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get unique tags from all sessions for filter dropdown
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const session of sessions) {
      for (const tag of session.tags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      // Type filter
      if (typeFilter !== "all" && session.sessionType !== typeFilter) {
        return false;
      }
      // Tag filter
      if (tagFilter !== "all" && !session.tags.includes(tagFilter)) {
        return false;
      }
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const searchText = [
          session.title,
          session.goal || "",
          ...session.tags,
          ...(session.interactions?.map((i) => i.topic) || []),
        ].join(" ");
        const matchesSearch = searchText.toLowerCase().includes(query);
        const matchesUser =
          session.context.user?.name?.toLowerCase().includes(query) || false;
        if (!matchesSearch && !matchesUser) {
          return false;
        }
      }
      return true;
    });
  }, [sessions, searchQuery, tagFilter, typeFilter]);

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
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-border/70 bg-white/80 rounded-sm px-3 py-2 text-sm"
            >
              <option value="all">All Types</option>
              {SESSION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="border border-border/70 bg-white/80 rounded-sm px-3 py-2 text-sm"
            >
              <option value="all">All Tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            {(searchQuery || tagFilter !== "all" || typeFilter !== "all") && (
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
                  tags={tags}
                  onDelete={fetchData}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
