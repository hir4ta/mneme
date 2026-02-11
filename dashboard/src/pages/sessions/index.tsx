import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SessionCardSkeletonList } from "@/components/ui/session-card-skeleton";
import { useSessions, useTags } from "@/hooks/use-sessions";
import { formatDate } from "@/lib/format-date";
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
  const { t } = useTranslation("sessions");
  const date = formatDate(session.createdAt);

  // Get tag color from tags.json
  const getTagColor = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId);
    return tag?.color || "#6B7280";
  };

  return (
    <Link to={`/sessions/${session.sessionId || session.id}`}>
      <Card className="hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors cursor-pointer h-full">
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <CardTitle className="text-sm font-medium text-stone-800 dark:text-stone-100 line-clamp-2">
              {session.title || t("untitled")}
            </CardTitle>
            {session.sessionType && (
              <Badge variant="outline" className="text-xs font-normal shrink-0">
                {t(`types.${session.sessionType}`)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-stone-500 dark:text-stone-400 mb-2">
            <span>{date}</span>
            {session.context?.branch && (
              <>
                <span>·</span>
                <span className="font-mono bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded text-xs">
                  {session.context.branch}
                </span>
              </>
            )}
          </div>
          {session.tags && session.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {session.tags.slice(0, 4).map((tagId) => (
                <Badge
                  key={tagId}
                  variant="secondary"
                  className="text-xs px-1.5 py-0"
                  style={{
                    backgroundColor: `${getTagColor(tagId)}20`,
                    color: getTagColor(tagId),
                    borderColor: getTagColor(tagId),
                  }}
                >
                  {tagId}
                </Badge>
              ))}
              {session.tags.length > 4 && (
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  +{session.tags.length - 4}
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
    search: debouncedSearch || undefined,
  });

  const { data: tagsData } = useTags();
  const tags = tagsData?.tags || [];

  // Group tags by category for filter dropdown
  const tagsByCategory = useMemo(() => {
    if (!tags.length) return {};

    // Get tags that are actually used in sessions
    const usedTagIds = new Set<string>();
    for (const session of data?.data || []) {
      for (const tag of session.tags || []) {
        usedTagIds.add(tag);
      }
    }

    // Group by category, only include used tags
    const grouped: Record<string, Tag[]> = {};
    for (const tag of tags) {
      if (!usedTagIds.has(tag.id)) continue;
      const category = tag.category || "other";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(tag);
    }

    // Sort tags within each category
    for (const category of Object.keys(grouped)) {
      grouped[category].sort((a, b) => a.label.localeCompare(b.label));
    }

    return grouped;
  }, [tags, data?.data]);

  // Define category order for display
  const categoryOrder = [
    "domain",
    "phase",
    "feature",
    "ui",
    "architecture",
    "infra",
    "cloud",
    "data",
    "ai",
    "quality",
    "workflow",
  ];

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
      typeFilter === "all" ? (
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
                {categoryOrder
                  .filter((category) => tagsByCategory[category]?.length > 0)
                  .map((category, index) => (
                    <SelectGroup key={category}>
                      {index > 0 && <SelectSeparator />}
                      <SelectLabel>
                        {tc(`tagCategories.${category}`)}
                      </SelectLabel>
                      {tagsByCategory[category].map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-2"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
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
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
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
