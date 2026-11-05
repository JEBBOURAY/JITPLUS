import { randomUUID } from 'crypto';
import type { Logger } from '@nestjs/common';
import type { IPushProvider } from '../interfaces';
import type { IClientRepository, IRawQueryRunner } from '../repositories';
import { mapLimit } from './cron-utils';

/**
 * Batched delivery for the client (JitPlus) push campaigns.
 *
 * The crons used to claim and push one client at a time (≈3 DB round-trips +
 * 1 HTTP call per client). Here a batch costs one INSERT … RETURNING per 1000
 * recipients and one multicast per distinct message.
 */

export interface ClientPush {
  clientId: string;
  token: string;
  /** Dedup key: a (client, campaignId) pair is delivered at most once. */
  campaignId: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface ClientCampaignDeps {
  raw: IRawQueryRunner;
  push: IPushProvider;
  logger: Logger;
}

export interface ClientDeliveryResult {
  /** Pushes this run claimed (and therefore sent, or tried to send). */
  claimed: ClientPush[];
  /** Tokens FCM / Expo rejected as invalid — pass to clearStaleClientTokens. */
  staleTokens: string[];
}

/** Multicasts in flight at once (each one already batches up to 500 tokens). */
const MULTICAST_CONCURRENCY = 4;
/** Rows per claim INSERT / ids per IN (...) list: keeps statements and bind arrays bounded. */
export const CLIENT_CAMPAIGN_CHUNK = 1000;

const keyOf = (clientId: string, campaignId: string) => `${clientId}\u0000${campaignId}`;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Claim-first dedup, in bulk: inserts the tracker rows BEFORE sending and
 * returns the keys this call actually inserted. The unique index
 * (client_id, campaign_id, channel) arbitrates, so exactly one caller wins
 * each pair even across instances. Fails closed: a database error skips the
 * whole chunk (logged) rather than risking duplicate marketing pushes.
 */
async function claimPushes(deps: ClientCampaignDeps, items: readonly ClientPush[]): Promise<Set<string>> {
  const won = new Set<string>();
  for (const rows of chunk(items, CLIENT_CAMPAIGN_CHUNK)) {
    const ids = rows.map(() => randomUUID());
    const clientIds = rows.map((r) => r.clientId);
    const campaignIds = rows.map((r) => r.campaignId);
    try {
      const inserted = await deps.raw.queryRaw<{ client_id: string; campaign_id: string }>`
        INSERT INTO campaign_sent_trackers (id, client_id, campaign_id, channel, sent_at)
        SELECT t.id, t.client_id, t.campaign_id, 'PUSH', NOW()
        FROM unnest(${ids}::text[], ${clientIds}::text[], ${campaignIds}::text[]) AS t(id, client_id, campaign_id)
        ON CONFLICT DO NOTHING
        RETURNING client_id, campaign_id`;
      for (const r of inserted) won.add(keyOf(r.client_id, r.campaign_id));
    } catch (e) {
      deps.logger.warn(`Campaign claim failed for ${rows.length} recipient(s) — skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return won;
}

/**
 * Claims, then sends the pushes no other run has delivered. Identical messages
 * (same title, body and data) share one multicast. A claimed push whose
 * multicast throws is not retried (same fail-closed rule as before: the claim
 * row stays).
 */
export async function deliverClientPushes(deps: ClientCampaignDeps, items: readonly ClientPush[]): Promise<ClientDeliveryResult> {
  if (items.length === 0) return { claimed: [], staleTokens: [] };

  // One candidate per (client, campaign) within the call.
  const unique = new Map<string, ClientPush>();
  for (const i of items) {
    const k = keyOf(i.clientId, i.campaignId);
    if (!unique.has(k)) unique.set(k, i);
  }
  const candidates = [...unique.values()];

  const won = await claimPushes(deps, candidates);
  const claimed = candidates.filter((i) => won.has(keyOf(i.clientId, i.campaignId)));

  const groups = new Map<string, ClientPush[]>();
  for (const i of claimed) {
    const g = JSON.stringify([i.title, i.body, i.data]);
    const members = groups.get(g);
    if (members) members.push(i);
    else groups.set(g, [i]);
  }

  const staleTokens: string[] = [];
  await mapLimit([...groups.values()], MULTICAST_CONCURRENCY, async (members) => {
    const { title, body, data } = members[0];
    try {
      const r = await deps.push.sendMulticast(members.map((m) => m.token), title, body, undefined, data);
      if (r?.invalidTokens?.length) staleTokens.push(...r.invalidTokens);
    } catch (e) {
      deps.logger.warn(`Client multicast failed (${members.length} recipients, ${data.event ?? '?'}): ${e}`);
    }
  });

  return { claimed, staleTokens };
}

/** Clears push tokens rejected by FCM / Expo, 1000 tokens per UPDATE. */
export async function clearStaleClientTokens(clientRepo: IClientRepository, tokens: string[], logger: Logger): Promise<void> {
  if (tokens.length === 0) return;
  const unique = [...new Set(tokens)];
  try {
    // Served by clients(push_token).
    for (const part of chunk(unique, CLIENT_CAMPAIGN_CHUNK)) {
      await clientRepo.updateMany({ where: { pushToken: { in: part } }, data: { pushToken: null } });
    }
    logger.log(`Cleaned ${unique.length} stale push token(s)`);
  } catch (e) {
    logger.warn(`Failed to clean stale tokens: ${e}`);
  }
}

/** `{ id: { gt: last } }` keyset page filter (safe even if the last row was deleted meanwhile). */
export function afterId(last: string | undefined): { id?: { gt: string } } {
  return last ? { id: { gt: last } } : {};
}
