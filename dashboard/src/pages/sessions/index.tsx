import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SessionCardSkeletonList } from "@/components/ui/session-card-skeleton";
import { useSessions, useTags } from "@/hooks/use-sessions";
import type { Session, SessionType, Tag } from "@/lib/types";

const SESSION_TYPES: SessionType[] = [
  "decision",
  "implementation",
  "research",
  "exploration",
  "discussion",
  "debug",
  "review",
];

function SessionCard({ session, tags }: { session: Session; tags: Tag[] }) {
  const { t, i18n } = useTranslation("sessions");
  const date = new Date(session.createdAt).toLocaleDateString(
    i18n.language === "ja" ? "ja-JP" : "en-US",
  );
  const userName = session.context?.user?.name;
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
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <span className="line-clamp-1">
              {session.title || t("untitled")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            {userName && (
              <>
                <span>{userName}</span>
                <span>-</span>
              </>
            )}
            <span>{date}</span>
            {session.context?.branch && (
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
                  {t(`types.${session.sessionType}`)}
                </Badge>
              </>
            )}
            {interactionCount > 0 && (
              <>
                <span>-</span>
                <span className="text-xs">
                  {t("interactionCount", { count: interactionCount })}
                </span>
              </>
            )}
          </div>
          {session.goal && (
            <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
              {session.goal}
            </p>
          )}
          {session.tags && session.tags.length > 0 && (
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
  const { t } = useTranslation("sessions");
  const { t: tc } = useTranslation("common");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useMemo(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading, error } = useSessions({
    page,
    limit: 20,
    tag: tagFilter !== "all" ? tagFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
    project: projectFilter !== "all" ? projectFilter : undefined,
    search: debouncedSearch || undefined,
  });

  const { data: tagsData } = useTags();
  const tags = tagsData?.tags || [];

  // Get unique tags from all sessions for filter dropdown
  const availableTags = useMemo(() => {
    if (!data?.data) return [];
    const tagSet = new Set<string>();
    for (const session of data.data) {
      for (const tag of session.tags || []) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [data?.data]);

  // Get unique projects from all sessions for filter dropdown
  const availableProjects = useMemo(() => {
    if (!data?.data) return [];
    const projectSet = new Set<string>();
    for (const session of data.data) {
      const projectName = session.context?.projectName;
      if (projectName) projectSet.add(projectName);
    }
    return Array.from(projectSet).sort();
  }, [data?.data]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <SessionCardSkeletonList count={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        {t("errors:failedToLoad.sessions")}
      </div>
    );
  }

  const sessions = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("sessionCount", { count: pagination?.total || 0 })}
        </p>
      </div>

      {(pagination?.total || 0) === 0 &&
      !debouncedSearch &&
      tagFilter === "all" &&
      typeFilter === "all" &&
      projectFilter === "all" ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t("noSessionsFound")}</p>
          <p className="text-sm mt-2">{t("noSessionsDescription")}</p>
        </div>
      ) : (
        <>
          <div className="flex gap-4 items-center flex-wrap">
            <Input
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={tc("allTypes")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tc("allTypes")}</SelectItem>
                {SESSION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`types.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={tagFilter}
              onValueChange={(value) => {
                setTagFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={tc("allTags")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tc("allTags")}</SelectItem>
                {availableTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={projectFilter}
              onValueChange={(value) => {
                setProjectFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={tc("allProjects")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tc("allProjects")}</SelectItem>
                {availableProjects.map((project) => (
                  <SelectItem key={project} value={project}>
                    {project}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {sessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{t("noMatchingFilters")}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4">
                {sessions.map((session) => (
                  <SessionCard key={session.id} session={session} tags={tags} />
                ))}
              </div>

              {pagination && (
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  hasNext={pagination.hasNext}
                  hasPrev={pagination.hasPrev}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
