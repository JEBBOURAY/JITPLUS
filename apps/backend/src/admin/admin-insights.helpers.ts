import { mapLimit } from '../common/tasks/cron-utils';
import type { InsightPeriod } from './admin-insights.service';

export type Row = Record<string, unknown>;

/** Time windows shared by every insights query. */
export interface Windows {
  days: InsightPeriod;
  now: Date;
  since: Date;
  prevSince: Date;
  d1: Date;
  d7: Date;
  d30: Date;
  in7: Date;
}

/** Postgres COUNT/SUM come back as bigint or Decimal: normalise everything to number. */
export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  const parsed = Number(String(v));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

/** First row of a single-row aggregate query, or an empty row. */
export async function firstRow(rows: Promise<Row[]>): Promise<Row> {
  return (await rows)[0] ?? {};
}

/** Promise.all over thunks with at most `limit` running; keeps order and tuple types. */
export async function allLimited<T extends readonly (() => Promise<unknown>)[]>(
  tasks: readonly [...T],
  limit: number,
): Promise<{ -readonly [K in keyof T]: T[K] extends () => Promise<infer R> ? R : never }> {
  return (await mapLimit(tasks, limit, (task) => task())) as never;
}
