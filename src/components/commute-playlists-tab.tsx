"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Clock,
  Compass,
  ExternalLink,
  Loader2,
  Moon,
  RefreshCw,
  Sun,
  Upload,
} from "lucide-react";
import type { CommuteKind, CommuteState } from "@/types/jamify";

const POLL_INTERVAL_MS = 3_000;

const WEEKDAYS: Array<{ num: number; short: string; full: string }> = [
  { num: 1, short: "Mon", full: "Monday" },
  { num: 2, short: "Tue", full: "Tuesday" },
  { num: 3, short: "Wed", full: "Wednesday" },
  { num: 4, short: "Thu", full: "Thursday" },
  { num: 5, short: "Fri", full: "Friday" },
];

function formatDurationMinutes(ms: number): string {
  const mins = Math.round(ms / 60_000);
  return `${mins} min`;
}

function formatTrackDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CommutePlaylistsTab({
  activeKind = "morning",
}: {
  activeKind?: CommuteKind;
}) {
  const [state, setState] = useState<CommuteState | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingGen, setStartingGen] = useState(false);
  const [applyingDay, setApplyingDay] = useState<number | null>(null);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [selectedWeekday, setSelectedWeekday] = useState<number>(() => {
    const d = new Date().getDay();
    return d >= 1 && d <= 5 ? d : 1;
  });
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/commute");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load commute playlists.");
      }
      setState(data as CommuteState);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load commute playlists.",
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

  useEffect(() => {
    if (!isRunning) return;
    const poll = window.setInterval(() => {
      void fetchState();
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchState();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isRunning, fetchState]);

  useEffect(() => {
    if (!isRunning || !state?.latestJob?.startedAt) {
      setElapsedSec(0);
      return;
    }
    const update = () => {
      const started = new Date(state.latestJob!.startedAt).getTime();
      setElapsedSec(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    };
    update();
    const tick = window.setInterval(update, 1000);
    return () => window.clearInterval(tick);
  }, [isRunning, state?.latestJob]);

  const handleGenerateWeek = async () => {
    setStartingGen(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/commute/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to start weekly generation.");
      }
      await fetchState();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to start weekly generation.",
      );
    } finally {
      setStartingGen(false);
    }
  };

  const handleApplyDay = async (weekday: number) => {
    setApplyingDay(weekday);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/commute/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: activeKind, weekday }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update Spotify playlist.");
      }
      if (activeKind === "discovery") {
        setSuccessMsg(
          "Updated Weekly Discovery on Spotify with this week's new-artist mix.",
        );
      } else {
        const dayName =
          WEEKDAYS.find((w) => w.num === weekday)?.full ?? `Day ${weekday}`;
        setSuccessMsg(
          `Updated ${activeKind === "morning" ? "Morning" : "Evening"} Commute on Spotify with ${dayName}'s lineup.`,
        );
      }
      await fetchState();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update Spotify playlist.",
      );
    } finally {
      setApplyingDay(null);
    }
  };

  const handleToggleEnabled = async (currentEnabled: boolean) => {
    setTogglingEnabled(true);
    setError(null);
    try {
      const res = await fetch("/api/commute/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: activeKind,
          enabled: !currentEnabled,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update schedule setting.");
      }
      await fetchState();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update schedule setting.",
      );
    } finally {
      setTogglingEnabled(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-400">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
        <p className="text-sm">Loading commute playlists...</p>
      </div>
    );
  }

  const config = state?.configs.find((c) => c.kind === activeKind);
  const isDiscovery = activeKind === "discovery";
  const editions =
    activeKind === "morning"
      ? (state?.morningEditions ?? [])
      : activeKind === "evening"
        ? (state?.eveningEditions ?? [])
        : state?.discoveryEdition
          ? [state.discoveryEdition]
          : [];
  const selectedEdition = isDiscovery
    ? (state?.discoveryEdition ?? undefined)
    : editions.find((e) => e.weekday === selectedWeekday);
  const latestJob = state?.latestJob;

  return (
    <div className="space-y-4">
      {/* Schedule & Weekly Generation Header */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <CalendarClock className="h-3.5 w-3.5" />
              <span>Constant Commute Playlists</span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Morning &amp; Evening commutes rotate Mon–Fri at 1 AM from
              followed artists, plus Weekly Discovery refreshes Sundays at 1 AM
              with new songs from unfollowed artists.
            </p>
          </div>
          <button
            type="button"
            disabled={startingGen || isRunning}
            onClick={() => void handleGenerateWeek()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${startingGen || isRunning ? "animate-spin" : ""}`}
            />
            {isRunning ? "Generating..." : "Generate Week"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
          <span className="rounded-full border border-zinc-700/80 bg-zinc-950/70 px-2.5 py-0.5">
            Generate: <strong className="text-zinc-200">Sun 1:00 AM</strong>
          </span>
          <span className="rounded-full border border-zinc-700/80 bg-zinc-950/70 px-2.5 py-0.5">
            Rotate: <strong className="text-zinc-200">Mon–Fri 1:00 AM</strong>
          </span>
          {state?.schedule.timeZone && (
            <span className="rounded-full border border-zinc-700/80 bg-zinc-950/70 px-2.5 py-0.5">
              TZ: <strong className="text-zinc-200">{state.schedule.timeZone}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Live Generation Progress */}
      {isRunning && latestJob && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-1.5">
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
            Running in the background on{" "}
            <span className="font-mono">{latestJob.activeModel}</span>. Morning
            (5 days), Evening (5 days), and Weekly Discovery lineups are being
            saved to SQLite.
          </p>
        </div>
      )}

      {latestJob?.status === "failed" && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
            <AlertTriangle className="h-4 w-4" />
            <span>Last weekly generation failed</span>
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

      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <Check className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Morning / Evening / Discovery Toggle (URL-backed) */}
      <div className="grid grid-cols-3 gap-2">
        <Link
          href="/commute/morning"
          className={`flex items-center justify-center gap-1.5 rounded-2xl border px-2.5 py-3 transition ${
            activeKind === "morning"
              ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
              : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700"
          }`}
        >
          <Sun className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold">Morning</span>
        </Link>

        <Link
          href="/commute/evening"
          className={`flex items-center justify-center gap-1.5 rounded-2xl border px-2.5 py-3 transition ${
            activeKind === "evening"
              ? "border-indigo-400/60 bg-indigo-400/15 text-indigo-200"
              : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700"
          }`}
        >
          <Moon className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold">Evening</span>
        </Link>

        <Link
          href="/commute/discovery"
          className={`flex items-center justify-center gap-1.5 rounded-2xl border px-2.5 py-3 transition ${
            activeKind === "discovery"
              ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200"
              : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700"
          }`}
        >
          <Compass className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold">Discovery</span>
        </Link>
      </div>

      {/* Active Constant Playlist Status Card */}
      {config && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-zinc-50">{config.name}</h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                {activeKind === "morning"
                  ? "Upbeat, higher-tempo · Followed artists · ~1 hour"
                  : activeKind === "evening"
                    ? "Chill, relaxing · Followed artists · ~1 hour"
                    : "New songs from unfollowed similar artists · Refreshed Sundays at 1 AM"}
              </p>
              {config.lastAppliedAt && (
                <p className="mt-1 text-[11px] text-zinc-500">
                  {isDiscovery ? (
                    <>
                      Last synced:{" "}
                      <strong className="text-zinc-300">
                        {new Date(config.lastAppliedAt).toLocaleString()}
                      </strong>
                    </>
                  ) : (
                    <>
                      Active on Spotify:{" "}
                      <strong className="text-zinc-300">
                        {WEEKDAYS.find(
                          (w) => w.num === config.lastAppliedWeekday,
                        )?.full ?? `Day ${config.lastAppliedWeekday}`}
                      </strong>
                      {` · Updated ${new Date(config.lastAppliedAt).toLocaleString()}`}
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {config.spotifyUrl && (
                <a
                  href={config.spotifyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-zinc-700 p-2 text-zinc-300 hover:bg-zinc-800"
                  title="Open in Spotify"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <button
                type="button"
                disabled={togglingEnabled}
                onClick={() => void handleToggleEnabled(config.enabled)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                  config.enabled
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-400"
                }`}
              >
                {config.enabled ? "Auto ON" : "Paused"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weekday Selector Pills (Mon–Fri) for Morning/Evening, or Weekly Discovery view */}
      {editions.length > 0 ? (
        <div className="space-y-3">
          {!isDiscovery && (
            <div className="grid grid-cols-5 gap-1.5">
              {WEEKDAYS.map((day) => {
                const isSelected = selectedWeekday === day.num;
                const isActiveOnSpotify = config?.lastAppliedWeekday === day.num;
                return (
                  <button
                    key={day.num}
                    type="button"
                    onClick={() => setSelectedWeekday(day.num)}
                    className={`relative rounded-xl border py-2 text-center text-xs font-semibold transition ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                        : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {day.short}
                    {isActiveOnSpotify && (
                      <span
                        className="mx-auto mt-1 block h-1.5 w-1.5 rounded-full bg-emerald-400"
                        title="Currently live in Spotify"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {selectedEdition && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-100">
                    {isDiscovery
                      ? `This Week: ${selectedEdition.theme}`
                      : `${WEEKDAYS.find((w) => w.num === selectedWeekday)?.full}: ${selectedEdition.theme}`}
                  </p>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-zinc-400">
                    <Clock className="h-3.5 w-3.5" />
                    {selectedEdition.tracks.length} tracks &middot;{" "}
                    {formatDurationMinutes(selectedEdition.totalDurationMs)}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={applyingDay !== null}
                  onClick={() =>
                    void handleApplyDay(isDiscovery ? 0 : selectedWeekday)
                  }
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-white disabled:opacity-50"
                >
                  {applyingDay === (isDiscovery ? 0 : selectedWeekday) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Sync to Spotify
                </button>
              </div>

              <div className="space-y-1.5 border-t border-zinc-800 pt-3">
                {selectedEdition.tracks.map((track, idx) => (
                  <div
                    key={`${selectedEdition.id}-${idx}`}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="mr-2 tabular-nums text-zinc-500">
                        {idx + 1}.
                      </span>
                      <span className="text-zinc-200">{track.title}</span>
                      <span className="text-zinc-500">
                        {" "}
                        &mdash; {track.artist}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums text-[11px] text-zinc-500">
                        {formatTrackDuration(track.durationMs)}
                      </span>
                      {track.spotifyUrl && (
                        <a
                          href={track.spotifyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:text-emerald-300"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        !isRunning && (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-10 text-center space-y-2">
            <CalendarClock className="mx-auto h-8 w-8 text-emerald-400/80" />
            <h3 className="text-sm font-semibold text-zinc-100">
              No weekly commute playlists generated yet
            </h3>
            <p className="mx-auto max-w-xs text-xs text-zinc-400">
              Tap <strong>Generate Week</strong> above to create all 5 weekday
              editions for both Morning and Evening Commute now (or wait for
              Sunday at 1:00 AM).
            </p>
          </div>
        )
      )}
    </div>
  );
}
