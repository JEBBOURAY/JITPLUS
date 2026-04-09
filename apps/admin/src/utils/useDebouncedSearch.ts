import { useState, useEffect, useRef } from 'react';

const DEBOUNCE_MS = 350;

/**
 * Returns [search, setSearch, debouncedSearch] with a consistent 350ms debounce.
 * When `resetPage` is provided, it will be called on each debounced update.
 */
export function useDebouncedSearch(resetPage?: () => void): [string, (v: string) => void, string] {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      resetPage?.();
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [search]); // resetPage intentionally excluded to avoid re-debouncing

  return [search, setSearch, debouncedSearch];
}
