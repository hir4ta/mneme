import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSessions,
  getSessionsPaginated,
  getTags,
  type SessionsQueryParams,
} from "@/lib/api";

export function useSessions(params: SessionsQueryParams = {}) {
  const {
    page = 1,
    limit = 20,
    tag,
    type,
    project,
    search,
    paginate = true,
  } = params;

  return useQuery({
    queryKey: [
      "sessions",
      { page, limit, tag, type, project, search, paginate },
    ],
    queryFn: () =>
      paginate
        ? getSessionsPaginated({ page, limit, tag, type, project, search })
        : getSessions().then((data) => ({
            data,
            pagination: {
              page: 1,
              limit: data.length,
              total: data.length,
              totalPages: 1,
              hasNext: false,
              hasPrev: false,
            },
          })),
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: getTags,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useInvalidateSessions() {
  const queryClient = useQueryClient();
  return (deletedSessionId?: string) => {
    // If a session ID is provided, remove it from all cached queries immediately
    if (deletedSessionId) {
      queryClient.setQueriesData<{
        data: { id: string }[];
        pagination?: { total: number };
      }>(
        { queryKey: ["sessions"] },
        (oldData) => {
          if (!oldData?.data) return oldData;
          return {
            ...oldData,
            data: oldData.data.filter((s) => s.id !== deletedSessionId),
            pagination: oldData.pagination
              ? {
                  ...oldData.pagination,
                  total: Math.max(0, oldData.pagination.total - 1),
                }
              : undefined,
          };
        }
      );
    }
    // Also invalidate to ensure fresh data on next fetch
    return queryClient.invalidateQueries({
      queryKey: ["sessions"],
    });
  };
}
