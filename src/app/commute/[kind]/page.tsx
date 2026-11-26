import { notFound } from "next/navigation";
import { JamifyApp } from "@/components/jamify-app";
import { getSessionUser } from "@/lib/auth";
import type { CommuteKind } from "@/types/jamify";

export const dynamic = "force-dynamic";

const VALID_KINDS = new Set<CommuteKind>(["morning", "evening"]);

export default async function CommuteKindPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  if (!VALID_KINDS.has(kind as CommuteKind)) {
    notFound();
  }

  const user = await getSessionUser();
  return (
    <JamifyApp
      initialUser={user}
      activeTab="commute"
      commuteKind={kind as CommuteKind}
    />
  );
}
