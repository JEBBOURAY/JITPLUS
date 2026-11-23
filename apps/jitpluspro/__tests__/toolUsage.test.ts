jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

import { addUse, decayedScore, rankByUsage, type ToolUsage } from '@/hooks/useToolUsage';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;
const tools = ['agenda', 'stampCodes', 'messages', 'deals', 'games'].map((key) => ({ key }));
const keys = (list: { key: string }[]) => list.map((t) => t.key);

describe('tool usage ranking', () => {
  it('keeps the default order when nothing was used', () => {
    expect(keys(rankByUsage(tools, {}, NOW))).toEqual(['agenda', 'stampCodes', 'messages', 'deals', 'games']);
  });

  it('puts the most used tools first and keeps the rest in default order', () => {
    let usage: ToolUsage = {};
    usage = addUse(usage, 'games', NOW);
    usage = addUse(usage, 'deals', NOW);
    usage = addUse(usage, 'deals', NOW);
    expect(keys(rankByUsage(tools, usage, NOW))).toEqual(['deals', 'games', 'agenda', 'stampCodes', 'messages']);
  });

  it('lets recent use overtake an old habit', () => {
    let usage: ToolUsage = {};
    for (let i = 0; i < 4; i++) usage = addUse(usage, 'messages', NOW - 60 * DAY);
    usage = addUse(usage, 'agenda', NOW - DAY);
    usage = addUse(usage, 'agenda', NOW);
    expect(keys(rankByUsage(tools, usage, NOW)).slice(0, 2)).toEqual(['agenda', 'messages']);
  });

  it('halves a use every two weeks', () => {
    expect(decayedScore({ score: 4, at: NOW - 14 * DAY }, NOW)).toBeCloseTo(2);
    expect(decayedScore(undefined, NOW)).toBe(0);
  });
});
