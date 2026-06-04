// Tiny in-memory cache so returning to a page shows its last data instantly
// (stale-while-revalidate). Lives for the lifetime of the tab; cleared on reload.
import { useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

const _cache = new Map<string, unknown>();

export function setCache<T>(key: string, value: T): void {
  _cache.set(key, value);
}
export function getCache<T>(key: string): T | undefined {
  return _cache.get(key) as T | undefined;
}

/** Invalidate cached entries so the next `useCached` mount refetches. With no
 *  argument, clears everything; with a prefix, only matching keys (e.g.
 *  `clearCache("overview:")` after a campaign is created). */
export function clearCache(prefix?: string): void {
  if (!prefix) {
    _cache.clear();
    return;
  }
  for (const key of [..._cache.keys()]) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

export interface CachedResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** HTTP status of the error when it was an ApiError (e.g. 400 = Meta not
   *  configured, 502 = Graph error). Lets callers react differently. */
  errorStatus: number | null;
}

/**
 * Fetch `fetcher()` for `key`, serving any cached value immediately and
 * revalidating in the background. The spinner (`loading`) only shows the very
 * first time a key has no cached data. `deps` re-runs the fetch when changed.
 *
 * On a deps/key change with no cached value, the PREVIOUS data is kept on
 * screen while the new fetch runs (instead of blanking the page) — this avoids
 * the jarring full-page skeleton/error flash when switching the date range.
 */
export function useCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): CachedResult<T> {
  const cached = getCache<T>(key);
  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    const existing = getCache<T>(key);
    // Use the fresh cache if present; otherwise keep showing the last data
    // (stale) rather than nulling it — prevents the flash on period switches.
    if (existing !== undefined) setData(existing);
    setError(null);
    setErrorStatus(null);
    setLoading(existing === undefined); // spinner only when we have nothing to show
    fetcherRef.current()
      .then((res) => {
        if (cancelled) return;
        setCache(key, res);
        setData(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erreur");
        setErrorStatus(e instanceof ApiError ? e.status : null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  return { data, loading, error, errorStatus };
}
