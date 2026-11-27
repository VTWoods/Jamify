"use client";

import { useEffect, useState } from "react";
import { Download, MoreVertical, Share, X } from "lucide-react";
import {
  getDeferredInstallPrompt,
  PWA_PROMPT_CHANGE_EVENT,
  setDeferredInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/components/pwa-register";

export function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(true);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">(
    "desktop",
  );
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const checkStandalone = () =>
      mediaQuery.matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;

    setIsInstalled(checkStandalone());
    setDeferredPrompt(getDeferredInstallPrompt());

    const ua = window.navigator.userAgent;
    const isIos =
      /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === "MacIntel" &&
        window.navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    setPlatform(isIos ? "ios" : isAndroid ? "android" : "desktop");

    const syncPrompt = () => {
      const prompt = getDeferredInstallPrompt();
      setDeferredPrompt(prompt);
      if (prompt) {
        setIsInstalled(false);
        setShowGuide(false);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowGuide(false);
    };

    const handleDisplayModeChange = () => {
      setIsInstalled(checkStandalone());
    };

    window.addEventListener(PWA_PROMPT_CHANGE_EVENT, syncPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    mediaQuery.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener(PWA_PROMPT_CHANGE_EVENT, syncPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      mediaQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  if (isInstalled) return null;

  const handleClick = async () => {
    const promptEvent = deferredPrompt ?? getDeferredInstallPrompt();
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
      }
      setDeferredInstallPrompt(null);
      setDeferredPrompt(null);
      return;
    }

    setShowGuide((prev) => !prev);
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

      {showGuide && (
        <div className="absolute right-0 top-10 z-30 w-68 rounded-2xl border border-zinc-700 bg-zinc-900 p-3.5 text-xs text-zinc-200 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-zinc-50">Install Jamify</p>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="text-zinc-400 hover:text-zinc-200"
              aria-label="Close install instructions"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {platform === "ios" ? (
            <p className="mt-1.5 leading-relaxed text-zinc-400">
              Tap the{" "}
              <Share className="mx-0.5 inline h-3.5 w-3.5 text-zinc-200" />{" "}
              <strong className="text-zinc-200">Share</strong> button in Safari,
              then choose{" "}
              <strong className="text-zinc-200">Add to Home Screen</strong>.
            </p>
          ) : platform === "android" ? (
            <p className="mt-1.5 leading-relaxed text-zinc-400">
              Tap the browser menu{" "}
              <MoreVertical className="mx-0.5 inline h-3.5 w-3.5 text-zinc-200" />{" "}
              and choose{" "}
              <strong className="text-zinc-200">Install app</strong> or{" "}
              <strong className="text-zinc-200">Add to Home screen</strong>.
              <span className="mt-1 block text-[11px] text-zinc-500">
                (If you just uninstalled, Chrome may hide the automatic prompt
                for a bit—installing from the menu works right away.)
              </span>
            </p>
          ) : (
            <p className="mt-1.5 leading-relaxed text-zinc-400">
              Click the <strong className="text-zinc-200">Install</strong> icon
              in your browser&apos;s address bar, or open the browser menu and
              select{" "}
              <strong className="text-zinc-200">Install Jamify</strong>.
              <span className="mt-1 block text-[11px] text-zinc-500">
                (Browsers temporarily suppress the automatic install popup after
                an uninstall.)
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
