import { SessionCard } from "./session-card";
import type { Session } from "@/lib/memoria/types";

interface SessionListProps {
  sessions: Session[];
}

export function SessionList({ sessions }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No sessions found.</p>
        <p className="text-sm mt-2">
          Sessions will appear here after using Claude Code with the memoria plugin.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {sessions.map((session) => (
        <SessionCard key={session.id} session={session} />
      ))}
    </div>
  );
}
