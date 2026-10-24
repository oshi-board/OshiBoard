
"use strict";

/* ========================================
   推しボード Service Worker
======================================== */

const CACHE_NAME = "oshiboard-app-v4";

const APP_FILES = [
  "./",
  "./index.html",
  "./policy.html",
  "./style.css",
  "./data.js",
  "./app.js",
  "./members.json",
  "./manifest.json",
  "./icon.svg"
];

// ----------------------------------------
// インストール時
// ----------------------------------------

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// ----------------------------------------
// 古いキャッシュの削除
// ----------------------------------------

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key =>
            key.startsWith("oshiboard-app-") &&
            key !== CACHE_NAME
          )
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ----------------------------------------
// ファイル読み込み
// ----------------------------------------

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 他サイトの通信は扱わない
  if (url.origin !== self.location.origin) {
    return;
  }

  // アプリのスコープ外は扱わない
  if (!url.pathname.startsWith(
    new URL(self.registration.scope).pathname
  )) {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached => {
        // オンラインでは新しい内容を優先
        return fetch(request)
          .then(response => {
            if (response.ok) {
              const copy = response.clone();

              caches.open(CACHE_NAME)
                .then(cache =>
                  cache.put(request, copy)
                )
                .catch(error =>
                  console.warn("キャッシュ保存失敗", error)
                );
            }

            return response;
          })
          .catch(() => {
            if (cached) return cached;

            // ナビゲーション時のオフライン代替
            if (request.mode === "navigate") {
              return caches.match("./index.html");
            }

            return Response.error();
          });
      })
  );
});
