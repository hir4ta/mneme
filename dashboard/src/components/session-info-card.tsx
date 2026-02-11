import { Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Session, Tag } from "@/lib/types";

export function SessionInfoCard({
  session,
  tags,
  date,
  userName,
  onDelete,
}: {
  session: Session;
  tags: Tag[];
  date: string;
  userName: string;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation("sessions");
  const { t: tc } = useTranslation("common");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const getTagColor = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId);
    return tag?.color || "#6B7280";
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await onDelete();
    } catch {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">
          {session.title || t("untitled")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{tc("user")}</span>
            <span>{userName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{tc("date")}</span>
            <span>{date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{tc("branch")}</span>
            <span className="font-mono text-xs">
              {session.context.branch || tc("na")}
            </span>
          </div>
          {session.context.repository && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{tc("repository")}</span>
              <span className="font-mono text-xs">
                {session.context.repository}
              </span>
            </div>
          )}
          {session.sessionType && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{tc("type")}</span>
              <Badge variant="outline" className="text-xs">
                {t(`types.${session.sessionType}`)}
              </Badge>
            </div>
          )}
          {session.status && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{tc("status")}</span>
              <Badge
                variant={
                  session.status === "complete" ? "default" : "secondary"
                }
                className="text-xs"
              >
                {session.status}
              </Badge>
            </div>
          )}
        </div>

        {/* Related Sessions */}
        {session.relatedSessions && session.relatedSessions.length > 0 && (
          <div className="pt-2 border-t">
            <span className="text-muted-foreground text-xs">
              {t("detail.relatedSessions")}
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {session.relatedSessions.map((relatedId) => (
                <Link
                  key={relatedId}
                  to={`/sessions/${relatedId}`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted hover:bg-muted/80 rounded text-xs font-mono transition-colors"
                >
                  <Link2 className="h-3 w-3" />
                  {relatedId}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        <div className="pt-2 border-t">
          <span className="text-muted-foreground text-xs">{tc("tags")}</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {(session.tags?.length ?? 0) > 0 ? (
              session.tags.map((tagId) => (
                <Badge
                  key={tagId}
                  variant="secondary"
                  className="text-xs"
                  style={{
                    backgroundColor: `${getTagColor(tagId)}20`,
                    color: getTagColor(tagId),
                    borderColor: getTagColor(tagId),
                  }}
                >
                  {tagId}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-xs">
                {tc("noTags")}
              </span>
            )}
          </div>
        </div>

        {/* Delete Session */}
        <div className="pt-2 border-t">
          {!deleteConfirm ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("detail.deleteSession")}
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-destructive">
                {t("detail.deleteConfirmMessage")}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-destructive border-destructive/50 hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? tc("deleting") : tc("delete")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                >
                  {tc("cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
