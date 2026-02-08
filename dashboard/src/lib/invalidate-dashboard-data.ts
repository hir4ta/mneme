import type { QueryClient } from "@tanstack/react-query";

const DASHBOARD_QUERY_KEYS = [
  ["decisions"],
  ["patterns"],
  ["patterns", "stats"],
  ["units"],
  ["units", "rules-availability"],
  ["approval-queue"],
  ["knowledge-graph"],
  ["stats"],
] as const;

export async function invalidateDashboardData(queryClient: QueryClient) {
  await Promise.all(
    DASHBOARD_QUERY_KEYS.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey: [...queryKey] }),
    ),
  );
}
