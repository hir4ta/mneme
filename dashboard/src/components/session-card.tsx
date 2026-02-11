import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format-date";
import type { Session, Tag } from "@/lib/types";

export function SessionCard({
  session,
  tags,
}: {
  session: Session;
  tags: Tag[];
}) {
  const { t } = useTranslation("sessions");
  const date = formatDate(session.createdAt);

  const getTagColor = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId);
    return tag?.color || "#6B7280";
  };

  return (
    <Link to={`/sessions/${session.sessionId || session.id}`}>
      <Card className="hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors cursor-pointer h-full">
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <CardTitle className="text-sm font-medium text-stone-800 dark:text-stone-100 line-clamp-2">
              {session.title || t("untitled")}
            </CardTitle>
            {session.sessionType && (
              <Badge variant="outline" className="text-xs font-normal shrink-0">
                {t(`types.${session.sessionType}`)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-stone-500 dark:text-stone-400 mb-2">
            <span>{date}</span>
            {session.context?.branch && (
              <>
                <span>·</span>
                <span className="font-mono bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded text-xs">
                  {session.context.branch}
                </span>
              </>
            )}
          </div>
          {session.tags && session.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {session.tags.slice(0, 4).map((tagId) => (
                <Badge
                  key={tagId}
                  variant="secondary"
                  className="text-xs px-1.5 py-0"
                  style={{
                    backgroundColor: `${getTagColor(tagId)}20`,
                    color: getTagColor(tagId),
                    borderColor: getTagColor(tagId),
                  }}
                >
                  {tagId}
                </Badge>
              ))}
              {session.tags.length > 4 && (
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  +{session.tags.length - 4}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
