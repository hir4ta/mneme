import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { brand } from "@/lib/brand-colors";

interface SessionTypeEntry {
  name: string;
  value: number;
  fill: string;
}

interface TagEntry {
  name: string;
  count: number;
}

export function SessionTypeChartSection({
  sessionTypeData,
  isLoading,
}: {
  sessionTypeData: SessionTypeEntry[];
  isLoading: boolean;
}) {
  const { t } = useTranslation("stats");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("sessionsByType")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
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
  );
}

export function TagsChartSection({
  tags,
  isLoading,
}: {
  tags: TagEntry[] | undefined;
  isLoading: boolean;
}) {
  const { t } = useTranslation("stats");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("topTags")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[180px] w-full" />
        ) : tags && tags.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={tags.slice(0, 8)}
              layout="vertical"
              margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="tagBarGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop
                    offset="0%"
                    stopColor={brand.pattern}
                    stopOpacity={0.6}
                  />
                  <stop
                    offset="100%"
                    stopColor={brand.session}
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
  );
}
