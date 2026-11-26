import { notFound } from "next/navigation";
import { JamifyApp } from "@/components/jamify-app";
import type { SpotifySection } from "@/components/spotify-assets-tab";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_SECTIONS = new Set<SpotifySection>([
  "history",
  "liked",
  "artists",
  "playlists",
]);

export default async function SpotifySectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!VALID_SECTIONS.has(section as SpotifySection)) {
    notFound();
  }

  const user = await getSessionUser();
  return (
    <JamifyApp
      initialUser={user}
      activeTab="spotify"
      spotifySection={section as SpotifySection}
    />
  );
}
