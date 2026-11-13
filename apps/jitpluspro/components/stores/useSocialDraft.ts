import { useCallback, useMemo, useState } from 'react';
import type { SocialLinks } from '@/types';
import { SOCIAL_KEYS, isValidSocial, normalizeSocial, type SocialKey } from '@/components/stores/brand';

export type SocialDraft = Record<SocialKey, string>;

function toSocialDraft(links?: SocialLinks | null): SocialDraft {
  return Object.fromEntries(SOCIAL_KEYS.map((k) => [k, links?.[k] ?? ''])) as SocialDraft;
}

function normalizeDraft(draft: SocialDraft): SocialDraft {
  return Object.fromEntries(SOCIAL_KEYS.map((k) => [k, normalizeSocial(k, draft[k])])) as SocialDraft;
}

/**
 * Editable copy of the brand's social links, shared by the "Ma boutique"
 * contact section and the setup wizard. Compared in normalized form so links
 * saved by older app versions (e.g. a website without https://) do not show
 * up as unsaved changes.
 */
export function useSocialDraft(saved?: SocialLinks | null) {
  const savedNormalized = useMemo(() => normalizeDraft(toSocialDraft(saved)), [saved]);
  const [draft, setDraft] = useState<SocialDraft>(() => toSocialDraft(saved));
  const normalized = useMemo(() => normalizeDraft(draft), [draft]);
  const invalid = useMemo(() => SOCIAL_KEYS.filter((k) => !isValidSocial(k, normalized[k])), [normalized]);
  const dirty = SOCIAL_KEYS.some((k) => normalized[k] !== savedNormalized[k]);

  const setField = useCallback((key: SocialKey, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** Links to send to `PATCH /merchant/profile` (empty fields left out). */
  const toLinks = useCallback((): SocialLinks => {
    const links: SocialLinks = {};
    for (const k of SOCIAL_KEYS) if (normalized[k]) links[k] = normalized[k];
    return links;
  }, [normalized]);

  const reset = useCallback((links?: SocialLinks | null) => setDraft(toSocialDraft(links)), []);

  return { draft, invalid, dirty, setField, toLinks, reset };
}
