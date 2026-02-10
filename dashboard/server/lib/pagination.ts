// Pagination helper
export interface PaginationParams {
  page: number;
  limit: number;
  tag?: string;
  type?: string;
  project?: string;
  search?: string;
  showUntitled?: boolean;
  allMonths?: boolean;
}

export function parsePaginationParams(c: {
  req: { query: (key: string) => string | undefined };
}): PaginationParams {
  return {
    page: Math.max(1, Number.parseInt(c.req.query("page") || "1", 10)),
    limit: Math.min(
      100,
      Math.max(1, Number.parseInt(c.req.query("limit") || "20", 10)),
    ),
    tag: c.req.query("tag"),
    type: c.req.query("type"),
    project: c.req.query("project"),
    search: c.req.query("search"),
    showUntitled: c.req.query("showUntitled") === "true",
    allMonths: c.req.query("allMonths") === "true",
  };
}

export function paginateArray<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}
