import { createJitIcon } from './createJitIcon';
import { glyphs } from './glyphs';

/**
 * JitPlus custom icons. Same props and type as Lucide icons (size, color,
 * strokeWidth), so they drop into any `LucideIcon` slot.
 * Generic UI glyphs (check, close, arrows, chevrons…) stay on Lucide on purpose.
 */
export const JitHome = createJitIcon('JitHome', glyphs.home);
export const JitClients = createJitIcon('JitClients', glyphs.clients);
export const JitScan = createJitIcon('JitScan', glyphs.scan);
export const JitMessages = createJitIcon('JitMessages', glyphs.messages);
export const JitPersonAdd = createJitIcon('JitPersonAdd', glyphs.personAdd);
export const JitTeam = createJitIcon('JitTeam', glyphs.team);
export const JitStore = createJitIcon('JitStore', glyphs.store);
export const JitStamp = createJitIcon('JitStamp', glyphs.stamp);
export const JitGames = createJitIcon('JitGames', glyphs.games);
export const JitDeals = createJitIcon('JitDeals', glyphs.deals);
export const JitGift = createJitIcon('JitGift', glyphs.gift);
export const JitLock = createJitIcon('JitLock', glyphs.lock);
export const JitBell = createJitIcon('JitBell', glyphs.bell);
export const JitStar = createJitIcon('JitStar', glyphs.star);
export const JitPin = createJitIcon('JitPin', glyphs.pin);
export const JitTicket = createJitIcon('JitTicket', glyphs.ticket);
export const JitStats = createJitIcon('JitStats', glyphs.stats);
export const JitPremium = createJitIcon('JitPremium', glyphs.premium);
export const JitSettings = createJitIcon('JitSettings', glyphs.settings);
export const JitCard = createJitIcon('JitCard', glyphs.card);
