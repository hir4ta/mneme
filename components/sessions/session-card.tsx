import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Session } from "@/lib/memoria/types";

interface SessionCardProps {
  session: Session;
}

export function SessionCard({ session }: SessionCardProps) {
  const statusIcon = session.status === "completed" ? "✅" : "🔵";
  const date = new Date(session.endedAt || session.createdAt).toLocaleDateString("ja-JP");

  return (
    <Link href={`/sessions/${session.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <span>{statusIcon}</span>
              <span className="line-clamp-1">{session.summary}</span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <span>{session.user.name}</span>
            <span>·</span>
            <span>{date}</span>
            {session.context.branch && (
              <>
                <span>·</span>
                <span className="font-mono text-xs">{session.context.branch}</span>
              </>
            )}
          </div>
          {session.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {session.tags.slice(0, 5).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
