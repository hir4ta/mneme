import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Session } from "@/lib/types";

export function ContextRestorationCard({ session }: { session: Session }) {
  const { t } = useTranslation("sessions");
  const { t: tc } = useTranslation("common");
  const [copied, setCopied] = useState(false);

  // Collect all modified files from session.files
  // Handle both string[] and {path: string}[] formats
  const modifiedFiles = new Set<string>();
  const files =
    (session as { files?: (string | { path: string })[] }).files || [];
  for (const file of files) {
    const path = typeof file === "string" ? file : file.path;
    if (path) modifiedFiles.add(path);
  }

  const projectDir = session.context?.projectDir;
  const branch = session.context?.branch;

  // Generate resume command for mneme
  const resumeCommand = `/mneme:resume ${session.sessionId || session.id}`;

  const copyResumeCommand = () => {
    navigator.clipboard.writeText(resumeCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!projectDir && !branch && modifiedFiles.size === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Context</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {t("contextRestoration.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Resume */}
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">
            {t("contextRestoration.quickResume")}
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted p-2 rounded text-sm font-mono overflow-x-auto">
              {resumeCommand}
            </code>
            <Button variant="outline" size="sm" onClick={copyResumeCommand}>
              {copied ? tc("copied") : tc("copy")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("contextRestoration.quickResumeDescription")}
          </p>
        </div>

        {/* Modified Files */}
        {modifiedFiles.size > 0 && (
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-2">
              {t("contextRestoration.modifiedFiles", {
                count: modifiedFiles.size,
              })}
            </div>
            <div className="max-h-48 overflow-y-auto">
              <div className="flex flex-wrap gap-1">
                {Array.from(modifiedFiles)
                  .sort()
                  .map((file) => (
                    <Badge
                      key={file}
                      variant="secondary"
                      className="text-xs font-mono"
                    >
                      {file.split("/").pop()}
                    </Badge>
                  ))}
              </div>
            </div>
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer">
                {t("contextRestoration.showFullPaths")}
              </summary>
              <div className="mt-2 space-y-1">
                {Array.from(modifiedFiles)
                  .sort()
                  .map((file) => (
                    <div
                      key={file}
                      className="text-xs font-mono text-muted-foreground truncate"
                    >
                      {file}
                    </div>
                  ))}
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
