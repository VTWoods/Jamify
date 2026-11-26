import type { SpotifyAssetsSnapshot } from "@/types/jamify";

export interface TopArtistStat {
  name: string;
  plays: number;
}

export interface MostPlayedTrackStat {
  trackName: string;
  artistNames: string;
  plays: number;
}

export interface PeakListeningWindowStat {
  label: "Morning" | "Afternoon" | "Evening" | "Late Night";
  hourRange: string;
  pct: number;
}

export interface SpotifyDashboardStats {
  totalPlaysTracked: number;
  uniqueArtistsInHistory: number;
  uniqueTracksInHistory: number;
  listeningVarietyPct: number;
  topRecentArtists: TopArtistStat[];
  mostPlayedTrack: MostPlayedTrackStat | null;
  peakListeningWindow: PeakListeningWindowStat | null;
  avgArtistPopularity: number | null;
  popularityLabel: string | null;
  totalPlaylistTracks: number;
}

export function computeSpotifyStats(
  snapshot: SpotifyAssetsSnapshot,
): SpotifyDashboardStats {
  const history = snapshot.history;
  const totalPlaysTracked = snapshot.summary.historyCount || history.length;

  const artistCounts = new Map<string, number>();
  const trackCounts = new Map<
    string,
    { trackName: string; artistNames: string; plays: number }
  >();
  const windowCounts: Record<
    "Morning" | "Afternoon" | "Evening" | "Late Night",
    number
  > = {
    Morning: 0,
    Afternoon: 0,
    Evening: 0,
    "Late Night": 0,
  };
  let validTimestamps = 0;

  for (const item of history) {
    // Count individual artists
    for (const rawName of item.artistNames.split(",")) {
      const name = rawName.trim();
      if (!name) continue;
      artistCounts.set(name, (artistCounts.get(name) ?? 0) + 1);
    }

    // Count individual tracks
    const existing = trackCounts.get(item.trackId);
    if (existing) {
      existing.plays += 1;
    } else {
      trackCounts.set(item.trackId, {
        trackName: item.trackName,
        artistNames: item.artistNames,
        plays: 1,
      });
    }

    // Time-of-day bucket
    const playedDate = new Date(item.playedAt);
    if (!Number.isNaN(playedDate.getTime())) {
      validTimestamps += 1;
      const hr = playedDate.getHours();
      if (hr >= 5 && hr < 12) {
        windowCounts.Morning += 1;
      } else if (hr >= 12 && hr < 17) {
        windowCounts.Afternoon += 1;
      } else if (hr >= 17 && hr < 22) {
        windowCounts.Evening += 1;
      } else {
        windowCounts["Late Night"] += 1;
      }
    }
  }

  const topRecentArtists: TopArtistStat[] = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([name, plays]) => ({ name, plays }));

  const sortedTracks = [...trackCounts.values()].sort(
    (a, b) => b.plays - a.plays || a.trackName.localeCompare(b.trackName),
  );
  const mostPlayedTrack = sortedTracks[0] ?? null;

  const uniqueTracksInHistory = trackCounts.size;
  const listeningVarietyPct =
    history.length > 0
      ? Math.round((uniqueTracksInHistory / history.length) * 100)
      : 0;

  const hourRanges: Record<PeakListeningWindowStat["label"], string> = {
    Morning: "5am–12pm",
    Afternoon: "12pm–5pm",
    Evening: "5pm–10pm",
    "Late Night": "10pm–5am",
  };

  let peakListeningWindow: PeakListeningWindowStat | null = null;
  if (validTimestamps > 0) {
    const [topLabel, topCount] = (
      Object.entries(windowCounts) as Array<
        [PeakListeningWindowStat["label"], number]
      >
    ).sort((a, b) => b[1] - a[1])[0];

    peakListeningWindow = {
      label: topLabel,
      hourRange: hourRanges[topLabel],
      pct: Math.round((topCount / validTimestamps) * 100),
    };
  }

  const popValues = snapshot.followedArtists
    .map((a) => a.popularity)
    .filter((p) => typeof p === "number" && p > 0);
  const avgArtistPopularity =
    popValues.length > 0
      ? Math.round(
          popValues.reduce((sum, v) => sum + v, 0) / popValues.length,
        )
      : null;

  const popularityLabel =
    avgArtistPopularity === null
      ? null
      : avgArtistPopularity >= 70
        ? "Mainstream"
        : avgArtistPopularity >= 45
          ? "Balanced"
          : "Indie / Deep Cuts";

  const totalPlaylistTracks = snapshot.playlists.reduce(
    (sum, p) => sum + (p.trackCount ?? 0),
    0,
  );

  return {
    totalPlaysTracked,
    uniqueArtistsInHistory: artistCounts.size,
    uniqueTracksInHistory,
    listeningVarietyPct,
    topRecentArtists,
    mostPlayedTrack,
    peakListeningWindow,
    avgArtistPopularity,
    popularityLabel,
    totalPlaylistTracks,
  };
}
