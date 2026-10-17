import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEBOUNCE_MS = 350;

/**
 * List filters stored in the URL query string, so a filtered view can be
 * linked to (e.g. from the dashboard) and survives a reload or back button.
 * Changing any filter other than `page` sends the user back to page 1.
 */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const defaultsRef = useRef(defaults);

  const filters = useMemo(() => {
    const out = { ...defaultsRef.current } as T;
    for (const k of Object.keys(out)) {
      const v = params.get(k);
      if (v !== null) (out as Record<string, string>)[k] = v;
    }
    return out;
  }, [params]);

  const page = Math.max(1, Number(params.get('page')) || 1);

  const update = useCallback(
    (patch: Partial<T> & { page?: number }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (k === 'page') continue;
            if (v === undefined || v === '' || v === defaultsRef.current[k]) next.delete(k);
            else next.set(k, String(v));
          }
          const p = patch.page ?? 1;
          if (p > 1) next.set('page', String(p));
          else next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const active = Object.entries(filters).some(([k, v]) => k !== 'search' && v !== defaultsRef.current[k]);

  return { filters, page, update, reset, active };
}

/** Text input state that commits to `onCommit` after the user stops typing. */
export function useDebouncedInput(value: string, onCommit: (v: string) => void): [string, (v: string) => void] {
  const [text, setText] = useState(value);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => { setText(value); }, [value]);

  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => commitRef.current(text), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text, value]);

  return [text, setText];
}
