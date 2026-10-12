import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { useClients, useNotificationHistory, useRewards, useTransactions } from '@/hooks/useQueryHooks';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import { sectionDone } from '@/components/stores/brand';

export type GuideStepId = 'program' | 'logo' | 'shop' | 'invite' | 'scan' | 'reward' | 'message';

export const GUIDE_STEP_ORDER: readonly GuideStepId[] = ['program', 'logo', 'shop', 'invite', 'scan', 'reward', 'message'];

/** Steps only the account owner can act on (team members cannot open these screens). */
const OWNER_ONLY: ReadonlySet<GuideStepId> = new Set(['program', 'logo', 'shop', 'message']);

export interface GuideStepState {
  id: GuideStepId;
  done: boolean;
  /** True for a team member on an owner-only step: shown, but not actionable nor counted. */
  locked: boolean;
}

export interface GuideProgress {
  steps: GuideStepState[];
  doneCount: number;
  /** Steps counted in the progress (locked ones excluded). */
  total: number;
  /** First actionable step still to do, or null when everything is done. */
  nextId: GuideStepId | null;
  allDone: boolean;
}

export type GuideDoneState = Record<GuideStepId, boolean>;

export function computeGuideProgress(done: GuideDoneState, isTeamMember: boolean): GuideProgress {
  const steps = GUIDE_STEP_ORDER.map((id) => {
    const locked = isTeamMember && OWNER_ONLY.has(id);
    return { id, done: !locked && done[id], locked };
  });
  const counted = steps.filter((s) => !s.locked);
  const doneCount = counted.filter((s) => s.done).length;
  const next = counted.find((s) => !s.done);
  return {
    steps,
    doneCount,
    total: counted.length,
    nextId: next?.id ?? null,
    allDone: doneCount === counted.length,
  };
}

function isStepId(v: unknown): v is GuideStepId {
  return typeof v === 'string' && (GUIDE_STEP_ORDER as readonly string[]).includes(v);
}

/**
 * Progress of the "Maîtrisez JitPlus" guide, detected from the merchant's real
 * data. Queries only run while the guide is open.
 */
export function useGuideProgress(active: boolean): GuideProgress {
  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const merchantId = merchant?.id;
  const enabled = active && !!merchantId;
  const ownerEnabled = enabled && !isTeamMember;

  const { data: rewards } = useRewards(ownerEnabled);
  const { data: clients } = useClients('', enabled);
  const { data: transactions } = useTransactions(enabled);
  const { data: notifications } = useNotificationHistory(ownerEnabled);

  const storageKey = merchantId ? `${ASYNC_STORAGE_KEYS.GUIDE_STEPS_DONE}:${merchantId}` : null;
  const [stored, setStored] = useState<ReadonlySet<GuideStepId>>(() => new Set());
  // Key whose stored steps are loaded; writing before that would erase them.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !storageKey || loadedKey === storageKey) return;
    let alive = true;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!alive) return;
        const next = new Set<GuideStepId>();
        try {
          const parsed: unknown = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) parsed.filter(isStepId).forEach((id) => next.add(id));
        } catch {
          // Corrupted value: rebuild from live data.
        }
        setStored(next);
        setLoadedKey(storageKey);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [active, storageKey, loadedKey]);

  const live = useMemo<GuideDoneState>(() => {
    const txs = transactions?.pages.flatMap((p) => p.transactions) ?? [];
    return {
      program: (rewards?.length ?? 0) > 0,
      logo: !!merchant?.logoUrl,
      // Same rule as the "Ma boutique" hub so both screens always agree.
      shop: !!merchant && sectionDone('appearance', merchant, []),
      invite: (clients?.length ?? 0) > 0 || txs.length > 0,
      scan: txs.some((tx) => tx.type === 'EARN_STAMPS'),
      reward: txs.some((tx) => tx.type === 'REDEEM_REWARD' && tx.status !== 'CANCELLED'),
      message: (notifications?.length ?? 0) > 0,
    };
  }, [rewards, clients, transactions, notifications, merchant]);

  // Persist newly detected steps; a done step never goes back to "to do".
  const written = useRef<{ key: string | null; ids: ReadonlySet<GuideStepId> }>({ key: null, ids: new Set() });
  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey) return;
    if (written.current.key !== storageKey) written.current = { key: storageKey, ids: stored };
    const base = written.current.ids;
    const added = GUIDE_STEP_ORDER.filter((id) => live[id] && !base.has(id));
    if (added.length === 0) return;
    const ids = new Set([...base, ...added]);
    written.current = { key: storageKey, ids };
    AsyncStorage.setItem(storageKey, JSON.stringify([...ids])).catch(() => {});
  }, [live, stored, storageKey, loadedKey]);

  return useMemo(() => {
    // Ignore steps stored for a previous account until this one's are loaded.
    const own = loadedKey === storageKey ? stored : new Set<GuideStepId>();
    const done = Object.fromEntries(
      GUIDE_STEP_ORDER.map((id) => [id, live[id] || own.has(id)]),
    ) as GuideDoneState;
    return computeGuideProgress(done, isTeamMember);
  }, [live, stored, loadedKey, storageKey, isTeamMember]);
}
