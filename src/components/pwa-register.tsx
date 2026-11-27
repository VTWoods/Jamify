"use client";

import { useEffect } from "react";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __jamifyDeferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

export const PWA_PROMPT_CHANGE_EVENT = "jamify:pwa-prompt-change";

export function setDeferredInstallPrompt(
  prompt: BeforeInstallPromptEvent | null,
) {
  if (typeof window === "undefined") return;
  window.__jamifyDeferredPrompt = prompt;
  window.dispatchEvent(new Event(PWA_PROMPT_CHANGE_EVENT));
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return window.__jamifyDeferredPrompt ?? null;
}

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  return null;
}
