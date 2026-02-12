import { XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePageDescription } from "@/components/page-description";
import { SessionCard } from "@/components/session-card";
import { Button } from "@/components/ui/button";
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
import type { SessionType, Tag } from "@/lib/types";

const SESSION_TYPES: SessionType[] = [
  "decision",
  "implementation",
  "research",
  "exploration",
  "discussion",
  "debug",
  "review",
];

const CATEGORY_ORDER = [
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

export function SessionsPage() {
  const { t } = useTranslation("sessions");
  const { t: tc } = useTranslation("common");
  const desc = usePageDescription("sessions");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useMemo(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
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

  const tagsByCategory = useMemo(() => {
    if (!tags.length) return {};
    const usedTagIds = new Set<string>();
    for (const session of data?.data || []) {
      for (const tag of session.tags || []) {
        usedTagIds.add(tag);
      }
    }
    const grouped: Record<string, Tag[]> = {};
    for (const tag of tags) {
      if (!usedTagIds.has(tag.id)) continue;
      const category = tag.category || "other";
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(tag);
    }
    for (const category of Object.keys(grouped)) {
      grouped[category].sort((a, b) => a.label.localeCompare(b.label));
    }
    return grouped;
  }, [tags, data?.data]);

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
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
            <desc.Trigger />
          </div>
          <p className="text-sm text-muted-foreground">
            {t("sessionCount", { count: pagination?.total || 0 })}
          </p>
        </div>
        <desc.Panel>
          <p>{t("pageDescription.intro")}</p>
          <p className="mt-1.5">{t("pageDescription.usage")}</p>
        </desc.Panel>
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
                {CATEGORY_ORDER.filter(
                  (category) => tagsByCategory[category]?.length > 0,
                ).map((category, index) => (
                  <SelectGroup key={category}>
                    {index > 0 && <SelectSeparator />}
                    <SelectLabel>{tc(`tagCategories.${category}`)}</SelectLabel>
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
            {(searchQuery || tagFilter !== "all" || typeFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setTagFilter("all");
                  setTypeFilter("all");
                  setPage(1);
                }}
              >
                <XIcon className="size-4 mr-1" />
                {tc("reset")}
              </Button>
            )}
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
