import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type GuideAccordionProps = {
  id: string;
  isExpanded: boolean;
  onToggle: () => void;
  header: ReactNode;
  children: ReactNode;
  className?: string;
};

export function GuideAccordion({
  id,
  isExpanded,
  onToggle,
  header,
  children,
  className,
}: GuideAccordionProps) {
  const { t } = useTranslation("guide");
  const contentId = `${id}-content`;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <button
        type="button"
        className="w-full text-left"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={contentId}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div id={id} className="flex-1 min-w-0">
              {header}
            </div>
            <svg
              className={cn(
                "h-5 w-5 text-muted-foreground transition-transform shrink-0",
                isExpanded && "rotate-180",
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
            <span className="sr-only">
              {isExpanded ? t("common.collapse") : t("common.expand")}
            </span>
          </div>
        </CardContent>
      </button>

      {isExpanded && (
        <section
          id={contentId}
          aria-labelledby={id}
          className="px-4 pb-4 border-t border-stone-100 dark:border-stone-800 pt-4"
        >
          {children}
        </section>
      )}
    </Card>
  );
}
