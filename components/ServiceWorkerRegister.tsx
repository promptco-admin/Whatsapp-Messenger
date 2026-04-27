"use client";

/**
 * Registers the PWA service worker on first load and shows two install hints:
 *
 *  1. Android / Chrome: a bottom toast "Install app" button. The browser fires
 *     a `beforeinstallprompt` event we can stash and trigger on click.
 *  2. iOS Safari: there's no programmatic install — you have to tap Share →
 *     Add to Home Screen. We show a one-time hint with a screenshot-style
 *     instruction so users actually do it.
 *
 * Both hints can be dismissed; the dismissal sticks in localStorage so the
 * banner doesn't follow people around forever.
 */
import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-hint-dismissed-v1";

export function ServiceWorkerRegister() {
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [showAndroidHint, setShowAndroidHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Register the service worker (only in production-served HTTPS or localhost).
    if ("serviceWorker" in navigator) {
      // Defer registration until the page is fully painted so it doesn't
      // compete with first-load JS work.
      const register = () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .catch((e) => console.warn("[pwa] sw register failed", e));
      };
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }

    // 2. Did the user already dismiss the hint? Stay quiet.
    const dismissed = localStorage.getItem(DISMISS_KEY) === "1";

    // 3. Detect "already installed" — Chrome sets `display-mode: standalone`,
    //    Safari has navigator.standalone. Skip hints in that case.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    if (standalone || dismissed) return;

    // 4. Android / Chrome: capture the install prompt event so we can fire it
    //    from a button click later.
    const onBip = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
      setShowAndroidHint(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // 5. iOS detection — Apple still doesn't fire beforeinstallprompt, so we
    //    sniff the user agent and show our manual instructions.
    const ua = navigator.userAgent || "";
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    if (isIos && isSafari) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShowAndroidHint(false);
    setShowIosHint(false);
  }

  async function installAndroid() {
    if (!bip) return;
    bip.prompt();
    const choice = await bip.userChoice;
    if (choice.outcome === "accepted") {
      // Browser will fire `appinstalled`; just close the banner.
      setShowAndroidHint(false);
    } else {
      // User said no — respect it.
      dismiss();
    }
  }

  if (!showAndroidHint && !showIosHint) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 sm:p-4">
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border border-wa-border bg-white p-3 shadow-lg">
        <img
          src="/icons/icon-180.png"
          alt=""
          width={40}
          height={40}
          className="mt-0.5 flex-none rounded"
        />
        <div className="flex-1 text-xs text-wa-text">
          <div className="mb-1 font-semibold">Install Prompt WA on your phone</div>
          {showAndroidHint && (
            <div>
              Get a home-screen icon, fullscreen view, and faster launches.
            </div>
          )}
          {showIosHint && (
            <div>
              Tap <b>Share</b> <span aria-hidden>↑</span> in Safari, then choose{" "}
              <b>Add to Home Screen</b>.
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {showAndroidHint && (
            <button
              onClick={installAndroid}
              className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-semibold text-white hover:bg-wa-green"
            >
              Install
            </button>
          )}
          <button
            onClick={dismiss}
            className="rounded px-3 py-1.5 text-xs text-wa-textMuted hover:bg-wa-panel"
          >
            {showIosHint ? "Got it" : "Not now"}
          </button>
        </div>
      </div>
    </div>
  );
}
