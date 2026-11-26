"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Heart,
  ListMusic,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  UserMinus,
  Users,
  Check,
  X,
} from "lucide-react";
import type {
  PlaylistTrackItem,
  SpotifyAssetsSnapshot,
  SpotifyPlaylistItem,
} from "@/types/jamify";

export type SpotifySection =
  | "overview"
  | "history"
  | "liked"
  | "artists"
  | "playlists";

const ONE_HOUR_MS = 60 * 60 * 1000;

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never synced";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SpotifyAssetsTab({
  section = "overview",
  playlistId = null,
  onAssetsUpdated,
}: {
  section?: SpotifySection;
  playlistId?: string | null;
  onAssetsUpdated?: (snapshot: SpotifyAssetsSnapshot) => void;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<SpotifyAssetsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Playlist detail state (driven by URL playlistId)
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrackItem[]>([]);
  const [playlistRestrictedReason, setPlaylistRestrictedReason] = useState<
    string | null
  >(null);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState(false);
  const [confirmRemovePlaylist, setConfirmRemovePlaylist] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const selectedPlaylist = useMemo(
    () =>
      playlistId
        ? (snapshot?.playlists.find((p) => p.playlistId === playlistId) ?? null)
        : null,
    [snapshot?.playlists, playlistId],
  );

  const loadAssets = useCallback(
    async (forceSync = false) => {
      if (forceSync) {
        setSyncing(true);
      }
      setError(null);

      try {
        const res = await fetch(
          forceSync ? "/api/spotify/assets/sync" : "/api/spotify/assets",
          { method: forceSync ? "POST" : "GET" },
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load Spotify assets.");
        }
        setSnapshot(data as SpotifyAssetsSnapshot);
        onAssetsUpdated?.(data as SpotifyAssetsSnapshot);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load Spotify assets.",
        );
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [onAssetsUpdated],
  );

  // Initial load + hourly auto-refresh + refresh when returning to the PWA after >1h
  useEffect(() => {
    void loadAssets(false);

    const interval = window.setInterval(() => {
      void loadAssets(false);
    }, ONE_HOUR_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadAssets(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadAssets]);

  // Load playlist tracks whenever the URL targets a specific playlistId
  useEffect(() => {
    if (!playlistId) {
      setPlaylistTracks([]);
      setPlaylistRestrictedReason(null);
      setEditingPlaylist(false);
      setConfirmRemovePlaylist(false);
      return;
    }

    let cancelled = false;
    setLoadingTracks(true);
    setPlaylistTracks([]);
    setPlaylistRestrictedReason(null);
    setEditingPlaylist(false);
    setConfirmRemovePlaylist(false);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/spotify/playlists/${encodeURIComponent(playlistId)}/tracks`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load tracks.");
        }
        setPlaylistTracks(data.tracks ?? []);
        if (data.restricted) {
          setPlaylistRestrictedReason(
            data.restrictionReason ??
              "Spotify restricts reading tracks for playlists you don't own.",
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load playlist tracks.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingTracks(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  useEffect(() => {
    if (selectedPlaylist) {
      setEditName(selectedPlaylist.name);
      setEditDescription(selectedPlaylist.description);
    }
  }, [selectedPlaylist]);

  const handleUnlikeSong = async (trackId: string) => {
    setBusyId(trackId);
    setError(null);
    try {
      const res = await fetch(
        `/api/spotify/liked-songs/${encodeURIComponent(trackId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to unlike song.");
      }
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              summary: {
                ...prev.summary,
                likedSongsTotal: Math.max(0, prev.summary.likedSongsTotal - 1),
                likedSongsCached: Math.max(
                  0,
                  prev.summary.likedSongsCached - 1,
                ),
              },
              likedSongs: prev.likedSongs.filter((s) => s.trackId !== trackId),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlike song.");
    } finally {
      setBusyId(null);
    }
  };

  const handleUnfollowArtist = async (artistId: string) => {
    setBusyId(artistId);
    setError(null);
    try {
      const res = await fetch(
        `/api/spotify/followed-artists/${encodeURIComponent(artistId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to unfollow artist.");
      }
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              summary: {
                ...prev.summary,
                followedArtistsTotal: Math.max(
                  0,
                  prev.summary.followedArtistsTotal - 1,
                ),
              },
              followedArtists: prev.followedArtists.filter(
                (a) => a.artistId !== artistId,
              ),
            }
          : prev,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to unfollow artist.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSavePlaylistDetails = async () => {
    if (!selectedPlaylist || !editName.trim()) return;
    setBusyId(selectedPlaylist.playlistId);
    setError(null);
    try {
      const res = await fetch(
        `/api/spotify/playlists/${encodeURIComponent(selectedPlaylist.playlistId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName.trim(),
            description: editDescription.trim(),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update playlist.");
      }
      const updated = {
        ...selectedPlaylist,
        name: data.name,
        description: data.description,
      };
      setEditingPlaylist(false);
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              playlists: prev.playlists.map((p) =>
                p.playlistId === updated.playlistId ? updated : p,
              ),
            }
          : prev,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update playlist.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleRemovePlaylistFromProfile = async (
    playlist: SpotifyPlaylistItem,
  ) => {
    setBusyId(playlist.playlistId);
    setError(null);
    try {
      const res = await fetch(
        `/api/spotify/playlists/${encodeURIComponent(playlist.playlistId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(
          data.error ?? "Failed to remove playlist from profile.",
        );
      }
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              summary: {
                ...prev.summary,
                playlistsTotal: Math.max(0, prev.summary.playlistsTotal - 1),
                ownedPlaylistsCount: playlist.isOwnedByUser
                  ? Math.max(0, prev.summary.ownedPlaylistsCount - 1)
                  : prev.summary.ownedPlaylistsCount,
              },
              playlists: prev.playlists.filter(
                (p) => p.playlistId !== playlist.playlistId,
              ),
            }
          : prev,
      );
      setConfirmRemovePlaylist(false);
      router.push("/spotify/playlists");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to remove playlist from profile.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleRemovePlaylistTrack = async (uri: string) => {
    if (!selectedPlaylist) return;
    setBusyId(uri);
    setError(null);
    try {
      const res = await fetch(
        `/api/spotify/playlists/${encodeURIComponent(selectedPlaylist.playlistId)}/tracks`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uri }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to remove track.");
      }
      setPlaylistTracks((prev) => prev.filter((t) => t.uri !== uri));
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              playlists: prev.playlists.map((p) =>
                p.playlistId === selectedPlaylist.playlistId
                  ? { ...p, trackCount: Math.max(0, p.trackCount - 1) }
                  : p,
              ),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove track.");
    } finally {
      setBusyId(null);
    }
  };

  const q = query.trim().toLowerCase();

  const filteredHistory = useMemo(
    () =>
      (snapshot?.history ?? []).filter(
        (h) =>
          !q ||
          h.trackName.toLowerCase().includes(q) ||
          h.artistNames.toLowerCase().includes(q),
      ),
    [snapshot?.history, q],
  );

  const filteredLiked = useMemo(
    () =>
      (snapshot?.likedSongs ?? []).filter(
        (s) =>
          !q ||
          s.trackName.toLowerCase().includes(q) ||
          s.artistNames.toLowerCase().includes(q),
      ),
    [snapshot?.likedSongs, q],
  );

  const filteredArtists = useMemo(
    () =>
      (snapshot?.followedArtists ?? []).filter(
        (a) =>
          !q ||
          a.name.toLowerCase().includes(q) ||
          a.genres.some((g) => g.toLowerCase().includes(q)),
      ),
    [snapshot?.followedArtists, q],
  );

  const filteredPlaylists = useMemo(
    () =>
      (snapshot?.playlists ?? [])
        .filter(
          (p) =>
            !q ||
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q),
        )
        .sort((a, b) => Number(b.isOwnedByUser) - Number(a.isOwnedByUser)),
    [snapshot?.playlists, q],
  );

  if (loading && !snapshot) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-400">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
        <p className="text-sm">Syncing your Spotify library...</p>
      </div>
    );
  }

  // Playlist detail sub-view
  if (section === "playlists" && selectedPlaylist) {
    return (
      <div className="space-y-4">
        <Link
          href="/spotify/playlists"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Playlists
        </Link>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {editingPlaylist ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                    placeholder="Playlist name"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                    placeholder="Description"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === selectedPlaylist.playlistId}
                      onClick={() => void handleSavePlaylistDetails()}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPlaylist(false)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="truncate text-lg font-bold text-zinc-50">
                    {selectedPlaylist.name}
                  </h2>
                  {selectedPlaylist.description && (
                    <p className="mt-1 text-xs text-zinc-400">
                      {selectedPlaylist.description}
                    </p>
                  )}
                  <p className="mt-1.5 text-[11px] text-zinc-500">
                    {selectedPlaylist.trackCount} tracks &middot; By{" "}
                    {selectedPlaylist.ownerName}
                  </p>
                </>
              )}
            </div>

            {!editingPlaylist && (
              <div className="flex items-center gap-1.5">
                {selectedPlaylist.isOwnedByUser && (
                  <button
                    type="button"
                    onClick={() => setEditingPlaylist(true)}
                    className="rounded-lg border border-zinc-700 p-2 text-zinc-300 hover:bg-zinc-800"
                    title="Edit playlist details"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {selectedPlaylist.spotifyUrl && (
                  <a
                    href={selectedPlaylist.spotifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-zinc-700 p-2 text-zinc-300 hover:bg-zinc-800"
                    title="Open in Spotify"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
          </div>

          {!editingPlaylist && (
            <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-3">
              {confirmRemovePlaylist ? (
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs text-red-300">
                    Remove from your Spotify profile?
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busyId === selectedPlaylist.playlistId}
                      onClick={() =>
                        void handleRemovePlaylistFromProfile(selectedPlaylist)
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-red-400 disabled:opacity-50"
                    >
                      {busyId === selectedPlaylist.playlistId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemovePlaylist(false)}
                      className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemovePlaylist(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove from profile
                </button>
              )}
            </div>
          )}
        </div>

        {loadingTracks ? (
          <div className="flex items-center justify-center py-10 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
          </div>
        ) : (
          <div className="space-y-2">
            {playlistTracks.map((track) => (
              <div
                key={`${track.uri}-${track.addedAt}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {track.name}
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {track.artistNames}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {track.spotifyUrl && (
                    <a
                      href={track.spotifyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  {selectedPlaylist.isOwnedByUser && (
                    <button
                      type="button"
                      disabled={busyId === track.uri}
                      onClick={() => void handleRemovePlaylistTrack(track.uri)}
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50"
                      title="Remove from playlist"
                    >
                      {busyId === track.uri ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {playlistRestrictedReason ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 text-center space-y-3">
                <p className="text-xs leading-relaxed text-zinc-400">
                  {playlistRestrictedReason}
                </p>
                {selectedPlaylist.spotifyUrl && (
                  <a
                    href={selectedPlaylist.spotifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Spotify
                  </a>
                )}
              </div>
            ) : (
              playlistTracks.length === 0 && (
                <p className="py-8 text-center text-xs text-zinc-500">
                  This playlist has no tracks yet.
                </p>
              )
            )}
          </div>
        )}
      </div>
    );
  }

  // Section detail views (History, Liked Songs, Followed Artists, Playlists)
  if (section !== "overview") {
    const titles: Record<Exclude<SpotifySection, "overview">, string> = {
      history: "Listening History",
      liked: "Liked Songs",
      artists: "Followed Artists",
      playlists: "Personal Playlists",
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/spotify"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <h2 className="text-sm font-semibold text-zinc-100">
            {titles[section]}
          </h2>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filter ${titles[section].toLowerCase()}...`}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {section === "history" && (
          <div className="space-y-2">
            <p className="px-1 text-[11px] text-zinc-500">
              Showing {filteredHistory.length} of{" "}
              {snapshot?.summary.historyCount ?? 0} saved plays. Jamify saves
              your full listening history in SQLite across hourly syncs
              (Spotify returns up to 50 recent plays per fetch).
            </p>
            {filteredHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {item.trackName}
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {item.artistNames} &middot;{" "}
                    {formatRelativeTime(item.playedAt)}
                  </p>
                </div>
                {item.spotifyUrl && (
                  <a
                    href={item.spotifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            ))}
            {filteredHistory.length === 0 && (
              <p className="py-8 text-center text-xs text-zinc-500">
                No recent listening history found.
              </p>
            )}
          </div>
        )}

        {section === "liked" && (
          <div className="space-y-2">
            {filteredLiked.map((song) => (
              <div
                key={song.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {song.trackName}
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {song.artistNames}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {song.spotifyUrl && (
                    <a
                      href={song.spotifyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={busyId === song.trackId}
                    onClick={() => void handleUnlikeSong(song.trackId)}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50"
                    title="Remove from Liked Songs"
                  >
                    {busyId === song.trackId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
            {filteredLiked.length === 0 && (
              <p className="py-8 text-center text-xs text-zinc-500">
                No liked songs match your filter.
              </p>
            )}
          </div>
        )}

        {section === "artists" && (
          <div className="space-y-2">
            {filteredArtists.map((artist) => (
              <div
                key={artist.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {artist.name}
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {artist.genres.slice(0, 3).join(", ") || "Followed artist"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {artist.spotifyUrl && (
                    <a
                      href={artist.spotifyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={busyId === artist.artistId}
                    onClick={() => void handleUnfollowArtist(artist.artistId)}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50"
                    title="Unfollow artist"
                  >
                    {busyId === artist.artistId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserMinus className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
            {filteredArtists.length === 0 && (
              <p className="py-8 text-center text-xs text-zinc-500">
                No followed artists match your filter.
              </p>
            )}
          </div>
        )}

        {section === "playlists" && (
          <div className="space-y-2">
            {filteredPlaylists.map((playlist) => (
              <Link
                key={playlist.id}
                href={`/spotify/playlists/${encodeURIComponent(playlist.playlistId)}`}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 text-left transition hover:border-emerald-500/40 hover:bg-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-100">
                      {playlist.name}
                    </p>
                    {playlist.isOwnedByUser && (
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        Yours
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-400">
                    {playlist.trackCount} tracks &middot; {playlist.ownerName}
                  </p>
                </div>
                <ListMusic className="h-4 w-4 shrink-0 text-zinc-500" />
              </Link>
            ))}
            {filteredPlaylists.length === 0 && (
              <p className="py-8 text-center text-xs text-zinc-500">
                No playlists match your filter.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Main Dashboard Overview
  const summary = snapshot?.summary;
  const latestPlayed = snapshot?.history[0];
  const latestLiked = snapshot?.likedSongs[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div>
          <p className="text-xs font-medium text-zinc-200">
            Spotify Library Sync
          </p>
          <p className="text-[11px] text-zinc-400">
            Updated {formatRelativeTime(snapshot?.sync.lastSyncedAt ?? null)}{" "}
            &middot; Auto-refreshes hourly
          </p>
        </div>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void loadAssets(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync now"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/spotify/history"
          className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-left transition active:scale-[0.98] hover:border-emerald-500/40"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-emerald-500/15 p-2 text-emerald-400">
              <Clock className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold text-zinc-50">
              {summary?.historyCount ?? 0}
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-zinc-100">
              Listening History
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-zinc-400">
              {latestPlayed
                ? `Last: ${latestPlayed.trackName}`
                : "Tap to view recent plays"}
            </p>
          </div>
        </Link>

        <Link
          href="/spotify/liked"
          className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-left transition active:scale-[0.98] hover:border-emerald-500/40"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-rose-500/15 p-2 text-rose-400">
              <Heart className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold text-zinc-50">
              {summary?.likedSongsTotal ?? 0}
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-zinc-100">Liked Songs</h3>
            <p className="mt-0.5 truncate text-[11px] text-zinc-400">
              {latestLiked
                ? `Latest: ${latestLiked.trackName}`
                : "Tap to manage saved tracks"}
            </p>
          </div>
        </Link>

        <Link
          href="/spotify/artists"
          className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-left transition active:scale-[0.98] hover:border-emerald-500/40"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-sky-500/15 p-2 text-sky-400">
              <Users className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold text-zinc-50">
              {summary?.followedArtistsTotal ?? 0}
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-zinc-100">
              Followed Artists
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-zinc-400">
              {summary?.topGenres.length
                ? summary.topGenres.slice(0, 2).join(", ")
                : "Tap to manage artists"}
            </p>
          </div>
        </Link>

        <Link
          href="/spotify/playlists"
          className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-left transition active:scale-[0.98] hover:border-emerald-500/40"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-violet-500/15 p-2 text-violet-400">
              <ListMusic className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold text-zinc-50">
              {summary?.playlistsTotal ?? 0}
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-zinc-100">
              Personal Playlists
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-zinc-400">
              {summary?.ownedPlaylistsCount ?? 0} owned by you
            </p>
          </div>
        </Link>
      </div>

      {summary && summary.topGenres.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium text-zinc-400">Your Top Genres</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {summary.topGenres.map((genre) => (
              <span
                key={genre}
                className="rounded-full border border-zinc-700/80 bg-zinc-800/80 px-2.5 py-1 text-xs capitalize text-zinc-200"
              >
                {genre}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
