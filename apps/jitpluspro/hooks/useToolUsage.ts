import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import { logWarn } from '@/utils/devLogger';

/** Decayed open count of one tool and when it was last opened (ms). */
export interface ToolUse { score: number; at: number }
export type ToolUsage = Record<string, ToolUse>;

/** A use counts half after two weeks, so the order follows the merchant's current habits. */
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;

export function decayedScore(use: ToolUse | undefined, now: number): number {
  if (!use) return 0;
  const age = Math.max(0, now - use.at);
  return use.score * Math.pow(0.5, age / HALF_LIFE_MS);
}

/** Adds one use of `key` at `now` to `usage` (returns a new object). */
export function addUse(usage: ToolUsage, key: string, now: number): ToolUsage {
  return { ...usage, [key]: { score: decayedScore(usage[key], now) + 1, at: now } };
}

/**
 * Most used tools first. Stable: tools with the same score (e.g. never used)
 * keep their place in `tools`, which is the default order.
 */
export function rankByUsage<T extends { key: string }>(tools: T[], usage: ToolUsage, now: number): T[] {
  return tools
    .map((tool, index) => ({ tool, index, score: decayedScore(usage[tool.key], now) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.tool);
}

function parse(raw: string | null): ToolUsage {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return {};
    const usage: ToolUsage = {};
    for (const [key, use] of Object.entries(value as Record<string, ToolUse>)) {
      if (use && Number.isFinite(use.score) && Number.isFinite(use.at)) usage[key] = { score: use.score, at: use.at };
    }
    return usage;
  } catch {
    return {};
  }
}

/**
 * How often this merchant opens each Accueil tool, saved on the device per
 * account. `usage` is a snapshot taken when the screen loads and when the app
 * comes back to the foreground: a tap is saved right away but the cards only
 * move on the next visit, never under the merchant's finger.
 */
export function useToolUsage(merchantId: string | undefined) {
  const storageKey = merchantId ? `${ASYNC_STORAGE_KEYS.TOOL_USAGE}_${merchantId}` : null;
  const [snapshot, setSnapshot] = useState<{ key: string | null; usage: ToolUsage }>({ key: null, usage: {} });
  // Latest counts, ahead of the snapshot shown.
  const live = useRef<{ key: string | null; usage: ToolUsage; loaded: boolean }>({ key: null, usage: {}, loaded: false });

  useEffect(() => {
    if (!storageKey) return;
    let active = true;
    live.current = { key: storageKey, usage: {}, loaded: false };
    AsyncStorage.getItem(storageKey)
      .catch(() => null)
      .then((raw) => {
        if (!active || live.current.key !== storageKey) return;
        // Taps made before the read finished are added to the stored counts.
        const stored = parse(raw);
        const pending = live.current.usage;
        for (const [key, use] of Object.entries(pending)) {
          stored[key] = { score: decayedScore(stored[key], use.at) + use.score, at: use.at };
        }
        live.current = { key: storageKey, usage: stored, loaded: true };
        setSnapshot({ key: storageKey, usage: stored });
        if (Object.keys(pending).length > 0) {
          AsyncStorage.setItem(storageKey, JSON.stringify(stored)).catch(() => {
            logWarn('Preferences', 'Could not save tool usage');
          });
        }
      });
    return () => { active = false; };
  }, [storageKey]);

  // Re-rank when the merchant returns to the app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !live.current.loaded) return;
      const { key, usage } = live.current;
      setSnapshot((prev) => (prev.key === key && prev.usage === usage ? prev : { key, usage }));
    });
    return () => sub.remove();
  }, []);

  const record = useCallback((toolKey: string) => {
    if (!storageKey || live.current.key !== storageKey) return;
    const usage = addUse(live.current.usage, toolKey, Date.now());
    live.current = { ...live.current, usage };
    if (!live.current.loaded) return; // merged and saved once the read completes
    AsyncStorage.setItem(storageKey, JSON.stringify(usage)).catch(() => {
      logWarn('Preferences', 'Could not save tool usage');
    });
  }, [storageKey]);

  return {
    usage: snapshot.key === storageKey ? snapshot.usage : null,
    record,
  };
}
