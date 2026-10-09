'use client';

import { useEffect } from 'react';

export default function AuthRouteWarmup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return undefined;

    let cancelled = false;
    const warmLogin = () => {
      if (!cancelled) fetch('/login', { credentials: 'same-origin' }).catch(() => {});
    };

    const idleId = 'requestIdleCallback' in window
      ? window.requestIdleCallback(warmLogin, { timeout: 1500 })
      : window.setTimeout(warmLogin, 250);

    return () => {
      cancelled = true;
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, []);

  return null;
}
