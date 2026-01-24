import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMemoriaDir } from "@/lib/memoria/paths";

export default function SettingsPage() {
  const memoriaDir = getMemoriaDir();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Data Location</CardTitle>
          <CardDescription>
            Where memoria stores its data files
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
            {memoriaDir}
          </code>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About memoria</CardTitle>
          <CardDescription>
            Long-term memory plugin for Claude Code
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            memoria automatically records your Claude Code sessions, decisions,
            and coding patterns to provide context-aware assistance.
          </p>
          <p>
            Data is stored locally in JSON files and never sent to external servers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
