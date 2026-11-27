"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ListMusic,
  ListPlus,
  Loader2,
  RefreshCw,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import type { RecommendationsState } from "@/types/jamify";

const POLL_INTERVAL_MS = 3_000;
export type GeminiView = "artists" | "playlists";

export function GeminiRecommendationsTab({
  activeView = "artists",
}: {
  activeView?: GeminiView;
}) {
  const [state, setState] = useState<RecommendationsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/recommendations");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load recommendations.");
      }
      setState(data as RecommendationsState);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load Gemini recommendations.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const isRunning =
    state?.latestJob?.status === "running" ||
    state?.latestJob?.status === "queued";

  // Poll cleanly while a background job is running (and resume on visibilitychange)
  useEffect(() => {
    if (!isRunning) return;

    const pollTimer = window.setInterval(() => {
      void fetchState();
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchState();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isRunning, fetchState]);

  // Live elapsed timer while running
  useEffect(() => {
    if (!isRunning || !state?.latestJob?.startedAt) {
      setElapsedSec(0);
      return;
    }

    const updateElapsed = () => {
      const started = new Date(state.latestJob!.startedAt).getTime();
      setElapsedSec(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    };
    updateElapsed();
    const tick = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(tick);
  }, [isRunning, state?.latestJob]);

  const handleRefresh = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/recommendations/refresh", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to start Gemini refresh.");
      }
      await fetchState();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to start Gemini refresh.",
      );
    } finally {
      setStarting(false);
    }
  };

  const handleFollowArtist = async (
    recId: string,
    spotifyArtistId: string,
  ) => {
    setBusyId(recId);
    setError(null);
    try {
      const res = await fetch("/api/spotify/followed-artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId: spotifyArtistId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to follow artist.");
      }
      setState((prev) =>
        prev
          ? {
              ...prev,
              artists: prev.artists.map((a) =>
                a.id === recId ? { ...a, isFollowed: true } : a,
              ),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to follow artist.");
    } finally {
      setBusyId(null);
    }
  };

  const handleAddPlaylist = async (playlistId: string) => {
    setBusyId(playlistId);
    setError(null);
    try {
      const res = await fetch(
        `/api/recommendations/playlists/${encodeURIComponent(playlistId)}/add`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to add playlist to Spotify.");
      }
      setState((prev) =>
        prev
          ? {
              ...prev,
              playlists: prev.playlists.map((p) =>
                p.id === playlistId
                  ? {
                      ...p,
                      addedSpotifyPlaylistId: data.spotifyPlaylistId,
                      addedSpotifyUrl: data.spotifyUrl,
                    }
                  : p,
              ),
            }
          : prev,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to add playlist to Spotify.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-400">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
        <p className="text-sm">Loading Gemini recommendations...</p>
      </div>
    );
  }

  const latestJob = state?.latestJob;
  const completedJob = state?.completedJob;

  return (
    <div className="space-y-5">
      {/* Control card */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Gemini Discovery</span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Uses your synced Spotify library to find unheard artists and
              build custom playlists.
            </p>
          </div>
          <button
            type="button"
            disabled={starting || isRunning}
            onClick={() => void handleRefresh()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${starting || isRunning ? "animate-spin" : ""}`}
            />
            {isRunning ? "Running..." : "Refresh"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
          <span className="rounded-full border border-zinc-700/80 bg-zinc-950/70 px-2.5 py-0.5">
            Default: <strong className="text-zinc-200">gemini-4-hydrogen</strong>
          </span>
          <span className="rounded-full border border-zinc-700/80 bg-zinc-950/70 px-2.5 py-0.5">
            Fallback: <strong className="text-zinc-200">gemini-3.5-flash-lite</strong>
          </span>
        </div>
      </div>

      {/* Live background job progress banner */}
      {isRunning && latestJob && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{latestJob.stage}</span>
            </div>
            <span className="text-[11px] tabular-nums text-emerald-300/80">
              {elapsedSec}s
            </span>
          </div>
          <p className="text-[11px] text-emerald-200/80">
            Running reliably in the background on{" "}
            <span className="font-mono">{latestJob.activeModel}</span>. You can
            switch tabs or close the app—results will be saved automatically.
          </p>
        </div>
      )}

      {/* Failed latest job alert */}
      {latestJob?.status === "failed" && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
            <AlertTriangle className="h-4 w-4" />
            <span>Last refresh failed</span>
          </div>
          <p className="text-xs text-red-200/80">
            {latestJob.errorMessage ?? "An unexpected error occurred."}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Last completed metadata badge */}
      {completedJob && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-zinc-400">
          <span>
            Generated with{" "}
            <strong className="font-mono text-zinc-200">
              {completedJob.activeModel}
            </strong>
            {completedJob.fallbackUsed && " (fallback)"}
          </span>
          {completedJob.completedAt && (
            <span>
              {new Date(completedJob.completedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {!completedJob && !isRunning && (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-12 text-center space-y-2">
          <Sparkles className="mx-auto h-8 w-8 text-emerald-400/80" />
          <h3 className="text-sm font-semibold text-zinc-100">
            Ready for fresh music
          </h3>
          <p className="mx-auto max-w-xs text-xs text-zinc-400">
            Tap <strong>Refresh</strong> above to let Gemini analyze your
            Spotify library and suggest unheard artists and custom playlists.
          </p>
        </div>
      )}

      {/* Separate buttons for Suggested Artists and Suggested Playlists */}
      {completedJob && state && (
        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href="/gemini/artists"
            className={`flex items-center justify-between rounded-2xl border px-3.5 py-3 text-left transition ${
              activeView === "artists"
                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <span className="inline-flex items-center gap-2 text-xs font-semibold">
              <Users className="h-4 w-4" />
              Suggested Artists
            </span>
            <span className="rounded-full bg-zinc-950/60 px-2 py-0.5 text-[11px] font-bold tabular-nums">
              {state.artists.length}
            </span>
          </Link>

          <Link
            href="/gemini/playlists"
            className={`flex items-center justify-between rounded-2xl border px-3.5 py-3 text-left transition ${
              activeView === "playlists"
                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <span className="inline-flex items-center gap-2 text-xs font-semibold">
              <ListMusic className="h-4 w-4" />
              Suggested Playlists
            </span>
            <span className="rounded-full bg-zinc-950/60 px-2 py-0.5 text-[11px] font-bold tabular-nums">
              {state.playlists.length}
            </span>
          </Link>
        </div>
      )}

      {/* Recommended Artists */}
      {activeView === "artists" && state && state.artists.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-100">
            Suggested Artists
          </h2>
          <div className="space-y-3">
            {state.artists.map((artist) => (
              <div
                key={artist.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-zinc-50">
                      {artist.name}
                    </h3>
                    <span className="mt-1 inline-block rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      {artist.genre}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {artist.spotifyUrl && (
                      <a
                        href={artist.spotifyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-zinc-700 p-2 text-zinc-300 hover:bg-zinc-800"
                        title="Open in Spotify"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {artist.spotifyArtistId && (
                      <button
                        type="button"
                        disabled={artist.isFollowed || busyId === artist.id}
                        onClick={() =>
                          void handleFollowArtist(
                            artist.id,
                            artist.spotifyArtistId!,
                          )
                        }
                        className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                          artist.isFollowed
                            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "bg-zinc-100 text-zinc-950 hover:bg-white disabled:opacity-50"
                        }`}
                      >
                        {busyId === artist.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : artist.isFollowed ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <UserPlus className="h-3.5 w-3.5" />
                        )}
                        {artist.isFollowed ? "Following" : "Follow"}
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-zinc-300">
                  {artist.reason}
                </p>

                {artist.sampleTracks.length > 0 && (
                  <p className="text-[11px] text-zinc-400">
                    <span className="text-zinc-500">Start with:</span>{" "}
                    {artist.sampleTracks.join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommended Playlists */}
      {activeView === "playlists" && state && state.playlists.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-100">
            Suggested Playlists
          </h2>
          <div className="space-y-3">
            {state.playlists.map((playlist) => {
              const isExpanded = expandedPlaylistId === playlist.id;
              const matchedCount = playlist.tracks.filter(
                (t) => t.spotifyUri,
              ).length;

              return (
                <div
                  key={playlist.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-zinc-50">
                        {playlist.title}
                      </h3>
                      <span className="shrink-0 rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-medium text-violet-300">
                        {playlist.vibe}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300">
                      {playlist.description}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {playlist.reason}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPlaylistId(isExpanded ? null : playlist.id)
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-200"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {matchedCount}/{playlist.tracks.length} tracks matched
                    </button>

                    {playlist.addedSpotifyPlaylistId ? (
                      <a
                        href={playlist.addedSpotifyUrl ?? "https://open.spotify.com"}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Added &middot; Open
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={matchedCount === 0 || busyId === playlist.id}
                        onClick={() => void handleAddPlaylist(playlist.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {busyId === playlist.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ListPlus className="h-3.5 w-3.5" />
                        )}
                        Add to Spotify
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="space-y-1.5 border-t border-zinc-800 pt-3">
                      {playlist.tracks.map((track, idx) => (
                        <div
                          key={`${playlist.id}-${idx}`}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-zinc-200">{track.title}</span>
                            <span className="text-zinc-500">
                              {" "}
                              &mdash; {track.artist}
                            </span>
                          </div>
                          {track.spotifyUrl ? (
                            <a
                              href={track.spotifyUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 hover:text-emerald-300"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-[10px] text-zinc-500">
                              unmatched
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
