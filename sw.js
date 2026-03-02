/* file: frontend/sw.js */
"use strict";

/**
 * VoiceSafe SW (enterprise-grade)
 * - Versioned caches + safe cleanup
 * - Precache core shell
 * - Runtime cache for CDN assets (tailwind, fontawesome)
 * - Offline fallback for navigation
 * - NEVER cache API calls (/upload, /cases, /health, /verify-session, etc.)
 */

const SW_VERSION = "2026-02-28.1";
const CACHE_CORE = `vs-core-${SW_VERSION}`;
const CACHE_ASSETS = `vs-assets-${SW_VERSION}`;
const CACHE_PAGES = `vs-pages-${SW_VERSION}`;

// Core shell (keep small and stable)
const PRECACHE = [
  "/", // index.html (if served at /)
  "/index.html", // or directly
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.png",
  "/og-image.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png"
];

// Never cache these (API + dynamic endpoints)
const NEVER_CACHE_PATH_PREFIXES = [
  "/upload",
  "/health",
  "/cases",
  "/case/",
  "/verify-session",
  "/create-portal-session"
];

function isNeverCache(url) {
  try {
    const u = new URL(url);
    return NEVER_CACHE_PATH_PREFIXES.some(p => u.pathname === p || u.pathname.startsWith(p));
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_CORE);
    await cache.addAll(PRECACHE);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // cleanup old caches
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      const keep = [CACHE_CORE, CACHE_ASSETS, CACHE_PAGES].includes(k);
      if (!keep) return caches.delete(k);
    }));
    self.clients.claim();
  })());
});

// Helpers: cache strategies
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // cache only successful GET responses
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await fetchPromise) || Response.error();
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw new Error("network_first_failed");
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== "GET") return;

  // Never cache API-like endpoints
  if (isNeverCache(req.url)) return;

  // Same-origin navigation -> network first + offline fallback
  const isNavigation = req.mode === "navigate";
  if (isNavigation) {
    event.respondWith((async () => {
      try {
        // Prefer network for latest build, fallback to cache
        return await networkFirst(req, CACHE_PAGES);
      } catch {
        const cache = await caches.open(CACHE_CORE);
        const offline = await cache.match("/offline.html");
        return offline || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  // Cache CDN assets (Tailwind/FontAwesome) - SWR
  const isCDN =
    url.hostname.includes("cdn.tailwindcss.com") ||
    url.hostname.includes("cdnjs.cloudflare.com");

  if (isCDN) {
    event.respondWith(staleWhileRevalidate(req, CACHE_ASSETS));
    return;
  }

  // Static same-origin assets -> cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, CACHE_ASSETS));
    return;
  }

  // External -> SWR (safe)
  event.respondWith(staleWhileRevalidate(req, CACHE_ASSETS));
});
