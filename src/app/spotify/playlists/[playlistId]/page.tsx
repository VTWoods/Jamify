import { JamifyApp } from "@/components/jamify-app";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SpotifyPlaylistDetailPage({
  params,
}: {
  params: Promise<{ playlistId: string }>;
}) {
  const [{ playlistId }, user] = await Promise.all([params, getSessionUser()]);
  return (
    <JamifyApp
      initialUser={user}
      activeTab="spotify"
      spotifySection="playlists"
      spotifyPlaylistId={playlistId}
    />
  );
}
