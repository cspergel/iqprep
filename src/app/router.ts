import { useSyncExternalStore } from 'react';

/** Tiny hash router: works on any static host (no server rewrites needed). */
function getHash(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : `/${h}`;
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): string[] {
  const path = useSyncExternalStore(subscribe, getHash, () => '/');
  return path.split('/').filter(Boolean).map(decodeURIComponent);
}

export function navigate(path: string): void {
  const target = path.startsWith('/') ? path : `/${path}`;
  if (getHash() === target) return;
  window.location.hash = target;
  window.scrollTo({ top: 0 });
}
