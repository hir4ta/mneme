import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { CompactSummaryCard } from "@/components/compact-summary-card";
import { ContextRestorationCard } from "@/components/context-restoration-card";
import { InteractionCard } from "@/components/interaction-card";
import { SessionContextCard } from "@/components/session-context-card";
import { SessionInfoCard } from "@/components/session-info-card";
import {
  detectSystemMessage,
  SystemMessageCard,
} from "@/components/system-message-card";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInvalidateSessions } from "@/hooks/use-sessions";
import {
  deleteSession,
  getSession,
  getSessionInteractions,
  getTags,
  type InteractionFromSQLite,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";
import type { Session, Tag } from "@/lib/types";

export function SessionDetailPage() {
  const { t } = useTranslation("sessions");
  const { t: tc } = useTranslation("common");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invalidateSessions = useInvalidateSessions();
  const [session, setSession] = useState<Session | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [interactions, setInteractions] = useState<InteractionFromSQLite[]>([]);
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

      // Fetch interactions from SQLite
      try {
        const interactionsData = await getSessionInteractions(id);
        if (interactionsData) {
          setInteractions(interactionsData.interactions);
        } else {
          setInteractions([]);
        }
      } catch {
        setInteractions([]);
      }

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

  const handleDelete = async () => {
    if (!id) return;
    await deleteSession(id);
    invalidateSessions(id);
    navigate("/");
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

  const date = formatDateTime(session.createdAt);
  const userName =
    session.context.user?.name ||
    (session as { user?: { name?: string } }).user?.name ||
    tc("unknown");
  const interactionCount = interactions.length;

  return (
    <div className="h-[calc(100%+32px)] flex flex-col overflow-hidden -my-4 -mx-6 px-6 py-4">
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left Column - Overview (scrollable) */}
        <div className="w-[30%] min-w-[300px] overflow-y-auto space-y-4">
          <SessionInfoCard
            session={session}
            tags={tags}
            date={date}
            userName={userName}
            onDelete={handleDelete}
          />
          <ContextRestorationCard session={session} />
        </div>

        {/* Right Column - Tabbed Content */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <Tabs defaultValue="context" className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between flex-shrink-0 mb-2">
              <TabsList>
                <TabsTrigger value="context">
                  {t("detail.sessionContext")}
                </TabsTrigger>
                <TabsTrigger value="interactions">
                  {t("detail.interactions")}
                </TabsTrigger>
              </TabsList>
              <Link
                to="/"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                &larr; {tc("back")}
              </Link>
            </div>

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

            <TabsContent
              value="interactions"
              className="flex-1 min-h-0 data-[state=inactive]:hidden"
            >
              <Card className="h-full flex flex-col py-0 gap-0">
                <CardContent className="py-4 flex-1 overflow-y-auto">
                  {interactionCount > 0 ? (
                    <div className="space-y-6">
                      {interactions.map((interaction) => {
                        if (interaction.isContinuation) {
                          return (
                            <InteractionCard
                              key={interaction.id}
                              interaction={interaction}
                            />
                          );
                        }
                        if (interaction.isCompactSummary) {
                          return (
                            <CompactSummaryCard
                              key={interaction.id}
                              interaction={interaction}
                            />
                          );
                        }
                        const systemType = detectSystemMessage(
                          interaction.user,
                        );
                        if (systemType) {
                          return (
                            <SystemMessageCard
                              key={interaction.id}
                              interaction={interaction}
                              type={systemType}
                            />
                          );
                        }
                        return (
                          <InteractionCard
                            key={interaction.id}
                            interaction={interaction}
                          />
                        );
                      })}
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
