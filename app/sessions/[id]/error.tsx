"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SessionError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[memoria] Session error:", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm">
            ← Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-destructive">エラー</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>セッションの読み込みに失敗しました</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            セッションデータが破損しているか、読み込み中に問題が発生しました。
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground font-mono">
              Error ID: {error.digest}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={reset} variant="default">
              再試行
            </Button>
            <Link href="/">
              <Button variant="outline">セッション一覧に戻る</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
