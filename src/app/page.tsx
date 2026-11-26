import { Disc3, Sparkles, Database, Smartphone } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-between px-6 py-12">
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <Disc3 className="h-3.5 w-3.5" />
            <span>Jamify PWA</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
            Smart Spotify Playlists, Powered by Gemini
          </h1>
          <p className="text-sm leading-relaxed text-zinc-400">
            Jamify is bootstrapped and ready for Spotify OAuth and Gemini
            playlist generation features.
          </p>
        </header>

        <section className="grid gap-3">
          <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Installable Mobile PWA
              </h2>
              <p className="text-xs text-zinc-400">
                Web App Manifest and service worker configured for home-screen
                installation over HTTPS.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                SQLite + Drizzle ORM
              </h2>
              <p className="text-xs text-zinc-400">
                Backed by a persistent local SQLite database with WAL mode and
                automated migrations.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Server-Side Gemini &amp; Spotify APIs
              </h2>
              <p className="text-xs text-zinc-400">
                API keys and OAuth tokens stay strictly on your server—never
                exposed to the browser.
              </p>
            </div>
          </div>
        </section>
      </div>

      <footer className="pt-10 text-center text-xs text-zinc-500">
        Jamify &middot; Self-hosted Spotify playlist manager
      </footer>
    </main>
  );
}
