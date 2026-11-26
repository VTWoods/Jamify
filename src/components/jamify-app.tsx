"use client";

import { useState } from "react";
import Link from "next/link";
import { Car, Disc3, Library, LogOut, Sparkles } from "lucide-react";
import { CommutePlaylistsTab } from "@/components/commute-playlists-tab";
import {
  GeminiRecommendationsTab,
  type GeminiView,
} from "@/components/gemini-recommendations-tab";
import { PwaInstallButton } from "@/components/pwa-install-button";
import {
  SpotifyAssetsTab,
  type SpotifySection,
} from "@/components/spotify-assets-tab";
import type { CommuteKind, SessionUser } from "@/types/jamify";

export type TabId = "spotify" | "commute" | "gemini";

export function JamifyApp({
  initialUser,
  authError,
  activeTab = "spotify",
  spotifySection = "overview",
  spotifyPlaylistId = null,
  commuteKind = "morning",
  geminiView = "artists",
}: {
  initialUser: SessionUser | null;
  authError?: string | null;
  activeTab?: TabId;
  spotifySection?: SpotifySection;
  spotifyPlaylistId?: string | null;
  commuteKind?: CommuteKind;
  geminiView?: GeminiView;
}) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  if (!user) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-6 py-12">
        <div className="space-y-8">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                <Disc3 className="h-3.5 w-3.5" />
                <span>Jamify PWA</span>
              </div>
              <PwaInstallButton />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
              Your Spotify Library, Supercharged by Gemini
            </h1>
            <p className="text-sm leading-relaxed text-zinc-400">
              Manage your listening history, liked songs, followed artists, and
              playlists—then let Gemini discover unheard artists and craft
              custom playlists ready to add to Spotify.
            </p>
          </div>

          {authError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
              {authError}
            </div>
          )}

          <a
            href="/api/auth/spotify/login"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-[0.99]"
          >
            <Disc3 className="h-5 w-5" />
            Connect with Spotify
          </a>

          <p className="text-center text-[11px] text-zinc-500">
            Your Spotify tokens and Gemini API key stay strictly on your server.
          </p>
        </div>

        <footer className="pt-10 text-center text-xs text-zinc-600">
          Jamify &middot; Self-hosted Spotify PWA
        </footer>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-zinc-950">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 px-4 py-3 backdrop-blur-md">
        <Link href="/spotify" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Disc3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-zinc-50">
              Jamify
            </h1>
            <p className="text-[11px] text-zinc-400">
              {user.displayName ?? user.id}
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <PwaInstallButton />
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </header>

      {/* Main scrollable content */}
      <main className="flex-1 px-4 pb-24 pt-4">
        {activeTab === "spotify" ? (
          <SpotifyAssetsTab
            section={spotifySection}
            playlistId={spotifyPlaylistId}
          />
        ) : activeTab === "commute" ? (
          <CommutePlaylistsTab activeKind={commuteKind} />
        ) : (
          <GeminiRecommendationsTab activeView={geminiView} />
        )}
      </main>

      {/* Mobile bottom tab navigation */}
      <nav
        aria-label="Primary navigation"
        className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800/90 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        <div className="mx-auto grid max-w-lg grid-cols-3">
          <Link
            href="/spotify"
            className={`flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition ${
              activeTab === "spotify"
                ? "text-emerald-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Library className="h-5 w-5" />
            <span>Spotify</span>
          </Link>

          <Link
            href="/commute/morning"
            className={`flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition ${
              activeTab === "commute"
                ? "text-emerald-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Car className="h-5 w-5" />
            <span>Commute</span>
          </Link>

          <Link
            href="/gemini/artists"
            className={`flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition ${
              activeTab === "gemini"
                ? "text-emerald-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Sparkles className="h-5 w-5" />
            <span>Gemini</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
