import { Link2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { SessionContextCard } from "@/components/session-context-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInvalidateSessions } from "@/hooks/use-sessions";
import { deleteSession, getSession, getTags, updateSession } from "@/lib/api";
import type { Interaction, Session, Tag } from "@/lib/types";

// Format date as YYYY/M/D HH:MM:SS with leading zeros for time
function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

// Auto-compact summary card - displayed differently from regular interactions
function CompactSummaryCard({ interaction }: { interaction: Interaction }) {
  const { t } = useTranslation("sessions");
  const [isExpanded, setIsExpanded] = useState(false);
  const timestamp = formatTimestamp(interaction.timestamp);

  return (
    <div className="space-y-3">
      {/* Center-aligned compact indicator - similar to timestamp style but distinct */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 px-3 py-1.5 rounded-full flex items-center gap-2 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
        >
          <span>⚡</span>
          <span className="font-medium">
            {t("interaction.contextCompacted")}
          </span>
          <span className="text-amber-600 dark:text-amber-500">·</span>
          <span className="text-amber-600 dark:text-amber-500">
            {timestamp}
          </span>
          <span className="ml-1">{isExpanded ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* Expandable summary content */}
      {isExpanded && (
        <div className="mx-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-2">
            {t("interaction.summaryFromPreviousContext")}
          </div>
          <pre className="text-xs whitespace-pre-wrap overflow-x-auto text-amber-800 dark:text-amber-200 max-h-96 overflow-y-auto font-mono leading-relaxed">
            {interaction.user}
          </pre>
        </div>
      )}
    </div>
  );
}

function InteractionCard({ interaction }: { interaction: Interaction }) {
  const { t } = useTranslation("sessions");
  const [isExpanded, setIsExpanded] = useState(false);
  const [showThinking, setShowThinking] = useState(false);

  const timestamp = formatTimestamp(interaction.timestamp);
  const hasThinking =
    interaction.thinking && interaction.thinking.trim() !== "";

  return (
    <div className="space-y-3">
      {/* Timestamp header */}
      <div className="flex justify-center">
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {timestamp}
        </span>
      </div>

      {/* User message - right aligned */}
      <div className="flex flex-col items-end">
        <span className="text-xs text-muted-foreground mb-1 mr-1">
          {t("interaction.user")}
        </span>
        <div className="max-w-[85%] bg-gradient-to-br from-slate-700 to-slate-800 dark:from-slate-600 dark:to-slate-700 text-white rounded-2xl rounded-br-sm px-4 py-2 shadow-sm">
          <div className="text-sm whitespace-pre-wrap">{interaction.user}</div>
        </div>
      </div>

      {/* Assistant response - left aligned */}
      {interaction.assistant && (
        <div className="flex flex-col items-start">
          <span className="text-xs text-muted-foreground mb-1 ml-1">
            {t("interaction.assistant")}
          </span>
          <div className="max-w-[85%] bg-muted rounded-2xl rounded-bl-sm px-4 py-2 shadow-sm">
            <div className="text-sm whitespace-pre-wrap">
              {interaction.assistant.length > 500 && !isExpanded
                ? `${interaction.assistant.substring(0, 500)}...`
                : interaction.assistant}
            </div>
            {interaction.assistant.length > 500 && !isExpanded && (
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="text-xs text-primary hover:underline mt-2"
              >
                {t("interaction.showMore")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Thinking (expandable) - left aligned, subtle */}
      {hasThinking && (
        <div className="flex justify-start">
          <div className="max-w-[85%]">
            <button
              type="button"
              onClick={() => setShowThinking(!showThinking)}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 mb-1"
            >
              <span className="text-amber-500">💭</span>
              {showThinking
                ? t("interaction.hideThinking")
                : t("interaction.showThinking")}
            </button>

            {showThinking && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2">
                <pre className="text-xs whitespace-pre-wrap overflow-x-auto text-amber-800 dark:text-amber-200">
                  {interaction.thinking}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContextRestorationCard({ session }: { session: Session }) {
  const { t } = useTranslation("sessions");
  const { t: tc } = useTranslation("common");
  const [copied, setCopied] = useState(false);

  // Collect all modified files from session.files
  const modifiedFiles = new Set<string>();
  for (const file of (session as { files?: { path: string }[] }).files || []) {
    modifiedFiles.add(file.path);
  }

  const projectDir = session.context?.projectDir;
  const branch = session.context?.branch;

  // Generate restoration command
  const generateRestoreCommand = () => {
    const commands: string[] = [];

    if (projectDir) {
      commands.push(`cd "${projectDir}"`);
    }

    if (branch) {
      commands.push(`git checkout ${branch}`);
    }

    return commands.join(" && ");
  };

  const restoreCommand = generateRestoreCommand();

  const _copyCommand = () => {
    if (restoreCommand) {
      navigator.clipboard.writeText(restoreCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Generate resume command for memoria
  const resumeCommand = `/memoria:resume ${session.id}`;

  const copyResumeCommand = () => {
    navigator.clipboard.writeText(resumeCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!projectDir && !branch && modifiedFiles.size === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Context</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {t("contextRestoration.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Resume */}
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">
            {t("contextRestoration.quickResume")}
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted p-2 rounded text-sm font-mono overflow-x-auto">
              {resumeCommand}
            </code>
            <Button variant="outline" size="sm" onClick={copyResumeCommand}>
              {copied ? tc("copied") : tc("copy")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("contextRestoration.quickResumeDescription")}
          </p>
        </div>

        {/* Environment */}
        {(projectDir || branch) && (
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-2">
              {t("contextRestoration.environment")}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {projectDir && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">
                    {t("contextRestoration.directory")}:
                  </span>{" "}
                  <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">
                    {projectDir}
                  </code>
                </div>
              )}
              {branch && (
                <div>
                  <span className="text-muted-foreground">{tc("branch")}:</span>{" "}
                  <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">
                    {branch}
                  </code>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modified Files */}
        {modifiedFiles.size > 0 && (
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-2">
              {t("contextRestoration.modifiedFiles", {
                count: modifiedFiles.size,
              })}
            </div>
            <div className="max-h-48 overflow-y-auto">
              <div className="flex flex-wrap gap-1">
                {Array.from(modifiedFiles)
                  .sort()
                  .map((file) => (
                    <Badge
                      key={file}
                      variant="secondary"
                      className="text-xs font-mono"
                    >
                      {file.split("/").pop()}
                    </Badge>
                  ))}
              </div>
            </div>
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer">
                {t("contextRestoration.showFullPaths")}
              </summary>
              <div className="mt-2 space-y-1">
                {Array.from(modifiedFiles)
                  .sort()
                  .map((file) => (
                    <div
                      key={file}
                      className="text-xs font-mono text-muted-foreground truncate"
                    >
                      {file}
                    </div>
                  ))}
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SessionDetailPage() {
  const { t, i18n } = useTranslation("sessions");
  const { t: tc } = useTranslation("common");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invalidateSessions = useInvalidateSessions();
  const [session, setSession] = useState<Session | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editGoal, setEditGoal] = useState("");
  const [editTags, setEditTags] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const [sessionData, tagsData] = await Promise.all([
        getSession(id),
        getTags(),
      ]);
      setSession(sessionData);
      setTags(tagsData.tags || []);
      setEditTitle(sessionData.title || "");
      setEditGoal(sessionData.goal || "");
      setEditTags(sessionData.tags.join(", "));
      setError(null);
    } catch {
      setError("Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!session || !id) return;
    setSaveError(null);
    try {
      const updated = await updateSession(id, {
        ...session,
        title: editTitle,
        goal: editGoal,
        tags: editTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setSession(updated);
      setIsEditing(false);
    } catch {
      setSaveError("Failed to save");
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteSession(id);
      invalidateSessions();
      setDeleteDialogOpen(false);
      navigate("/");
    } catch {
      // Keep dialog open on error
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = () => {
    if (!id) return;
    window.open(`/api/export/sessions/${id}/markdown`, "_blank");
  };

  const getTagColor = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId);
    return tag?.color || "#6B7280";
  };

  if (loading) {
    return <div className="text-center py-12">{tc("loading")}</div>;
  }

  if (error || !session) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">
          {error || t("errors:sessionNotFound")}
        </p>
        <Link to="/" className="text-primary underline mt-4 block">
          {t("errors:backToSessions")}
        </Link>
      </div>
    );
  }

  const date = new Date(session.createdAt).toLocaleString(
    i18n.language === "ja" ? "ja-JP" : "en-US",
  );
  const userName = session.context.user?.name || tc("unknown");
  const interactionCount = session.interactions?.length || 0;

  return (
    <div className="h-[calc(100%+64px)] flex flex-col overflow-hidden -my-8 -mx-8 px-6 py-4">
      {/* Header - fixed */}
      <div className="flex items-center justify-between pb-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            &larr; {tc("back")}
          </Link>
          <h1 className="text-2xl font-bold">{t("detail.title")}</h1>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                {tc("cancel")}
              </Button>
              <Button onClick={handleSave}>{tc("save")}</Button>
              {saveError && (
                <span className="text-destructive text-sm">{saveError}</span>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleExport}>
                {tc("export")}
              </Button>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                {tc("edit")}
              </Button>
              <AlertDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    {tc("delete")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("detail.deleteTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {tc("deleteDialog.description")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                      {tc("cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={isDeleting}
                    >
                      {isDeleting ? tc("deleting") : tc("delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      {/* Two-column layout: Overview (30%) | Main Content (70%) */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left Column - Overview (scrollable) */}
        <div className="w-[30%] min-w-[300px] overflow-y-auto space-y-4">
          {/* Session Info Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                {isEditing ? (
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder={t("untitled")}
                    className="text-lg font-bold"
                  />
                ) : (
                  session.title || t("untitled")
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {isEditing ? (
                <div>
                  <label
                    htmlFor="edit-goal"
                    className="text-xs text-muted-foreground"
                  >
                    {t("detail.goal")}
                  </label>
                  <Input
                    id="edit-goal"
                    value={editGoal}
                    onChange={(e) => setEditGoal(e.target.value)}
                    placeholder={t("detail.goal")}
                    className="mt-1"
                  />
                </div>
              ) : (
                session.goal && (
                  <p className="text-muted-foreground text-xs">
                    {session.goal}
                  </p>
                )
              )}

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tc("user")}</span>
                  <span>{userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tc("date")}</span>
                  <span>{date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tc("branch")}</span>
                  <span className="font-mono text-xs">
                    {session.context.branch || tc("na")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tc("project")}</span>
                  <span className="font-mono text-xs">
                    {session.context.projectName || tc("na")}
                  </span>
                </div>
                {session.context.repository && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tc("repository")}</span>
                    <span className="font-mono text-xs">
                      {session.context.repository}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("detail.interactions")}
                  </span>
                  <span>{interactionCount}</span>
                </div>
                {session.sessionType && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{tc("type")}</span>
                    <Badge variant="outline" className="text-xs">
                      {t(`types.${session.sessionType}`)}
                    </Badge>
                  </div>
                )}
                {session.status && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">
                      {tc("status")}
                    </span>
                    <Badge
                      variant={
                        session.status === "complete" ? "default" : "secondary"
                      }
                      className="text-xs"
                    >
                      {session.status}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Related Sessions */}
              {session.relatedSessions &&
                session.relatedSessions.length > 0 && (
                  <div className="pt-2 border-t">
                    <span className="text-muted-foreground text-xs">
                      {t("detail.relatedSessions")}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {session.relatedSessions.map((relatedId) => (
                        <Link
                          key={relatedId}
                          to={`/sessions/${relatedId}`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted hover:bg-muted/80 rounded text-xs font-mono transition-colors"
                        >
                          <Link2 className="h-3 w-3" />
                          {relatedId}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

              {/* Tags */}
              <div className="pt-2 border-t">
                <span className="text-muted-foreground text-xs">
                  {tc("tags")}
                </span>
                {isEditing ? (
                  <div className="mt-1 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {editTags
                        .split(",")
                        .map((tg) => tg.trim())
                        .filter(Boolean)
                        .map((tagId) => (
                          <Badge
                            key={tagId}
                            variant="secondary"
                            className="text-xs cursor-pointer"
                            style={{
                              backgroundColor: `${getTagColor(tagId)}20`,
                              color: getTagColor(tagId),
                              borderColor: getTagColor(tagId),
                            }}
                            onClick={() => {
                              const currentTags = editTags
                                .split(",")
                                .map((tg) => tg.trim())
                                .filter(Boolean);
                              setEditTags(
                                currentTags
                                  .filter((tg) => tg !== tagId)
                                  .join(", "),
                              );
                            }}
                          >
                            {tagId} ×
                          </Badge>
                        ))}
                      {editTags.trim() === "" && (
                        <span className="text-muted-foreground text-xs">
                          {t("tags.clickToAdd")}
                        </span>
                      )}
                    </div>
                    <details className="text-xs">
                      <summary className="text-muted-foreground cursor-pointer">
                        {t("tags.availableTags", { count: tags.length })}
                      </summary>
                      <div className="flex flex-wrap gap-1 mt-2 max-h-32 overflow-y-auto p-2 border rounded">
                        {tags.map((tag) => {
                          const isSelected = editTags
                            .split(",")
                            .map((tg) => tg.trim())
                            .includes(tag.id);
                          return (
                            <Badge
                              key={tag.id}
                              variant={isSelected ? "default" : "outline"}
                              className="text-xs cursor-pointer"
                              style={
                                isSelected
                                  ? {
                                      backgroundColor: tag.color,
                                      color: "#fff",
                                    }
                                  : { borderColor: tag.color, color: tag.color }
                              }
                              onClick={() => {
                                const currentTags = editTags
                                  .split(",")
                                  .map((tg) => tg.trim())
                                  .filter(Boolean);
                                if (isSelected) {
                                  setEditTags(
                                    currentTags
                                      .filter((tg) => tg !== tag.id)
                                      .join(", "),
                                  );
                                } else {
                                  setEditTags(
                                    [...currentTags, tag.id].join(", "),
                                  );
                                }
                              }}
                            >
                              {tag.id}
                            </Badge>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {session.tags.length > 0 ? (
                      session.tags.map((tagId) => (
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
                      ))
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {tc("noTags")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Context Restoration Card */}
          <ContextRestorationCard session={session} />
        </div>

        {/* Right Column - Tabbed Content */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <Tabs defaultValue="context" className="flex flex-col flex-1 min-h-0">
            <TabsList className="flex-shrink-0">
              <TabsTrigger value="context">
                {t("detail.sessionContext")}
              </TabsTrigger>
              <TabsTrigger value="interactions">
                {t("detail.interactions")} ({interactionCount})
              </TabsTrigger>
            </TabsList>

            {/* Session Context Tab */}
            <TabsContent
              value="context"
              className="flex-1 min-h-0 data-[state=inactive]:hidden"
            >
              <Card className="h-full flex flex-col py-0 gap-0">
                <CardContent className="py-4 flex-1 overflow-y-auto">
                  <SessionContextCard session={session} embedded />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Interactions Tab */}
            <TabsContent
              value="interactions"
              className="flex-1 min-h-0 data-[state=inactive]:hidden"
            >
              <Card className="h-full flex flex-col py-0 gap-0">
                <CardContent className="py-4 flex-1 overflow-y-auto">
                  {interactionCount > 0 ? (
                    <div className="space-y-6">
                      {session.interactions.map((interaction) =>
                        interaction.isCompactSummary ? (
                          <CompactSummaryCard
                            key={interaction.id}
                            interaction={interaction}
                          />
                        ) : (
                          <InteractionCard
                            key={interaction.id}
                            interaction={interaction}
                          />
                        ),
                      )}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      {t("detail.noInteractions")}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
