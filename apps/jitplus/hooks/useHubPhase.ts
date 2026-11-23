import { useCallback, useState } from 'react';
import { useCloseOnBack } from '@/hooks/useCloseOnBack';

type HubPhase = 'main' | 'history';

/**
 * Main view / history toggle of the game hubs (scratch cards, collections).
 * `?view=history` opens the history first. In the history, Android Back
 * returns to the main view — only while the hub is on top: a screen opened
 * from the history (a card, a coupon) keeps its own Back press.
 */
export function useHubPhase(initialView: string | undefined) {
  const [phase, setPhase] = useState<HubPhase>(initialView === 'history' ? 'history' : 'main');

  const showMain = useCallback(() => setPhase('main'), []);
  useCloseOnBack(phase === 'history', showMain);
  const showHistory = useCallback(() => setPhase('history'), []);

  return { inHistory: phase === 'history', showMain, showHistory };
}
