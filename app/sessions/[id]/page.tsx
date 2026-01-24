import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/memoria/sessions";
import { SessionDetail } from "@/components/sessions/session-detail";
import { Button } from "@/components/ui/button";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SessionPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm">
            ← Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold line-clamp-1">{session.summary}</h1>
      </div>
      <SessionDetail session={session} />
    </div>
  );
}
