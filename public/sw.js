/**
 * Prompt WhatsApp Messenger — service worker.
 *
 * Strategy:
 *  - Network-first for everything. We never want to show stale messages or a
 *    stale contact list cached from yesterday — that's worse than seeing a
 *    "no internet" placeholder.
 *  - When the network fails (offline tap on a phone), fall back to whatever
 *    we cached on the last successful navigation. The user gets the app shell
 *    and a friendly offline banner instead of a Chrome dino.
 *  - Skip caching API requests entirely — they're dynamic by definition and
 *    caching them would hide changes.
 *
 * Bump CACHE_VERSION when you change the SW so old caches get cleaned up.
 */
const CACHE_VERSION = "prompt-wa-v2";
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;

const SHELL_URLS = [
  "/",
  "/manifest.json",
  "/icons/icon-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/prompt-logo.png",
];

self.addEventListener("install", (event) => {
  // Pre-cache the shell so the very first offline visit still loads.
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Drop old caches when CACHE_VERSION bumps.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== APP_SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Don't touch API / webhook / login traffic — must hit the live server.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/r/") ||
    url.pathname.startsWith("/login")
  ) {
    return;
  }

  // Don't try to handle cross-origin (avoids CORS pitfalls).
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache the latest copy of static-ish assets (HTML, JS chunks, CSS).
        if (res.ok && (req.destination === "document" || req.destination === "script" || req.destination === "style" || req.destination === "image" || req.destination === "font")) {
          const copy = res.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          // Last-ditch fallback for navigation requests — return the cached
          // root so the app shell at least renders.
          if (req.mode === "navigate") {
            return caches.match("/");
          }
          return new Response("offline", { status: 503, statusText: "offline" });
        }),
      ),
  );
});

// Placeholder push handler — wire VAPID later when we add real notifications.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "New message", body: event.data.text() };
  }
  const title = data.title || "Prompt WA";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c && c.url.includes(self.location.origin)) {
          c.focus();
          if ("navigate" in c) c.navigate(target);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
