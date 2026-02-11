import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityChartSection } from "./activity-chart";
import { COLORS, SkeletonCard, StatCard } from "./stat-components";
import { SessionTypeChartSection, TagsChartSection } from "./type-chart";

interface OverviewStats {
  sessions: { total: number; byType: Record<string, number> };
  decisions: { total: number };
  patterns: { total: number; byType: Record<string, number> };
  rules: { total: number; byType: Record<string, number> };
}

interface ActivityData {
  activity: { date: string; sessions: number; decisions: number }[];
  days: number;
}

interface TagStats {
  tags: { name: string; count: number }[];
}

async function fetchOverview(): Promise<OverviewStats> {
  const res = await fetch("/api/stats/overview");
  if (!res.ok) throw new Error("Failed to fetch overview");
  return res.json();
}

async function fetchActivity(days = 30): Promise<ActivityData> {
  const res = await fetch(`/api/stats/activity?days=${days}`);
  if (!res.ok) throw new Error("Failed to fetch activity");
  return res.json();
}

async function fetchTagStats(): Promise<TagStats> {
  const res = await fetch("/api/stats/tags");
  if (!res.ok) throw new Error("Failed to fetch tag stats");
  return res.json();
}

export function StatsPage() {
  const { t } = useTranslation("stats");

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
  } = useQuery({
    queryKey: ["stats", "overview"],
    queryFn: fetchOverview,
  });

  const {
    data: activity,
    isLoading: activityLoading,
    error: activityError,
  } = useQuery({
    queryKey: ["stats", "activity"],
    queryFn: () => fetchActivity(30),
  });

  const {
    data: tagStats,
    isLoading: tagsLoading,
    error: tagsError,
  } = useQuery({
    queryKey: ["stats", "tags"],
    queryFn: fetchTagStats,
  });

  if (overviewError || activityError || tagsError) {
    return (
      <div className="text-center py-12 text-destructive">
        {t("errors:failedToLoad.statistics")}
      </div>
    );
  }

  // Prepare session type data - sort by value descending, filter out unknown
  const sessionTypeData = overview
    ? Object.entries(overview.sessions.byType)
        .filter(([name]) => name && name !== "unknown")
        .map(([name, value], index) => ({
          name,
          value,
          fill: COLORS.chart[index % COLORS.chart.length],
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {overviewLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              title={t("totalSessions")}
              value={overview?.sessions.total || 0}
            />
            <StatCard
              title={t("totalDecisions")}
              value={overview?.decisions.total || 0}
            />
            <StatCard
              title={t("totalPatterns")}
              value={overview?.patterns?.total || 0}
            />
            <StatCard
              title={t("totalRules")}
              value={overview?.rules?.total || 0}
            />
          </>
        )}
      </div>

      {/* Activity Chart */}
      <ActivityChartSection activity={activity} isLoading={activityLoading} />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Session Type Chart */}
        <SessionTypeChartSection
          sessionTypeData={sessionTypeData}
          isLoading={overviewLoading}
        />

        {/* Top Tags Chart */}
        <TagsChartSection tags={tagStats?.tags} isLoading={tagsLoading} />
      </div>
    </div>
  );
}
