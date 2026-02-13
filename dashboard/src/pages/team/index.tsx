import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { usePageDescription } from "@/components/page-description";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { brand, brandExtended } from "@/lib/brand-colors";

interface MemberStats {
  name: string;
  sessions: number;
  decisions: number;
  patterns: number;
  rules: number;
  lastActive: string;
}

interface TeamOverview {
  members: MemberStats[];
}

interface ActivityDay {
  date: string;
  members: Record<string, { sessions: number; decisions: number }>;
}

interface TeamActivity {
  activity: ActivityDay[];
  days: number;
}

interface RuleQuality {
  id: string;
  text: string;
  appliedCount: number;
  acceptedCount: number;
}

interface TeamQuality {
  approvalRate: number;
  totalRules: number;
  approvedRules: number;
  topRules: RuleQuality[];
  leastEffective: RuleQuality[];
}

async function fetchOverview(): Promise<TeamOverview> {
  const res = await fetch("/api/team/overview");
  if (!res.ok) throw new Error("Failed to fetch team overview");
  return res.json();
}

async function fetchActivity(days = 30): Promise<TeamActivity> {
  const res = await fetch(`/api/team/activity?days=${days}`);
  if (!res.ok) throw new Error("Failed to fetch team activity");
  return res.json();
}

async function fetchQuality(): Promise<TeamQuality> {
  const res = await fetch("/api/team/quality");
  if (!res.ok) throw new Error("Failed to fetch team quality");
  return res.json();
}

const MEMBER_COLORS = [
  brand.session,
  brand.decision,
  brand.pattern,
  brand.rule,
  brandExtended.purple,
  brand.unknown,
  brandExtended.dark,
];

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
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
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

function ContributionBar({
  members,
  totalSessions,
}: {
  members: MemberStats[];
  totalSessions: number;
}) {
  if (totalSessions === 0) return null;

  return (
    <div className="flex h-4 w-full overflow-hidden rounded-full">
      {members.map((member, i) => {
        const pct = (member.sessions / totalSessions) * 100;
        if (pct === 0) return null;
        return (
          <div
            key={member.name}
            className="h-full transition-all"
            style={{
              width: `${pct}%`,
              backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length],
            }}
            title={`${member.name}: ${member.sessions} sessions (${pct.toFixed(0)}%)`}
          />
        );
      })}
    </div>
  );
}

function ActivityTimeline({ activity }: { activity: ActivityDay[] }) {
  if (activity.length === 0) return null;

  // Get all unique members
  const memberSet = new Set<string>();
  for (const day of activity) {
    for (const name of Object.keys(day.members)) {
      memberSet.add(name);
    }
  }
  const memberNames = Array.from(memberSet);

  // Find max daily total for scaling
  let maxTotal = 0;
  for (const day of activity) {
    let dayTotal = 0;
    for (const stats of Object.values(day.members)) {
      dayTotal += stats.sessions + stats.decisions;
    }
    if (dayTotal > maxTotal) maxTotal = dayTotal;
  }

  if (maxTotal === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No activity in this period
      </p>
    );
  }

  const barHeight = 120;

  return (
    <div className="flex items-end gap-px overflow-x-auto">
      {activity.map((day) => {
        let dayTotal = 0;
        for (const stats of Object.values(day.members)) {
          dayTotal += stats.sessions + stats.decisions;
        }

        return (
          <div
            key={day.date}
            className="group relative flex flex-1 flex-col items-center"
            style={{ minWidth: "4px" }}
          >
            <div
              className="flex w-full flex-col-reverse"
              style={{ height: `${barHeight}px` }}
            >
              {memberNames.map((name, i) => {
                const stats = day.members[name];
                if (!stats) return null;
                const total = stats.sessions + stats.decisions;
                if (total === 0) return null;
                const h = (total / maxTotal) * barHeight;
                return (
                  <div
                    key={name}
                    style={{
                      height: `${h}px`,
                      backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length],
                    }}
                    className="w-full opacity-80"
                  />
                );
              })}
            </div>
            {/* Tooltip */}
            <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-stone-800 px-2 py-1 text-xs text-white shadow group-hover:block dark:bg-stone-200 dark:text-stone-900">
              {day.date}: {dayTotal}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TeamPage() {
  const { t } = useTranslation("team");
  const desc = usePageDescription("team");

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
  } = useQuery({
    queryKey: ["team", "overview"],
    queryFn: fetchOverview,
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ["team", "activity"],
    queryFn: () => fetchActivity(30),
  });

  const { data: quality, isLoading: qualityLoading } = useQuery({
    queryKey: ["team", "quality"],
    queryFn: fetchQuality,
  });

  if (overviewError) {
    return (
      <div className="py-12 text-center text-destructive">
        {t("errors:failedToLoad.team")}
      </div>
    );
  }

  const members = overview?.members || [];
  const totalSessions = members.reduce((sum, m) => sum + m.sessions, 0);
  const totalDecisions = members.reduce((sum, m) => sum + m.decisions, 0);
  const totalPatterns = members.reduce((sum, m) => sum + m.patterns, 0);
  const totalRules = members.reduce((sum, m) => sum + m.rules, 0);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          <desc.Trigger />
        </div>
        <desc.Panel>{t("pageDescription")}</desc.Panel>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {overviewLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard title={t("members")} value={members.length} />
            <StatCard title={t("totalSessions")} value={totalSessions} />
            <StatCard title={t("totalDecisions")} value={totalDecisions} />
            <StatCard title={t("totalPatterns")} value={totalPatterns} />
            <StatCard title={t("totalRules")} value={totalRules} />
          </>
        )}
      </div>

      {/* Contribution Bar */}
      {!overviewLoading && members.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("contributions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ContributionBar members={members} totalSessions={totalSessions} />
            <div className="flex flex-wrap gap-3 text-xs">
              {members.map((member, i) => (
                <div key={member.name} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length],
                    }}
                  />
                  <span>{member.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("activityTimeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <Skeleton className="h-[120px] w-full" />
          ) : activity ? (
            <ActivityTimeline activity={activity.activity} />
          ) : null}
        </CardContent>
      </Card>

      {/* Member Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("memberTable")}</CardTitle>
        </CardHeader>
        <CardContent>
          {overviewLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">{t("name")}</th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      {t("sessions")}
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      {t("decisions")}
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      {t("patterns")}
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      {t("rules")}
                    </th>
                    <th className="pb-2 text-right font-medium">
                      {t("lastActive")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member, i) => (
                    <tr
                      key={member.name}
                      className="border-b border-stone-100 last:border-0 dark:border-stone-800"
                    >
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              backgroundColor:
                                MEMBER_COLORS[i % MEMBER_COLORS.length],
                            }}
                          />
                          <span className="font-medium">{member.name}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {member.sessions}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {member.decisions}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {member.patterns}
                      </td>
                      <td className="py-2 pr-4 text-right">{member.rules}</td>
                      <td className="py-2 text-right text-muted-foreground">
                        {member.lastActive
                          ? member.lastActive.split("T")[0]
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Knowledge Quality */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("quality.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {qualityLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : quality ? (
            <>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("quality.approvalRate")}
                  </p>
                  <p className="text-2xl font-bold">{quality.approvalRate}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("quality.totalRules")}
                  </p>
                  <p className="text-2xl font-bold">{quality.totalRules}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("quality.approved")}
                  </p>
                  <p className="text-2xl font-bold">{quality.approvedRules}</p>
                </div>
              </div>

              {quality.topRules.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {t("quality.topRules")}
                  </p>
                  <div className="space-y-2">
                    {quality.topRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
                      >
                        <span className="line-clamp-1">{rule.text}</span>
                        <Badge variant="secondary" className="shrink-0">
                          {rule.acceptedCount}/{rule.appliedCount}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {quality.leastEffective.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {t("quality.leastEffective")}
                  </p>
                  <div className="space-y-2">
                    {quality.leastEffective.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
                      >
                        <span className="line-clamp-1">{rule.text}</span>
                        <Badge variant="outline" className="shrink-0">
                          {rule.acceptedCount}/{rule.appliedCount}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
