import { Link2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SessionContextCard } from "@/components/session-context-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSession, getTags } from "@/lib/api";
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
          <div className="text-xs max-h-96 overflow-y-auto">
            <MarkdownRenderer
              content={interaction.user}
              className="text-amber-800 dark:text-amber-200 prose-headings:text-amber-800 dark:prose-headings:text-amber-200 prose-strong:text-amber-800 dark:prose-strong:text-amber-200 prose-code:text-amber-800 dark:prose-code:text-amber-200"
            />
          </div>
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
        <span className="text-xs text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full">
          {timestamp}
        </span>
      </div>

      {/* User message - right aligned - modern dark slate */}
      <div className="flex flex-col items-end">
        <span className="text-xs text-stone-500 dark:text-stone-400 mb-1 mr-1">
          {t("interaction.user")}
        </span>
        <div className="max-w-[85%] bg-[#39414B] text-white rounded-2xl rounded-br-sm px-4 py-2 shadow-sm">
          <MarkdownRenderer
            content={interaction.user}
            variant="dark"
            className="text-sm text-white prose-headings:text-white prose-strong:text-white"
          />
        </div>
      </div>

      {/* Assistant response - left aligned - Claude cream/beige */}
      {interaction.assistant && (
        <div className="flex flex-col items-start">
          <span className="text-xs text-stone-500 dark:text-stone-400 mb-1 ml-1">
            {t("interaction.assistant")}
          </span>
          <div className="max-w-[85%] bg-[#F5F5F0] dark:bg-stone-800 text-stone-800 dark:text-stone-100 rounded-2xl rounded-bl-sm px-4 py-2 shadow-sm border border-stone-200 dark:border-stone-700">
            <MarkdownRenderer
              content={
                interaction.assistant.length > 500 && !isExpanded
                  ? `${interaction.assistant.substring(0, 500)}...`
                  : interaction.assistant
              }
              className="text-sm"
            />
            {interaction.assistant.length > 500 && !isExpanded && (
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="text-xs text-[#C15F3C] hover:underline mt-2"
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
                <MarkdownRenderer
                  content={interaction.thinking || ""}
                  className="text-xs text-amber-800 dark:text-amber-200 prose-headings:text-amber-800 dark:prose-headings:text-amber-200 prose-code:text-amber-700 dark:prose-code:text-amber-300"
                />
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
  // Handle both string[] and {path: string}[] formats
  const modifiedFiles = new Set<string>();
  const files =
    (session as { files?: (string | { path: string })[] }).files || [];
  for (const file of files) {
    const path = typeof file === "string" ? file : file.path;
    if (path) modifiedFiles.add(path);
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
  const [session, setSession] = useState<Session | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const [sessionData, tagsData] = await Promise.all([
        getSession(id),
        getTags(),
      ]);
      setSession(sessionData);
      setTags(tagsData.tags || []);
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
      <div className="flex items-center gap-4 pb-4 flex-shrink-0">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          &larr; {tc("back")}
        </Link>
        <h1 className="text-2xl font-bold">{t("detail.title")}</h1>
      </div>

      {/* Two-column layout: Overview (30%) | Main Content (70%) */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left Column - Overview (scrollable) */}
        <div className="w-[30%] min-w-[300px] overflow-y-auto space-y-4">
          {/* Session Info Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                {session.title || t("untitled")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
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
                    <span className="text-muted-foreground">
                      {tc("repository")}
                    </span>
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
