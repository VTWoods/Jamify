import { notFound } from "next/navigation";
import { JamifyApp } from "@/components/jamify-app";
import type { GeminiView } from "@/components/gemini-recommendations-tab";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_VIEWS = new Set<GeminiView>(["artists", "playlists"]);

export default async function GeminiViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!VALID_VIEWS.has(view as GeminiView)) {
    notFound();
  }

  const user = await getSessionUser();
  return (
    <JamifyApp
      initialUser={user}
      activeTab="gemini"
      geminiView={view as GeminiView}
    />
  );
}
