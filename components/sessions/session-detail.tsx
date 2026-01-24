"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Session } from "@/lib/memoria/types";

const INITIAL_ITEMS = 10;
const LOAD_MORE_COUNT = 20;

interface SessionDetailProps {
  session: Session;
}

export function SessionDetail({ session }: SessionDetailProps) {
  const [visibleMessages, setVisibleMessages] = useState(INITIAL_ITEMS);
  const [visibleFiles, setVisibleFiles] = useState(INITIAL_ITEMS);

  const statusIcon = session.status === "completed" ? "✅" : "🔵";
  const createdDate = new Date(session.createdAt).toLocaleString("ja-JP");
  const endedDate = session.endedAt
    ? new Date(session.endedAt).toLocaleString("ja-JP")
    : null;

  const displayedMessages = session.messages.slice(0, visibleMessages);
  const hasMoreMessages = visibleMessages < session.messages.length;
  const displayedFiles = session.filesModified.slice(0, visibleFiles);
  const hasMoreFiles = visibleFiles < session.filesModified.length;

  return (
    <div className="space-y-6">
      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <span>{statusIcon}</span>
            Session Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">User</p>
              <p className="font-medium">{session.user.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <p className="font-medium capitalize">{session.status.replace("_", " ")}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Started</p>
              <p className="font-medium">{createdDate}</p>
            </div>
            {endedDate && (
              <div>
                <p className="text-muted-foreground">Ended</p>
                <p className="font-medium">{endedDate}</p>
              </div>
            )}
            {session.context.branch && (
              <div>
                <p className="text-muted-foreground">Branch</p>
                <p className="font-medium font-mono text-xs">{session.context.branch}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">Project</p>
              <p className="font-medium font-mono text-xs truncate">
                {session.context.projectDir}
              </p>
            </div>
          </div>
          {session.tags.length > 0 && (
            <div>
              <p className="text-muted-foreground text-sm mb-2">Tags</p>
              <div className="flex flex-wrap gap-1">
                {session.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key Decisions */}
      {session.keyDecisions && session.keyDecisions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Key Decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-sm">
              {session.keyDecisions.map((decision, i) => (
                <li key={`decision-${i}`}>{decision}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Files Modified */}
      {session.filesModified.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Files Modified ({session.filesModified.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {displayedFiles.map((file, i) => (
                <div
                  key={`${file.path}-${i}`}
                  className="flex items-center gap-2 text-sm font-mono"
                >
                  <span
                    className={
                      file.action === "created"
                        ? "text-green-600"
                        : file.action === "deleted"
                          ? "text-red-600"
                          : "text-yellow-600"
                    }
                  >
                    {file.action === "created"
                      ? "+"
                      : file.action === "deleted"
                        ? "-"
                        : "~"}
                  </span>
                  <span className="truncate">{file.path}</span>
                  {file.summary && (
                    <span className="text-muted-foreground text-xs truncate">
                      — {file.summary}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {hasMoreFiles && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 w-full"
                onClick={() => setVisibleFiles((v) => v + LOAD_MORE_COUNT)}
              >
                さらに表示（残り {session.filesModified.length - visibleFiles} 件）
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Messages */}
      {session.messages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Conversation ({session.messages.length} messages)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {displayedMessages.map((message, i) => (
                <div
                  key={`${message.timestamp}-${i}`}
                  className={`p-3 rounded-lg ${
                    message.type === "user"
                      ? "bg-primary/10 ml-8"
                      : "bg-muted mr-8"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span className="font-medium capitalize">{message.type}</span>
                    <span>·</span>
                    <span>{new Date(message.timestamp).toLocaleTimeString("ja-JP")}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.toolUses && message.toolUses.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <span>Tools: </span>
                      {message.toolUses.map((t) => t.tool).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {hasMoreMessages && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 w-full"
                onClick={() => setVisibleMessages((v) => v + LOAD_MORE_COUNT)}
              >
                さらに表示（残り {session.messages.length - visibleMessages} 件）
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
