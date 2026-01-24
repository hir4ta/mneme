import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>ページが見つかりません</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            お探しのページは存在しないか、移動した可能性があります。
          </p>
          <Link href="/">
            <Button variant="default">ホームに戻る</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
