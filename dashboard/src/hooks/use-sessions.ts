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
  return () =>
    queryClient.invalidateQueries({
      queryKey: ["sessions"],
      refetchType: "active",
    });
}
