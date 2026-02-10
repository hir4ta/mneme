import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShortDate } from "@/lib/format-date";

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

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

// Monochrome color palette (stone/slate)
const COLORS = {
  primary: "#57534e", // stone-600
  secondary: "#78716c", // stone-500
  accent: "#44403c", // stone-700
  light: "#a8a29e", // stone-400
  chart: [
    "#292524", // stone-900
    "#44403c", // stone-700
    "#57534e", // stone-600
    "#78716c", // stone-500
    "#a8a29e", // stone-400
    "#d6d3d1", // stone-300
    "#1c1917", // stone-950
    "#3f3f46", // zinc-700
  ],
};

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

  // Format date for display - uses imported formatShortDate

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
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

      {/* Activity Chart - Area chart for better visual */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("activityChart")}</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={activity?.activity || []}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="colorSessions"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#292524" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#292524" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient
                    id="colorDecisions"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#78716c" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#78716c" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={formatShortDate}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #e7e5e4",
                    borderRadius: "8px",
                    fontSize: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  }}
                  labelFormatter={formatShortDate}
                />
                <Legend
                  wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
                />
                <Area
                  type="monotone"
                  dataKey="sessions"
                  stroke="#292524"
                  strokeWidth={2}
                  fill="url(#colorSessions)"
                  name={t("sessions")}
                  animationDuration={1200}
                  animationEasing="ease-out"
                />
                <Area
                  type="monotone"
                  dataKey="decisions"
                  stroke="#78716c"
                  strokeWidth={2}
                  fill="url(#colorDecisions)"
                  name={t("decisions")}
                  animationDuration={1200}
                  animationEasing="ease-out"
                  animationBegin={200}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Session Type Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("sessionsByType")}</CardTitle>
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-[180px] w-full" />
            ) : sessionTypeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={sessionTypeData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                >
                  <defs>
                    {sessionTypeData.map((entry) => (
                      <linearGradient
                        key={`gradient-${entry.name}`}
                        id={`barGradient-${entry.name}`}
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="0"
                      >
                        <stop
                          offset="0%"
                          stopColor={entry.fill}
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="100%"
                          stopColor={entry.fill}
                          stopOpacity={1}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e7e5e4",
                      borderRadius: "8px",
                      fontSize: "12px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    }}
                    cursor={false}
                  />
                  <Bar
                    dataKey="value"
                    name={t("sessions")}
                    radius={[0, 6, 6, 0]}
                    animationDuration={1200}
                    animationEasing="ease-out"
                  >
                    {sessionTypeData.map((entry) => (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={`url(#barGradient-${entry.name})`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {t("noData")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top Tags Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("topTags")}</CardTitle>
          </CardHeader>
          <CardContent>
            {tagsLoading ? (
              <Skeleton className="h-[180px] w-full" />
            ) : tagStats?.tags && tagStats.tags.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={tagStats.tags.slice(0, 8)}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="tagBarGradient"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop offset="0%" stopColor="#a8a29e" stopOpacity={0.6} />
                      <stop
                        offset="100%"
                        stopColor="#57534e"
                        stopOpacity={0.9}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e7e5e4",
                      borderRadius: "8px",
                      fontSize: "12px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    }}
                    cursor={false}
                  />
                  <Bar
                    dataKey="count"
                    fill="url(#tagBarGradient)"
                    name={t("usage")}
                    radius={[0, 6, 6, 0]}
                    animationDuration={1200}
                    animationEasing="ease-out"
                    animationBegin={200}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {t("noTags")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
