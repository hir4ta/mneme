import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";

type NavItem = {
  path: string;
  labelKey: string;
};

const navItems: NavItem[] = [
  { path: "/guide", labelKey: "nav.overview" },
  { path: "/guide/workflow", labelKey: "nav.workflow" },
  { path: "/guide/commands", labelKey: "nav.commands" },
  { path: "/guide/use-cases", labelKey: "nav.useCases" },
  { path: "/guide/faq", labelKey: "nav.faq" },
];

export function GuideNav() {
  const { t } = useTranslation("guide");
  const location = useLocation();

  return (
    <nav className="flex flex-wrap gap-2 mb-6 pb-4 border-b border-stone-200 dark:border-stone-700">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              isActive
                ? "bg-stone-700 text-white dark:bg-stone-700"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800",
            )}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
