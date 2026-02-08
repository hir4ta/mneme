import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { getProject } from "@/lib/api";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  labelKey: string;
  icon: string;
};

type NavGroup = {
  labelKey: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    labelKey: "nav.platform",
    items: [
      { href: "/", labelKey: "nav.sessions", icon: "folder" },
      { href: "/units", labelKey: "nav.units", icon: "cards" },
      { href: "/decisions", labelKey: "nav.decisions", icon: "lightbulb" },
      { href: "/patterns", labelKey: "nav.patterns", icon: "pattern" },
      { href: "/rules", labelKey: "nav.rules", icon: "check" },
      { href: "/stats", labelKey: "nav.statistics", icon: "chart" },
      { href: "/graph", labelKey: "nav.graph", icon: "graph" },
    ],
  },
  {
    labelKey: "nav.help",
    items: [{ href: "/guide", labelKey: "nav.guide", icon: "book" }],
  },
];

const icons: Record<string, React.ReactNode> = {
  folder: (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <title>Sessions</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  ),
  lightbulb: (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <title>Decisions</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  ),
  check: (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <title>Rules</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  chart: (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <title>Statistics</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  ),
  graph: (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <title>Graph</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
      />
    </svg>
  ),
  pattern: (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <title>Patterns</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
      />
    </svg>
  ),
  cards: (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <title>Units</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 7a2 2 0 012-2h11a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7zm3 3h9m-9 4h6M9 5h9a2 2 0 012 2v10"
      />
    </svg>
  ),
  book: (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <title>Guide</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  ),
};

export function Sidebar() {
  const { t } = useTranslation("layout");
  const location = useLocation();

  const { data: project } = useQuery({
    queryKey: ["project"],
    queryFn: getProject,
  });

  return (
    <aside className="w-60 shrink-0 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-4 py-6 flex flex-col">
      {/* Project Info */}
      {project && (
        <div className="mb-6 pb-4 border-b border-stone-200 dark:border-stone-700">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400 mb-2">
            {t("nav.project")}
          </p>
          <p className="text-sm font-medium truncate" title={project.path}>
            {project.name}
          </p>
          {project.repository && (
            <p
              className="text-xs text-muted-foreground truncate"
              title={project.repository}
            >
              {project.repository}
            </p>
          )}
        </div>
      )}

      <nav className="flex flex-col gap-6 flex-1">
        {navGroups.map((group) => (
          <div key={group.labelKey} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
              {t(group.labelKey)}
            </p>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                // Sessions (/) should also be active for /sessions/* paths
                const isActive =
                  item.href === "/"
                    ? location.pathname === "/" ||
                      location.pathname.startsWith("/sessions")
                    : location.pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      "relative flex items-center gap-4 rounded-md px-3 py-2 text-sm font-medium transition-all",
                      isActive
                        ? "text-white bg-stone-700 dark:bg-stone-700 pl-8"
                        : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800",
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-3 h-1.5 w-1.5 rounded-full bg-amber-400" />
                    )}
                    {icons[item.icon]}
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
