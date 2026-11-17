/// <reference types="vitest" />
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Writes dist/sw.js after the build: a small service worker that precaches every built file so the
 * app works fully offline once opened (and can be installed to an iPad/phone home screen).
 */
function offlineServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'brain-camp-offline-sw',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir;
    },
    async writeBundle() {
      const { writeFileSync } = await import('node:fs');
      const files: string[] = [];
      const walk = (dir: string, rel = '') => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          const r = rel ? `${rel}/${name}` : name;
          if (statSync(full).isDirectory()) walk(full, r);
          else if (name !== 'sw.js') files.push(r);
        }
      };
      walk(outDir);
      const version = Date.now().toString(36);
      const sw = `// Generated at build time — do not edit.
const CACHE = 'brain-camp-${version}';
const ASSETS = ${JSON.stringify(['./', ...files.map((f) => `./${f}`)])};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Network first for the page (to pick up new versions), offline fallback to the cached app.
    e.respondWith(fetch(req).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
`;
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

// base './' keeps asset paths relative so the built site works from any folder or host.
export default defineConfig({
  base: './',
  plugins: [react(), offlineServiceWorker()],
  build: { chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
