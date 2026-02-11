import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { brand } from "@/lib/brand-colors";
import { formatShortDate } from "@/lib/format-date";

interface ActivityData {
  activity: { date: string; sessions: number; decisions: number }[];
  days: number;
}

export function ActivityChartSection({
  activity,
  isLoading,
}: {
  activity: ActivityData | undefined;
  isLoading: boolean;
}) {
  const { t } = useTranslation("stats");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("activityChart")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={activity?.activity || []}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={brand.session}
                    stopOpacity={0.5}
                  />
                  <stop
                    offset="95%"
                    stopColor={brand.session}
                    stopOpacity={0.05}
                  />
                </linearGradient>
                <linearGradient id="colorDecisions" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={brand.decision}
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor={brand.decision}
                    stopOpacity={0.05}
                  />
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
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
              <Area
                type="monotone"
                dataKey="sessions"
                stroke={brand.session}
                strokeWidth={2}
                fill="url(#colorSessions)"
                name={t("sessions")}
                animationDuration={1200}
                animationEasing="ease-out"
              />
              <Area
                type="monotone"
                dataKey="decisions"
                stroke={brand.decision}
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
  );
}
