import { JamifyApp } from "@/components/jamify-app";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SpotifyOverviewPage() {
  const user = await getSessionUser();
  return (
    <JamifyApp
      initialUser={user}
      activeTab="spotify"
      spotifySection="overview"
    />
  );
}
