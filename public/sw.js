const CACHE_NAME = "ecs-pwa-v6";

const CORE_ASSETS = [
  "/",
  "/app.html",
  "/styles.css",
  "/app.js",
  "/js/api.js",
  "/js/offline-queue.js",
  "/tw-built.css",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/images/cabinet-1.svg",
  "/images/cabinet-2.svg",
  "/images/cabinet-3.svg",
];

/** מטמון שלב התקנה — לא נכשל כולו אם נכשל נכס בודד (למשל / לא זמין) */
async function precacheSafe(cache) {
  for (const path of CORE_ASSETS) {
    try {
      const res = await fetch(new Request(path, { cache: "reload" }));
      if (res.ok) await cache.put(path, res);
    } catch {
      /* ignore */
    }
  }
}

function isNetworkFirstPath(pathname) {
  return (
    pathname === "/app.js" ||
    pathname === "/styles.css" ||
    pathname === "/app.html" ||
    pathname === "/tw-built.css" ||
    pathname.startsWith("/js/") ||
    pathname.startsWith("/images/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => precacheSafe(cache)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** נסה לסנכרן תור IndexedDB כשהדף חוזר למקוון — הלקוח מריץ processPendingWizardQueue */
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  /* קודם רשת ל־JS/CSS/HTML ותמונות — מונע תקיעות בגרסה ישנה של app.js */
  if (isNetworkFirstPath(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/app.html", clone));
          return response;
        })
        .catch(() => caches.match("/app.html"))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match("/app.html"));
    })
  );
});
