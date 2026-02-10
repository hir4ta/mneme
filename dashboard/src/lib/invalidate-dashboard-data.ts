import type { QueryClient } from "@tanstack/react-query";

const DASHBOARD_QUERY_KEYS = [
  ["dev-rules"],
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
