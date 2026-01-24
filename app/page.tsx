import { getSessions } from "@/lib/memoria/sessions";
import { SessionList } from "@/components/sessions/session-list";

export default async function SessionsPage() {
  const sessions = await getSessions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </p>
      </div>
      <SessionList sessions={sessions} />
    </div>
  );
}
