import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutAnimation } from 'react-native';
import { getErrorStatus } from '@jitplus/shared';
import api from '@/services/api';
import { useHapticWhenValid } from '@/hooks/useHapticWhenValid';

type ReferralStatus = 'idle' | 'checking' | 'valid' | 'invalid';

const CHECK_DELAY_MS = 600;
const MIN_LENGTH = 4;
// Same format as the backend `pro/register?ref=` link.
const LINK_CODE_RE = /^[A-Za-z0-9_-]{4,20}$/;

/** The code carried by an invitation link, or '' when absent or malformed. */
export function referralCodeFromLink(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const code = raw.trim();
  return LINK_CODE_RE.test(code) ? code.toUpperCase() : '';
}

/**
 * Referral code field: live check against the server (debounced, cached),
 * collapsed / expanded state and the "valid" haptic.
 *
 * Only a 404 means the code does not exist: a rate limit (the endpoint allows
 * 5 calls per minute) or a network error gives no verdict, and the server
 * checks the code again on submit.
 */
export function useReferralCode(initialCode = '') {
  const [code, setCode] = useState(initialCode);
  const [open, setOpen] = useState(!!initialCode);
  const [status, setStatus] = useState<ReferralStatus>(initialCode.length >= MIN_LENGTH ? 'checking' : 'idle');
  const [sponsorName, setSponsorName] = useState('');

  // Code → sponsor name, or null when the server said it does not exist.
  const cacheRef = useRef(new Map<string, string | null>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const initialCodeRef = useRef(initialCode);
  // A code filled in for the merchant (link, draft) is checked after a delay:
  // no "valid" buzz until they type one themselves.
  const hapticMutedRef = useRef(!!initialCode);

  /** Schedules the server check; only sets state once it answers. */
  const schedule = useCallback((trimmed: string, requestId: number) => {
    timerRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/auth/referral/check/${encodeURIComponent(trimmed)}`);
        const nom: string = data?.nom || data?.name || '';
        cacheRef.current.set(trimmed, nom);
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        setStatus('valid');
        setSponsorName(nom);
      } catch (error: unknown) {
        const notFound = getErrorStatus(error) === 404;
        if (notFound) cacheRef.current.set(trimmed, null);
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        setStatus(notFound ? 'invalid' : 'idle');
        setSponsorName('');
      }
    }, CHECK_DELAY_MS);
  }, []);

  const check = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = value.trim().toUpperCase();
    const requestId = ++requestIdRef.current;
    if (trimmed.length < MIN_LENGTH) {
      setStatus('idle');
      setSponsorName('');
      return;
    }
    // Already answered for this exact code: no request.
    const cached = cacheRef.current.get(trimmed);
    if (cached !== undefined) {
      setStatus(cached === null ? 'invalid' : 'valid');
      setSponsorName(cached ?? '');
      return;
    }
    setStatus('checking');
    schedule(trimmed, requestId);
  }, [schedule]);

  // A code from the invitation link: its 'checking' state is already set above.
  useEffect(() => {
    const initial = initialCodeRef.current.trim().toUpperCase();
    if (initial.length >= MIN_LENGTH) schedule(initial, ++requestIdRef.current);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [schedule]);

  const onChange = useCallback((value: string) => {
    hapticMutedRef.current = false;
    setCode(value);
    check(value);
  }, [check]);

  /** Fills the field for the merchant (saved draft). */
  const fill = useCallback((value: string) => {
    hapticMutedRef.current = true;
    setCode(value);
    setOpen(true);
    check(value);
  }, [check]);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  }, []);

  useHapticWhenValid(status === 'valid', hapticMutedRef);

  return { code, open, status, sponsorName, onChange, fill, toggle };
}

export type ReferralCodeState = ReturnType<typeof useReferralCode>;
