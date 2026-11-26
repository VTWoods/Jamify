"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(true);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;

    setIsInstalled(standalone);

    const ua = window.navigator.userAgent;
    const iosDevice =
      /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === "MacIntel" &&
        window.navigator.maxTouchPoints > 1);
    setIsIos(iosDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstalled(false);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowIosGuide(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (isInstalled) return null;
  if (!deferredPrompt && !isIos) return null;

  const handleClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      return;
    }

    if (isIos) {
      setShowIosGuide((prev) => !prev);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void handleClick()}
        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
        title="Install Jamify app"
      >
        <Download className="h-3.5 w-3.5" />
        <span>Install</span>
      </button>

      {showIosGuide && (
        <div className="absolute right-0 top-10 z-30 w-64 rounded-2xl border border-zinc-700 bg-zinc-900 p-3.5 text-xs text-zinc-200 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-zinc-50">Install Jamify on iOS</p>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="text-zinc-400 hover:text-zinc-200"
              aria-label="Close install instructions"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1.5 leading-relaxed text-zinc-400">
            Tap the{" "}
            <Share className="mx-0.5 inline h-3.5 w-3.5 text-zinc-200" />{" "}
            <strong>Share</strong> button in Safari, then choose{" "}
            <strong className="text-zinc-200">Add to Home Screen</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
