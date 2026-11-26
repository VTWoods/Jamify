export interface SessionUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ListeningHistoryItem {
  id: string;
  trackId: string;
  trackName: string;
  artistNames: string;
  albumName: string;
  albumImageUrl: string | null;
  spotifyUrl: string | null;
  playedAt: string;
}

export interface LikedSongItem {
  id: string;
  trackId: string;
  trackName: string;
  artistNames: string;
  albumName: string;
  albumImageUrl: string | null;
  spotifyUrl: string | null;
  addedAt: string;
}

export interface FollowedArtistItem {
  id: string;
  artistId: string;
  name: string;
  genres: string[];
  imageUrl: string | null;
  followers: number;
  popularity: number;
  spotifyUrl: string | null;
}

export interface SpotifyPlaylistItem {
  id: string;
  playlistId: string;
  name: string;
  description: string;
  ownerId: string;
  ownerName: string;
  isOwnedByUser: boolean;
  isPublic: boolean;
  trackCount: number;
  imageUrl: string | null;
  spotifyUrl: string | null;
}

export interface PlaylistTrackItem {
  id: string;
  uri: string;
  name: string;
  artistNames: string;
  albumName: string;
  albumImageUrl: string | null;
  spotifyUrl: string | null;
  addedAt: string;
}

export interface SpotifyAssetsSnapshot {
  sync: {
    lastSyncedAt: string | null;
    nextRefreshAt: string | null;
    isStale: boolean;
    status: string;
    lastError: string | null;
    refreshIntervalMinutes: number;
  };
  summary: {
    historyCount: number;
    likedSongsTotal: number;
    likedSongsCached: number;
    followedArtistsTotal: number;
    playlistsTotal: number;
    ownedPlaylistsCount: number;
    topGenres: string[];
  };
  history: ListeningHistoryItem[];
  likedSongs: LikedSongItem[];
  followedArtists: FollowedArtistItem[];
  playlists: SpotifyPlaylistItem[];
}

export interface RecommendationJobSummary {
  id: string;
  status: string;
  stage: string;
  primaryModel: string;
  activeModel: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface RecommendedArtistItem {
  id: string;
  name: string;
  genre: string;
  reason: string;
  sampleTracks: string[];
  spotifyArtistId: string | null;
  spotifyUrl: string | null;
  imageUrl: string | null;
  isFollowed: boolean;
}

export interface RecommendedPlaylistTrackItem {
  title: string;
  artist: string;
  spotifyUri: string | null;
  spotifyUrl: string | null;
  albumImageUrl: string | null;
}

export interface RecommendedPlaylistItem {
  id: string;
  title: string;
  description: string;
  vibe: string;
  reason: string;
  tracks: RecommendedPlaylistTrackItem[];
  addedSpotifyPlaylistId: string | null;
  addedSpotifyUrl: string | null;
}

export interface RecommendationsState {
  latestJob: RecommendationJobSummary | null;
  completedJob: RecommendationJobSummary | null;
  artists: RecommendedArtistItem[];
  playlists: RecommendedPlaylistItem[];
}

export type CommuteKind = "morning" | "evening" | "discovery";

export interface CommuteConfigItem {
  id: string;
  kind: CommuteKind;
  name: string;
  description: string;
  targetMinutes: number;
  enabled: boolean;
  spotifyPlaylistId: string | null;
  spotifyUrl: string | null;
  lastGeneratedWeekKey: string | null;
  lastAppliedDateKey: string | null;
  lastAppliedWeekday: number | null;
  lastAppliedAt: string | null;
  updatedAt: string;
}

export interface CommuteTrackClientItem {
  title: string;
  artist: string;
  durationMs: number;
  spotifyUri: string | null;
  spotifyUrl: string | null;
  albumImageUrl: string | null;
}

export interface CommuteDailyEditionItem {
  id: string;
  weekKey: string;
  kind: CommuteKind;
  weekday: number;
  theme: string;
  totalDurationMs: number;
  tracks: CommuteTrackClientItem[];
}

export interface CommuteGenerationJobItem {
  id: string;
  weekKey: string;
  trigger: string;
  status: string;
  stage: string;
  primaryModel: string;
  activeModel: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface CommuteState {
  schedule: {
    timeZone: string;
    currentDateKey: string;
    currentWeekday: number;
    currentWeekKey: string;
    weeklyGenerationLabel: string;
    dailyRotationLabel: string;
  };
  configs: CommuteConfigItem[];
  latestJob: CommuteGenerationJobItem | null;
  activeWeekKey: string | null;
  morningEditions: CommuteDailyEditionItem[];
  eveningEditions: CommuteDailyEditionItem[];
  discoveryEdition: CommuteDailyEditionItem | null;
}
