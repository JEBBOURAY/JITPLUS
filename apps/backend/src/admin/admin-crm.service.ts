import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { FollowUpKind, FollowUpStatus, PremiumGrant, Prisma } from '@prisma/client';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  MERCHANT_FOLLOW_UP_REPOSITORY, type IMerchantFollowUpRepository,
  MERCHANT_FOLLOW_UP_NOTE_REPOSITORY, type IMerchantFollowUpNoteRepository,
  SUBSCRIPTION_PAYMENT_REPOSITORY, type ISubscriptionPaymentRepository,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../common/repositories';
import { MS_PER_DAY } from '../common/constants';
import { num, type Row } from './admin-insights.helpers';
import type { AddFollowUpNoteDto, FollowUpListQueryDto, PaymentInputDto, UpdateFollowUpDto } from './dto/crm.dto';

export interface AdminActor {
  adminId: string;
  adminEmail: string;
}

/** Statuses that take a merchant out of the "to follow" queue. */
const CLOSED_STATUSES: FollowUpStatus[] = [FollowUpStatus.CONVERTED, FollowUpStatus.LOST];
const MOROCCO_TZ = 'Africa/Casablanca';
const WORKLIST_CACHE_TTL = 60_000;
const REVENUE_CACHE_TTL = 60_000;

/** Midnight (start of the day) in Morocco, as a UTC instant, `offsetDays` days from today. */
export function moroccoDayStart(now: Date, offsetDays = 0): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOROCCO_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Local wall-clock time read as if it were UTC, minus the real instant = the zone offset
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offsetMs = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const midnightWall = Date.UTC(get('year'), get('month') - 1, get('day') + offsetDays);
  return new Date(midnightWall - offsetMs);
}

function parseOptionalDate(v: string | undefined, label: string): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === '') return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new BadRequestException(`${label} invalide`);
  return d;
}

function iso(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

/** Merchant fields shared by every worklist / follow-up row. */
const MERCHANT_BRIEF = (d30: Date) => Prisma.sql`
  m.id, m.nom, m.email, m.phone_number AS phone, m.ville, m.categorie::text AS categorie,
  m.plan::text AS plan, m.plan_activated_by_admin AS admin_plan, m.plan_expires_at AS expires_at,
  m.premium_grant::text AS premium_grant, m.created_at, m.onboarding_completed AS onboarded,
  (SELECT COUNT(*) FROM loyalty_cards lc WHERE lc.merchant_id = m.id AND lc.deactivated_at IS NULL) AS clients,
  (SELECT MAX(t.created_at) FROM transactions t WHERE t.merchant_id = m.id AND t.status = 'ACTIVE') AS last_tx,
  (SELECT COUNT(*) FROM transactions t WHERE t.merchant_id = m.id AND t.status = 'ACTIVE' AND t.created_at >= ${d30}) AS tx30,
  EXISTS (SELECT 1 FROM rewards r WHERE r.merchant_id = m.id) AS has_reward,
  f.status::text AS fu_status, f.next_action_at, f.next_action, f.owner AS fu_owner
`;

function mapBrief(r: Row) {
  const isPremium = r.plan === 'PREMIUM';
  return {
    id: String(r.id),
    nom: String(r.nom),
    email: String(r.email),
    phone: (r.phone as string | null) ?? null,
    ville: (r.ville as string | null) ?? null,
    categorie: String(r.categorie),
    plan: String(r.plan) as 'FREE' | 'PREMIUM',
    planKind: !isPremium ? 'FREE' : !r.admin_plan ? 'TRIAL' : r.premium_grant === 'OFFERED' ? 'OFFERED' : r.premium_grant === 'PAID' ? 'PAID' : 'ADMIN',
    planExpiresAt: iso(r.expires_at),
    createdAt: iso(r.created_at)!,
    onboarded: Boolean(r.onboarded),
    hasReward: Boolean(r.has_reward),
    clients: num(r.clients),
    transactions30d: num(r.tx30),
    lastActivityAt: iso(r.last_tx),
    followUp: r.fu_status
      ? { status: String(r.fu_status) as FollowUpStatus, nextActionAt: iso(r.next_action_at), nextAction: (r.next_action as string | null) ?? null, owner: (r.fu_owner as string | null) ?? null }
      : null,
  };
}

export type MerchantBrief = ReturnType<typeof mapBrief>;

/**
 * Back-office tools for the admin team:
 * - follow-up (CRM): pipeline status, next action and a timeline of contacts per merchant
 * - billing: whether PREMIUM is paid or offered, and the payments actually received
 * - worklist: the concrete rows (with phone numbers) behind every alert
 */
@Injectable()
export class AdminCrmService {
  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(MERCHANT_FOLLOW_UP_REPOSITORY) private readonly followUpRepo: IMerchantFollowUpRepository,
    @Inject(MERCHANT_FOLLOW_UP_NOTE_REPOSITORY) private readonly noteRepo: IMerchantFollowUpNoteRepository,
    @Inject(SUBSCRIPTION_PAYMENT_REPOSITORY) private readonly paymentRepo: ISubscriptionPaymentRepository,
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private async invalidate(): Promise<void> {
    await Promise.all([this.cache.del('admin:worklist'), this.cache.del('admin:alerts'), this.cache.del('admin:revenue:12')]);
  }

  /** Throws 404 unless the merchant exists (soft-deleted rows included: their history stays readable). */
  private async assertMerchant(merchantId: string): Promise<{ id: string; nom: string; email: string }> {
    const select = { id: true, nom: true, email: true } as const;
    const m = (await this.merchantRepo.findUnique({ where: { id: merchantId }, select }))
      ?? (await this.merchantRepo.findFirst({ where: { id: merchantId, deletedAt: { not: null } }, select }));
    if (!m) throw new NotFoundException('Commerçant non trouvé');
    return m;
  }

  // ── Follow-up ───────────────────────────────────────────────────────────────

  async getFollowUp(merchantId: string) {
    await this.assertMerchant(merchantId);
    const [followUp, notes] = await Promise.all([
      this.followUpRepo.findUnique({ where: { merchantId } }),
      this.noteRepo.findMany({ where: { merchantId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return { followUp, notes };
  }

  private followUpData(dto: UpdateFollowUpDto) {
    const data: Prisma.MerchantFollowUpUncheckedUpdateInput = {};
    if (dto.status) data.status = dto.status;
    const next = parseOptionalDate(dto.nextActionAt, 'Date de relance');
    if (next !== undefined) data.nextActionAt = next;
    if (dto.nextAction !== undefined) data.nextAction = dto.nextAction.trim() || null;
    if (dto.owner !== undefined) data.owner = dto.owner.trim() || null;
    // Closing a follow-up clears the planned action
    if (dto.status && CLOSED_STATUSES.includes(dto.status) && next === undefined) {
      data.nextActionAt = null;
      data.nextAction = null;
    }
    return data;
  }

  async updateFollowUp(merchantId: string, dto: UpdateFollowUpDto, actor: AdminActor) {
    await this.assertMerchant(merchantId);
    const data = this.followUpData(dto);
    const followUp = await this.followUpRepo.upsert({
      where: { merchantId },
      update: data,
      create: {
        merchantId,
        status: (data.status as FollowUpStatus | undefined) ?? FollowUpStatus.TO_CONTACT,
        nextActionAt: (data.nextActionAt as Date | null | undefined) ?? null,
        nextAction: (data.nextAction as string | null | undefined) ?? null,
        owner: (data.owner as string | null | undefined) ?? actor.adminEmail,
      },
    });
    await this.invalidate();
    return followUp;
  }

  /** Logs a contact or note; creates the follow-up on first contact and applies any status / next action sent with it. */
  async addNote(merchantId: string, dto: AddFollowUpNoteDto, actor: AdminActor) {
    await this.assertMerchant(merchantId);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('La note est vide');
    const data = this.followUpData(dto);
    const existing = await this.followUpRepo.findUnique({ where: { merchantId }, select: { status: true } });
    const contacted = dto.kind !== FollowUpKind.NOTE;
    if (!data.status && contacted && (!existing || existing.status === FollowUpStatus.TO_CONTACT)) {
      data.status = FollowUpStatus.CONTACTED;
    }

    const [note, followUp] = await Promise.all([
      this.noteRepo.create({
        data: { merchantId, kind: dto.kind, body, adminId: actor.adminId, adminEmail: actor.adminEmail },
      }),
      this.followUpRepo.upsert({
        where: { merchantId },
        update: data,
        create: {
          merchantId,
          status: (data.status as FollowUpStatus | undefined) ?? FollowUpStatus.TO_CONTACT,
          nextActionAt: (data.nextActionAt as Date | null | undefined) ?? null,
          nextAction: (data.nextAction as string | null | undefined) ?? null,
          owner: (data.owner as string | null | undefined) ?? actor.adminEmail,
        },
      }),
    ]);
    await this.invalidate();
    return { note, followUp };
  }

  /** Only the author can delete a note. */
  async deleteNote(noteId: string, actor: AdminActor) {
    const note = await this.noteRepo.findUnique({ where: { id: noteId }, select: { adminId: true } });
    if (!note) throw new NotFoundException('Note introuvable');
    if (note.adminId !== actor.adminId) throw new ForbiddenException('Seul l\'auteur peut supprimer cette note');
    await this.noteRepo.delete({ where: { id: noteId } });
    return { success: true };
  }

  async listFollowUps(q: FollowUpListQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 30;
    const now = new Date();
    const today = moroccoDayStart(now);
    const tomorrow = moroccoDayStart(now, 1);
    const in7 = moroccoDayStart(now, 8);
    const d30 = new Date(now.getTime() - 30 * MS_PER_DAY);

    const conds: Prisma.Sql[] = [Prisma.sql`m.deleted_at IS NULL`];
    if (q.status) conds.push(Prisma.sql`f.status = ${q.status}::"FollowUpStatus"`);
    else if (!q.closed) conds.push(Prisma.sql`f.status NOT IN ('CONVERTED', 'LOST')`);
    if (q.due === 'overdue') conds.push(Prisma.sql`f.next_action_at < ${today}`);
    else if (q.due === 'today') conds.push(Prisma.sql`f.next_action_at < ${tomorrow}`);
    else if (q.due === 'week') conds.push(Prisma.sql`f.next_action_at < ${in7}`);
    else if (q.due === 'none') conds.push(Prisma.sql`f.next_action_at IS NULL`);
    if (q.owner) conds.push(Prisma.sql`f.owner = ${q.owner}`);
    if (q.search) {
      const like = `%${q.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      conds.push(Prisma.sql`(m.nom ILIKE ${like} OR m.email ILIKE ${like} OR m.phone_number ILIKE ${like})`);
    }
    const where = Prisma.join(conds, ' AND ');

    const [rows, [countRow], [stats]] = await Promise.all([
      this.rawQuery.queryRaw<Row>`
        SELECT ${MERCHANT_BRIEF(d30)},
               n.kind::text AS note_kind, n.body AS note_body, n.created_at AS note_at, n.admin_email AS note_by,
               (SELECT COUNT(*) FROM merchant_follow_up_notes x WHERE x.merchant_id = m.id) AS note_count
        FROM merchant_follow_ups f
        JOIN merchants m ON m.id = f.merchant_id
        LEFT JOIN LATERAL (
          SELECT kind, body, created_at, admin_email FROM merchant_follow_up_notes
          WHERE merchant_id = m.id ORDER BY created_at DESC LIMIT 1
        ) n ON true
        WHERE ${where}
        ORDER BY f.next_action_at ASC NULLS LAST, f.updated_at DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `,
      this.rawQuery.queryRaw<Row>`
        SELECT COUNT(*) AS total FROM merchant_follow_ups f JOIN merchants m ON m.id = f.merchant_id WHERE ${where}
      `,
      this.rawQuery.queryRaw<Row>`
        SELECT
          COUNT(*) FILTER (WHERE f.status = 'TO_CONTACT') AS to_contact,
          COUNT(*) FILTER (WHERE f.status = 'CONTACTED') AS contacted,
          COUNT(*) FILTER (WHERE f.status = 'INTERESTED') AS interested,
          COUNT(*) FILTER (WHERE f.status = 'ONBOARDING') AS onboarding,
          COUNT(*) FILTER (WHERE f.status = 'CONVERTED') AS converted,
          COUNT(*) FILTER (WHERE f.status = 'LOST') AS lost,
          COUNT(*) FILTER (WHERE f.status NOT IN ('CONVERTED', 'LOST') AND f.next_action_at < ${today}) AS overdue,
          COUNT(*) FILTER (WHERE f.status NOT IN ('CONVERTED', 'LOST') AND f.next_action_at >= ${today} AND f.next_action_at < ${tomorrow}) AS due_today,
          COUNT(*) FILTER (WHERE f.status NOT IN ('CONVERTED', 'LOST') AND f.next_action_at IS NULL) AS unplanned
        FROM merchant_follow_ups f JOIN merchants m ON m.id = f.merchant_id
        WHERE m.deleted_at IS NULL
      `,
    ]);

    const total = num(countRow?.total);
    const s = stats ?? {};
    return {
      followUps: rows.map((r) => ({
        ...mapBrief(r),
        noteCount: num(r.note_count),
        lastNote: r.note_at
          ? { kind: String(r.note_kind) as FollowUpKind, body: String(r.note_body), createdAt: iso(r.note_at)!, adminEmail: (r.note_by as string | null) ?? null }
          : null,
      })),
      counts: {
        byStatus: {
          TO_CONTACT: num(s.to_contact), CONTACTED: num(s.contacted), INTERESTED: num(s.interested),
          ONBOARDING: num(s.onboarding), CONVERTED: num(s.converted), LOST: num(s.lost),
        },
        overdue: num(s.overdue),
        dueToday: num(s.due_today),
        unplanned: num(s.unplanned),
      },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Billing ─────────────────────────────────────────────────────────────────

  async setPremiumGrant(merchantId: string, grant: PremiumGrant | null, note?: string | null) {
    await this.merchantRepo.update({
      where: { id: merchantId },
      data: { premiumGrant: grant, ...(note !== undefined ? { premiumGrantNote: note?.trim() || null } : {}) },
    });
    await this.invalidate();
  }

  async listPayments(merchantId: string) {
    await this.assertMerchant(merchantId);
    const payments = await this.paymentRepo.findMany({ where: { merchantId }, orderBy: { paidAt: 'desc' }, take: 200 });
    const valid = payments.filter((p) => !p.voidedAt);
    return {
      payments,
      totals: {
        count: valid.length,
        amount: Math.round(valid.reduce((a, p) => a + p.amount, 0) * 100) / 100,
        lastPaidAt: valid[0]?.paidAt ?? null,
      },
    };
  }

  async recordPayment(merchantId: string, dto: PaymentInputDto, actor: AdminActor) {
    await this.assertMerchant(merchantId);
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    if (paidAt.getTime() > Date.now() + MS_PER_DAY) throw new BadRequestException('La date de paiement est dans le futur');
    const periodStart = dto.periodStart ? new Date(dto.periodStart) : null;
    const periodEnd = dto.periodEnd ? new Date(dto.periodEnd) : null;
    if (periodStart && periodEnd && periodEnd <= periodStart) throw new BadRequestException('La fin de période doit suivre le début');
    const payment = await this.paymentRepo.create({
      data: {
        merchantId,
        amount: Math.round(dto.amount * 100) / 100,
        method: dto.method,
        paidAt,
        periodStart,
        periodEnd,
        reference: dto.reference?.trim() || null,
        note: dto.note?.trim() || null,
        adminId: actor.adminId,
        adminEmail: actor.adminEmail,
      },
    });
    await this.invalidate();
    return payment;
  }

  async voidPayment(paymentId: string, reason: string) {
    const payment = await this.paymentRepo.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    if (payment.voidedAt) throw new BadRequestException('Paiement déjà annulé');
    const updated = await this.paymentRepo.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidReason: reason.trim() },
    });
    await this.invalidate();
    return updated;
  }

  /** Money received per month (Morocco time), PREMIUM split paid / offered / trial, and every subscribed merchant. */
  async getRevenue(months = 12) {
    const cacheKey = `admin:revenue:${months}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const monthStart = moroccoDayStart(now, 1 - Number(new Intl.DateTimeFormat('en-CA', { timeZone: MOROCCO_TZ, day: 'numeric' }).format(now)));
    const since = new Date(monthStart);
    since.setUTCMonth(since.getUTCMonth() - (months - 1));
    const in30 = new Date(now.getTime() + 30 * MS_PER_DAY);

    const [monthly, byMethod, [plans], subscribers, recent] = await Promise.all([
      this.rawQuery.queryRaw<Row>`
        SELECT to_char(date_trunc('month', (paid_at AT TIME ZONE 'UTC') AT TIME ZONE ${MOROCCO_TZ}), 'YYYY-MM') AS month,
               SUM(amount) AS amount, COUNT(*) AS payments, COUNT(DISTINCT merchant_id) AS merchants
        FROM merchant_subscription_payments
        WHERE voided_at IS NULL AND paid_at >= ${since}
        GROUP BY 1 ORDER BY 1
      `,
      this.rawQuery.queryRaw<Row>`
        SELECT method::text AS method, SUM(amount) AS amount, COUNT(*) AS payments
        FROM merchant_subscription_payments
        WHERE voided_at IS NULL AND paid_at >= ${since}
        GROUP BY 1 ORDER BY 2 DESC
      `,
      this.rawQuery.queryRaw<Row>`
        SELECT
          COUNT(*) FILTER (WHERE plan = 'PREMIUM' AND plan_activated_by_admin AND premium_grant = 'PAID') AS paid,
          COUNT(*) FILTER (WHERE plan = 'PREMIUM' AND plan_activated_by_admin AND premium_grant = 'OFFERED') AS offered,
          COUNT(*) FILTER (WHERE plan = 'PREMIUM' AND plan_activated_by_admin AND premium_grant IS NULL) AS unknown,
          COUNT(*) FILTER (WHERE plan = 'PREMIUM' AND NOT plan_activated_by_admin AND plan_expires_at > ${now}) AS trial,
          COUNT(*) FILTER (WHERE plan = 'PREMIUM' AND plan_activated_by_admin AND plan_expires_at > ${now} AND plan_expires_at <= ${in30}) AS renewals_30d,
          (SELECT COALESCE(SUM(amount), 0) FROM merchant_subscription_payments WHERE voided_at IS NULL) AS all_time
        FROM merchants
        WHERE deleted_at IS NULL AND is_active
      `,
      this.rawQuery.queryRaw<Row>`
        SELECT m.id, m.nom, m.email, m.phone_number AS phone, m.ville, m.premium_grant::text AS premium_grant,
               m.premium_grant_note AS grant_note, m.plan_expires_at AS expires_at,
               p.last_paid_at, p.last_amount, COALESCE(p.total, 0) AS total_paid, COALESCE(p.n, 0) AS payments
        FROM merchants m
        LEFT JOIN LATERAL (
          SELECT MAX(paid_at) AS last_paid_at, SUM(amount) AS total, COUNT(*) AS n,
                 (SELECT amount FROM merchant_subscription_payments x
                   WHERE x.merchant_id = m.id AND x.voided_at IS NULL ORDER BY paid_at DESC LIMIT 1) AS last_amount
          FROM merchant_subscription_payments WHERE merchant_id = m.id AND voided_at IS NULL
        ) p ON true
        WHERE m.deleted_at IS NULL AND m.is_active AND m.plan = 'PREMIUM' AND m.plan_activated_by_admin
        ORDER BY m.plan_expires_at ASC NULLS LAST, m.nom ASC
        LIMIT 500
      `,
      this.paymentRepo.findMany({
        orderBy: { paidAt: 'desc' },
        take: 30,
        include: { merchant: { select: { id: true, nom: true } } },
      }),
    ]);

    // Every month of the window, including those without payments
    const byMonth = new Map(monthly.map((r) => [String(r.month), r]));
    const series: { month: string; amount: number; payments: number; merchants: number }[] = [];
    const cursor = new Date(since);
    for (let i = 0; i < months; i++) {
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: MOROCCO_TZ, year: 'numeric', month: '2-digit' }).format(new Date(cursor.getTime() + 12 * 3600_000)).slice(0, 7);
      const r = byMonth.get(key);
      series.push({ month: key, amount: num(r?.amount), payments: num(r?.payments), merchants: num(r?.merchants) });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    const cur = series[series.length - 1];
    const prev = series[series.length - 2];
    const p = plans ?? {};

    const result = {
      generatedAt: now.toISOString(),
      months,
      totals: {
        thisMonth: cur?.amount ?? 0,
        lastMonth: prev?.amount ?? 0,
        window: series.reduce((a, b) => a + b.amount, 0),
        allTime: num(p.all_time),
      },
      monthly: series,
      byMethod: byMethod.map((r) => ({ method: String(r.method), amount: num(r.amount), payments: num(r.payments) })),
      premium: {
        paid: num(p.paid),
        offered: num(p.offered),
        unknown: num(p.unknown),
        trial: num(p.trial),
        renewals30d: num(p.renewals_30d),
      },
      subscribers: subscribers.map((r) => ({
        id: String(r.id),
        nom: String(r.nom),
        email: String(r.email),
        phone: (r.phone as string | null) ?? null,
        ville: (r.ville as string | null) ?? null,
        grant: (r.premium_grant as PremiumGrant | null) ?? null,
        grantNote: (r.grant_note as string | null) ?? null,
        planExpiresAt: iso(r.expires_at),
        lastPaidAt: iso(r.last_paid_at),
        lastAmount: r.last_amount === null || r.last_amount === undefined ? null : num(r.last_amount),
        totalPaid: num(r.total_paid),
        payments: num(r.payments),
      })),
      recentPayments: recent,
    };
    await this.cache.set(cacheKey, result, REVENUE_CACHE_TTL);
    return result;
  }

  // ── Worklist ────────────────────────────────────────────────────────────────

  /** The concrete merchants / requests behind each alert, with what is needed to act (phone, plan, follow-up). */
  async getWorklist() {
    const cacheKey = 'admin:worklist';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const tomorrow = moroccoDayStart(now, 1);
    const d3 = new Date(now.getTime() - 3 * MS_PER_DAY);
    const d21 = new Date(now.getTime() - 21 * MS_PER_DAY);
    const d30 = new Date(now.getTime() - 30 * MS_PER_DAY);
    const in7 = new Date(now.getTime() + 7 * MS_PER_DAY);
    const in14 = new Date(now.getTime() + 14 * MS_PER_DAY);
    const brief = MERCHANT_BRIEF(d30);
    const LIMIT = 25;

    const [followUpsDue, trialsEnding, renewals, stuckNew, dormantPremium, payouts, reportedDeals] = await Promise.all([
      this.rawQuery.queryRaw<Row>`
        SELECT ${brief} FROM merchant_follow_ups f JOIN merchants m ON m.id = f.merchant_id
        WHERE m.deleted_at IS NULL AND f.status NOT IN ('CONVERTED', 'LOST') AND f.next_action_at < ${tomorrow}
        ORDER BY f.next_action_at ASC LIMIT ${LIMIT}
      `,
      this.rawQuery.queryRaw<Row>`
        SELECT ${brief} FROM merchants m LEFT JOIN merchant_follow_ups f ON f.merchant_id = m.id
        WHERE m.deleted_at IS NULL AND m.is_active AND m.plan = 'PREMIUM' AND NOT m.plan_activated_by_admin
          AND m.plan_expires_at > ${now} AND m.plan_expires_at <= ${in7}
        ORDER BY m.plan_expires_at ASC LIMIT ${LIMIT}
      `,
      this.rawQuery.queryRaw<Row>`
        SELECT ${brief} FROM merchants m LEFT JOIN merchant_follow_ups f ON f.merchant_id = m.id
        WHERE m.deleted_at IS NULL AND m.is_active AND m.plan = 'PREMIUM' AND m.plan_activated_by_admin
          AND m.plan_expires_at > ${now} AND m.plan_expires_at <= ${in14}
        ORDER BY m.plan_expires_at ASC LIMIT ${LIMIT}
      `,
      // Signed up 3 to 30 days ago and never scanned anyone: needs help to get started
      this.rawQuery.queryRaw<Row>`
        SELECT ${brief} FROM merchants m LEFT JOIN merchant_follow_ups f ON f.merchant_id = m.id
        WHERE m.deleted_at IS NULL AND m.is_active AND m.created_at < ${d3} AND m.created_at >= ${d30}
          AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.merchant_id = m.id)
          AND (f.status IS NULL OR f.status NOT IN ('CONVERTED', 'LOST'))
        ORDER BY m.created_at ASC LIMIT ${LIMIT}
      `,
      // Subscribed (paid or offered) but no scan for 21 days: churn risk
      this.rawQuery.queryRaw<Row>`
        SELECT ${brief} FROM merchants m LEFT JOIN merchant_follow_ups f ON f.merchant_id = m.id
        WHERE m.deleted_at IS NULL AND m.is_active AND m.plan = 'PREMIUM' AND m.plan_activated_by_admin
          AND m.created_at < ${d21}
          AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.merchant_id = m.id AND t.status = 'ACTIVE' AND t.created_at >= ${d21})
        ORDER BY m.premium_grant = 'PAID' DESC, m.nom ASC LIMIT ${LIMIT}
      `,
      this.rawQuery.queryRaw<Row>`
        SELECT p.id, p.amount, p.method::text AS method, p.created_at, c.id AS client_id, c.prenom, c.nom, c.telephone
        FROM payout_requests p JOIN clients c ON c.id = p.client_id
        WHERE p.status = 'PENDING'
        ORDER BY p.created_at ASC LIMIT ${LIMIT}
      `,
      this.rawQuery.queryRaw<Row>`
        SELECT d.id, d.title, d.report_count, d.ends_at, d.created_at, m.id AS merchant_id, m.nom AS merchant_nom
        FROM deals d JOIN merchants m ON m.id = d.merchant_id
        WHERE d.status = 'ACTIVE' AND d.report_count > 0 AND d.ends_at > ${now}
        ORDER BY d.report_count DESC, d.created_at DESC LIMIT ${LIMIT}
      `,
    ]);

    const result = {
      generatedAt: now.toISOString(),
      followUpsDue: followUpsDue.map(mapBrief),
      trialsEnding: trialsEnding.map(mapBrief),
      renewals: renewals.map(mapBrief),
      stuckNew: stuckNew.map(mapBrief),
      dormantPremium: dormantPremium.map(mapBrief),
      payouts: payouts.map((r) => ({
        id: String(r.id),
        amount: num(r.amount),
        method: String(r.method),
        createdAt: iso(r.created_at)!,
        client: {
          id: String(r.client_id),
          name: [r.prenom, r.nom].filter(Boolean).join(' ') || null,
          telephone: (r.telephone as string | null) ?? null,
        },
      })),
      reportedDeals: reportedDeals.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        reportCount: num(r.report_count),
        endsAt: iso(r.ends_at)!,
        createdAt: iso(r.created_at)!,
        merchant: { id: String(r.merchant_id), nom: String(r.merchant_nom) },
      })),
    };
    await this.cache.set(cacheKey, result, WORKLIST_CACHE_TTL);
    return result;
  }
}
