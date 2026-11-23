import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MerchantNotifierService, NOTIFY_TARGET_SELECT } from '../merchant-inbox/merchant-notifier.service';
import { MailService } from '../mail/mail.service';
import { pickEmailLang } from '../mail/transactional-i18n';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../events';
import {
  ClientBookingMessage,
  MerchantBookingMessage,
  clientBookingText,
  merchantBookingText,
} from './booking-messages';
import { formatLocalDayMonth, formatLocalTime, timeZoneForCountry } from './booking-time';
import { DEFAULT_SETTINGS } from './booking.constants';

export interface NotifiableBooking {
  id: string;
  merchantId: string;
  clientId: string | null;
  clientName: string | null;
  status: string;
  startsAt: Date;
  serviceNameSnapshot: string;
  /** Sent with a decline or a cancellation by the merchant */
  cancelReason?: string | null;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Created by the client app: a booking must not depend on the "offers" channel staying on. */
const CLIENT_BOOKING_CHANNEL = 'jit-transactions';

/**
 * Pushes and real-time events of the booking module. Every method is
 * fire-and-forget safe: failures are logged, never thrown to the caller.
 */
@Injectable()
export class BookingNotifyService {
  private readonly logger = new Logger(BookingNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly merchantNotifier: MerchantNotifierService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsGateway,
    private readonly mail: MailService,
  ) {}

  /** Agenda refresh on the merchant's devices + the client's "my bookings". */
  changed(b: NotifiableBooking, reason: 'created' | 'status'): void {
    try {
      this.events.emitBookingChanged(b.merchantId, b.clientId, {
        bookingId: b.id,
        merchantId: b.merchantId,
        status: b.status,
        startsAt: b.startsAt.toISOString(),
        reason,
      });
    } catch (e) {
      this.logger.warn(`booking ws emit failed: ${errMsg(e)}`);
    }
  }

  async toClient(b: NotifiableBooking, kind: ClientBookingMessage): Promise<void> {
    if (!b.clientId) return;
    try {
      const [client, merchant] = await Promise.all([
        this.prisma.client.findUnique({ where: { id: b.clientId }, select: { language: true } }),
        this.prisma.merchant.findUnique({ where: { id: b.merchantId }, select: { nom: true, countryCode: true } }),
      ]);
      if (!merchant) return;
      const tz = timeZoneForCountry(merchant.countryCode);
      const { title, body } = clientBookingText(kind, client?.language, {
        merchant: merchant.nom,
        service: b.serviceNameSnapshot,
        day: formatLocalDayMonth(tz, b.startsAt),
        time: formatLocalTime(tz, b.startsAt),
        reason: b.cancelReason,
      });
      await this.notifications.sendToClient(b.merchantId, b.clientId, title, body, {
        event: 'booking',
        action: 'open_booking',
        bookingId: b.id,
        merchantId: b.merchantId,
      }, CLIENT_BOOKING_CHANNEL);
    } catch (e) {
      this.logger.warn(`booking client push failed (${kind}): ${errMsg(e)}`);
    }
    // The e-mail is the client's written record: a moved booking gets a fresh one with the new time.
    if (kind === 'confirmed' || kind === 'rescheduled') await this.emailConfirmed(b, kind === 'rescheduled');
  }

  /** Confirmation e-mail (or its "moved" version), only to a verified address. */
  async emailConfirmed(b: NotifiableBooking, moved = false): Promise<void> {
    if (!b.clientId) return;
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: b.id },
        select: {
          startsAt: true,
          serviceNameSnapshot: true,
          client: { select: { email: true, emailVerified: true, language: true, deletedAt: true } },
          merchant: {
            select: { nom: true, adresse: true, ville: true, countryCode: true, bookingSettings: { select: { cancelDeadlineHours: true } } },
          },
        },
      });
      const client = booking?.client;
      if (!booking || !client?.email || !client.emailVerified || client.deletedAt) return;
      const lang = pickEmailLang(client.language);
      const tz = timeZoneForCountry(booking.merchant.countryCode);
      const locale = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' }[lang];
      const date = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(booking.startsAt);
      await this.mail.sendBookingConfirmed(
        client.email,
        {
          merchant: booking.merchant.nom,
          service: booking.serviceNameSnapshot,
          date,
          time: formatLocalTime(tz, booking.startsAt),
          address: [booking.merchant.adresse, booking.merchant.ville].filter(Boolean).join(', ') || null,
          cancelDeadlineHours: booking.merchant.bookingSettings?.cancelDeadlineHours ?? DEFAULT_SETTINGS.cancelDeadlineHours,
          moved,
        },
        lang,
      );
    } catch (e) {
      this.logger.warn(`booking confirmation e-mail failed: ${errMsg(e)}`);
    }
  }

  /** Always kept in the merchant's notifications, and pushed when a device is reachable. */
  async toMerchant(b: NotifiableBooking, kind: MerchantBookingMessage): Promise<void> {
    try {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: b.merchantId },
        select: { ...NOTIFY_TARGET_SELECT, language: true, countryCode: true },
      });
      if (!merchant) return;
      let clientLabel = b.clientName ?? undefined;
      if (!clientLabel && b.clientId) {
        const c = await this.prisma.client.findUnique({
          where: { id: b.clientId },
          select: { prenom: true, nom: true, shareInfoMerchants: true },
        });
        // Same rule as the agenda (mapMerchantView): the family name only when
        // the client shares their details with merchants. The push text is also
        // kept in the merchant inbox.
        clientLabel = [c?.prenom, c?.shareInfoMerchants ? c?.nom : null].filter(Boolean).join(' ') || undefined;
      }
      const tz = timeZoneForCountry(merchant.countryCode);
      const { title, body } = merchantBookingText(kind, merchant.language, {
        merchant: '',
        client: clientLabel,
        service: b.serviceNameSnapshot,
        day: formatLocalDayMonth(tz, b.startsAt),
        time: formatLocalTime(tz, b.startsAt),
      });
      await this.merchantNotifier.notify(merchant, {
        category: 'BOOKING',
        title,
        body,
        event: 'booking',
        action: 'open_agenda',
        data: { bookingId: b.id },
      });
    } catch (e) {
      this.logger.warn(`booking merchant push failed (${kind}): ${errMsg(e)}`);
    }
  }
}
