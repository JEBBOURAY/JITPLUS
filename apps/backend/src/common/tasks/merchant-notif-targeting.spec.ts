import { candidateTips, crossedMilestone, type FeatureUsage } from './merchant-smart-campaign.service';
import { SCAN_GAP_STAGES, FIRST_SCAN_STAGES, planEngagementReminder } from './merchant-engagement.service';
import { reachedStage, mapLimit } from './cron-utils';
import { APP_IDLE_STAGES_D, ONBOARDING_STAGES_H } from './merchant-retention.service';
import { NOTIF_MESSAGES, TIP_ACTIONS, TIP_MESSAGES } from './merchant-notif-messages';

const fresh: FeatureUsage = {
  isPremium: false,
  accountAgeDays: 10,
  clients: 0,
  hasCardDesign: false,
  luckyWheels: 0,
  scratchCampaigns: 0,
  deals: 0,
  stampCodes: 0,
  teamMembers: 0,
  stores: 1,
  sentPush: false,
  sentEmail: false,
  sentWhatsapp: false,
};

describe('targeted tips', () => {
  it('starts with getting clients, never pitches Premium features to FREE', () => {
    expect(candidateTips(fresh)).toEqual(['clientQr', 'cardDesign', 'deals', 'stampCodes']);
  });

  it('drops a tip once the feature is used', () => {
    const used: FeatureUsage = {
      ...fresh, isPremium: true, clients: 40, hasCardDesign: true, deals: 2, sentPush: true,
      luckyWheels: 1, scratchCampaigns: 0, teamMembers: 2, sentEmail: true, sentWhatsapp: true, stores: 3, stampCodes: 5,
    };
    expect(candidateTips(used)).toEqual(['scratch']);
  });

  it('every tip has texts in 3 languages and a screen', () => {
    for (const key of Object.keys(TIP_MESSAGES) as Array<keyof typeof TIP_MESSAGES>) {
      expect(TIP_ACTIONS[key]).toMatch(/^open_/);
      for (const l of ['fr', 'en', 'ar'] as const) {
        expect(TIP_MESSAGES[key][l].title.length).toBeGreaterThan(0);
        expect(TIP_MESSAGES[key][l].body.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('reminder stages', () => {
  it('picks the highest stage reached', () => {
    expect(reachedStage(SCAN_GAP_STAGES, 4)).toBeNull();
    expect(reachedStage(SCAN_GAP_STAGES, 5)).toBe(5);
    expect(reachedStage(SCAN_GAP_STAGES, 12)).toBe(10);
    expect(reachedStage(SCAN_GAP_STAGES, 60)).toBe(21);
    expect(reachedStage(FIRST_SCAN_STAGES, 2)).toBe(1);
    expect(reachedStage(APP_IDLE_STAGES_D, 29)).toBe(14);
    expect(reachedStage(ONBOARDING_STAGES_H, 1)).toBeNull();
    expect(reachedStage(ONBOARDING_STAGES_H, 30)).toBe(24);
  });

  it('every new message exists in 3 languages', () => {
    for (const msg of Object.values(NOTIF_MESSAGES)) {
      for (const l of ['fr', 'en', 'ar'] as const) {
        expect(msg[l].title).toBeTruthy();
        expect(msg[l].body).toBeTruthy();
      }
    }
  });
});

describe('engagement plan', () => {
  const NOW = Date.UTC(2026, 10, 4, 8);
  const daysAgo = (d: number) => new Date(NOW - d * 86_400_000);

  it('reminds a merchant who never scanned on day 1, 3 and 7', () => {
    expect(planEngagementReminder({ language: 'fr', createdAt: daysAgo(0.5) }, null, NOW)).toBeNull();
    expect(planEngagementReminder({ language: 'fr', createdAt: daysAgo(4) }, null, NOW)?.campaignId).toBe('merchant_first_scan_3d');
  });

  it('restarts the scan-gap series after a new scan and sends support on day 21', () => {
    const a = planEngagementReminder({ language: 'ar', createdAt: daysAgo(90) }, daysAgo(22), NOW);
    expect(a).toMatchObject({ category: 'REMINDER', action: 'open_support' });
    const b = planEngagementReminder({ language: 'ar', createdAt: daysAgo(90) }, daysAgo(6), NOW);
    expect(b?.campaignId).toMatch(/^merchant_scan_gap_5d_/);
    expect(b?.campaignId).not.toBe(a?.campaignId);
    expect(planEngagementReminder({ language: 'en', createdAt: daysAgo(90) }, daysAgo(2), NOW)).toBeNull();
  });
});

describe('helpers', () => {
  it('crossedMilestone picks the highest milestone crossed', () => {
    expect(crossedMilestone(8, 12)).toBe(10);
    expect(crossedMilestone(20, 60)).toBe(50);
    expect(crossedMilestone(12, 20)).toBeNull();
  });

  it('mapLimit keeps order and never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 0], 2, async (ms) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--;
      return ms * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 0]);
    expect(peak).toBe(2);
    await expect(mapLimit([], 3, async () => 1)).resolves.toEqual([]);
  });
});
