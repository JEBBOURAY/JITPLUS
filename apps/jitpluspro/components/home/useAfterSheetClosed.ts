import { useCallback, useEffect, useRef } from 'react';

// iOS cannot present a Modal while another is still sliding out.
const SHEET_SWAP_MS = 350;

/**
 * Returns `afterSheetClosed(fn)`: runs `fn` once the sheet being closed has
 * finished its slide-down, so the next sheet can be presented. A newer call
 * replaces a pending one; nothing fires after unmount.
 */
export function useAfterSheetClosed() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return useCallback((fn: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, SHEET_SWAP_MS);
  }, []);
}
