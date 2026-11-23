import { moneyFormatter } from '@jitplus/shared/src/currency';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { Gift, Ticket } from 'lucide-react-native';

import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { wp, ms } from '@/utils/responsive';
import { formatDate } from '@/utils/date';
import MerchantLogo from '@/components/MerchantLogo';
import TabbedListScreen from '@/components/TabbedListScreen';
import { useClientCoupons, type ClientCouponStatus } from '@/hooks/useScratchHooks';
import { diffDaysYmd, formatRewardValue, toYmd } from '@jitplus/shared/src/scratch';
import type { CouponDto } from '@jitplus/shared/src/scratch';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const TWO_DAYS_MS = 48 * 3600 * 1000;

type Tab = { key: ClientCouponStatus; labelKey: string };

const keyOf = (c: CouponDto) => c.id;

const TABS: Tab[] = [
  { key: 'active', labelKey: 'scratch.coupons.tabActive' },
  { key: 'used', labelKey: 'scratch.coupons.tabUsed' },
  { key: 'expired', labelKey: 'scratch.coupons.tabExpired' },
];

export default function CouponsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const [tab, setTab] = useState<ClientCouponStatus>('active');

  const query = useClientCoupons(tab);
  const coupons = useMemo(() => query.data ?? [], [query.data]);

  const renderCoupon = useCallback(({ item }: { item: CouponDto }) => {
    const reward = formatRewardValue({ type: item.type, value: item.value, label: item.label }, t, moneyFormatter(item.merchant?.currency, locale));
    const isCancelled = item.status === 'CANCELLED';
    const expiresInMs = new Date(item.expiresAt).getTime() - Date.now();
    const soon = item.status === 'ACTIVE' && expiresInMs > 0 && expiresInMs < TWO_DAYS_MS;
    let statusLine = '';
    if (isCancelled) statusLine = t('scratch.coupons.cancelledBadge');
    else if (item.status === 'REDEEMED' && item.redeemedAt) {
      statusLine = t('scratch.coupons.usedOn', { date: formatDate(item.redeemedAt, locale) });
    } else if (item.status === 'ACTIVE') {
      // Calendar days on the device (Morocco time for our users), not 24 h slices:
      // a coupon ending tomorrow morning must not read "expires today" tonight.
      const days = diffDaysYmd(toYmd(new Date()), toYmd(new Date(item.expiresAt)));
      statusLine = days <= 0
        ? t('scratch.coupons.expiresToday')
        : t('scratch.coupons.expiresIn', { count: days });
    } else {
      statusLine = t('scratch.conditions.expiresAt', { date: formatDate(item.expiresAt, locale) });
    }

    const merchantName = item.merchant?.nom || t('common.shop');
    const fromCollection = item.source === 'COLLECTION';
    const badgeColor = fromCollection ? palette.goldDark : palette.violet;
    const BadgeIcon = fromCollection ? Gift : Ticket;
    const origin = fromCollection ? `${t('home.passCollectionTag')} · ${merchantName}` : merchantName;
    // Rows render bare: a virtualized list must not replay an entrance on every recycle or tab switch.
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
        activeOpacity={0.75}
        onPress={() => router.push({ pathname: '/coupons/[id]', params: { id: item.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${reward}, ${origin}`}
      >
        <MerchantLogo logoUrl={item.merchant?.logoUrl} merchantName={merchantName} style={styles.logo} />
        <View style={styles.cardInfo}>
          <Text style={[styles.cardReward, { color: theme.text }]} numberOfLines={2}>{reward}</Text>
          <Text style={[styles.cardMerchant, { color: theme.textSecondary }]} numberOfLines={1}>
            {origin}
          </Text>
          <Text
            style={[
              styles.cardStatus,
              { color: isCancelled ? theme.danger : soon ? theme.warning : theme.textMuted },
            ]}
            numberOfLines={1}
          >
            {statusLine}
          </Text>
        </View>
        <View style={[styles.cardBadge, { backgroundColor: `${badgeColor}14` }]}>
          <BadgeIcon size={ms(18)} color={badgeColor} />
        </View>
      </TouchableOpacity>
    );
  }, [theme, t, locale, router]);

  const emptyText = tab === 'active' ? t('scratch.coupons.emptyActive') : t('scratch.coupons.emptyOther');
  const emptyHint = tab === 'active' ? t('scratch.coupons.emptyActiveHint') : null;

  return (
    <TabbedListScreen
      title={t('scratch.coupons.title')}
      tabs={TABS}
      tab={tab}
      onTabChange={setTab}
      query={query}
      data={coupons}
      keyExtractor={keyOf}
      renderItem={renderCoupon}
      errorText={t('scratch.coupons.error')}
      emptyIcon={Ticket}
      emptyText={emptyText}
      emptyHint={emptyHint}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1, padding: wp(14), gap: wp(12),
  },
  logo: { width: ms(44), height: ms(44), borderRadius: ms(12) },
  cardInfo: { flex: 1 },
  cardReward: { fontSize: ms(15), fontWeight: '600' },
  cardMerchant: { fontSize: ms(12), fontWeight: '500', marginTop: 1 },
  cardStatus: { fontSize: ms(11), fontWeight: '600', marginTop: 3 },
  cardBadge: { width: ms(36), height: ms(36), borderRadius: ms(10), alignItems: 'center', justifyContent: 'center' },
});
