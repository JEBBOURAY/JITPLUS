import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { ChevronRight, Plus } from 'lucide-react-native';
import { Image } from 'expo-image';
import { JitPin } from '@/components/icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { useMerchantDeals } from '@/hooks/queries/deals';
import { getIntlLocale } from '@/config/currency';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { Button, Notice, ScreenHeader } from '@/components/scratch/ScratchUI';
import { GameEmptyState, HeaderAddButton, ListSeparator } from '@/components/games/GameList';
import { formatYmd } from '@/components/scratch/DateField';
import { moroccoYmdOf } from '@/components/scratch/campaignForm';
import { SummaryCard } from '@/components/ui/SummaryCard';
import DealThumb from '@/components/deals/DealThumb';
import { DemoHeaderActions } from '@/components/demo/DemoVideoButton';
import { DealStatusPill, useDealMerchantLook, type DealMerchantLook } from '@/components/deals/DealRows';
import { dealBadgeLabel, dealTimeLeftLabel } from '@/components/deals/dealVisual';
import { DEAL_LIST_TABS, dealLimitReached, dealsForTab, type DealListTab } from '@/components/deals/dealForm';
import type { MerchantDealDto } from '@jitplus/shared/src/deals';

// Same artwork as the "Bons plans" card of Accueil.
const DEALS_IMAGE = require('@/assets/images/tools/bons_plans.png');

/** Figures in the app language ("1 248" in French, "1,248" in English). */
function useNumberFormat() {
  const { locale } = useLanguage();
  return useCallback((n: number) => n.toLocaleString(getIntlLocale(locale)), [locale]);
}

export default function DealsScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const canManage = !isTeamMember;
  const [tab, setTab] = useState<DealListTab>('live');

  const { data, isLoading, isError, refetch, isRefetching } = useMerchantDeals(!shouldWait);
  const deals = useMemo(() => data?.deals ?? [], [data?.deals]);
  const limits = data?.limits;
  const visible = useMemo(() => dealsForTab(deals, tab), [deals, tab]);
  const counts = useMemo(
    () => Object.fromEntries(DEAL_LIST_TABS.map((k) => [k, dealsForTab(deals, k).length])) as Record<DealListTab, number>,
    [deals],
  );
  const totals = useMemo(
    () => deals.reduce(
      (acc, d) => ({ views: acc.views + d.stats.views, clicks: acc.clicks + d.stats.linkClicks }),
      { views: 0, clicks: 0 },
    ),
    [deals],
  );
  const limit = dealLimitReached(limits);
  const limitMessage = limit === 'active'
    ? t('deals.list.limitActive', { max: limits?.maxActive })
    : limit === 'daily'
      ? t('deals.list.limitDaily', { max: limits?.maxPerDay })
      : null;

  const look = useDealMerchantLook();
  const number = useNumberFormat();

  const openDeal = useCallback(
    (id: string) => router.push({ pathname: '/deals/[id]', params: { id } }),
    [router],
  );
  const create = useCallback(() => {
    if (limitMessage) {
      Alert.alert(t('deals.list.limitTitle'), limitMessage);
      return;
    }
    router.push('/deals/create');
  }, [limitMessage, router, t]);
  const goStores = useCallback(() => router.push('/stores'), [router]);

  const renderItem = useCallback(
    ({ item }: { item: MerchantDealDto }) => <DealCard deal={item} look={look} onOpen={openDeal} />,
    [look, openDeal],
  );

  if (shouldWait) return null;

  const empty = deals.length === 0 && !isLoading;

  const header = (
    <View style={styles.headerContent}>
      {isTeamMember && <Notice text={t('deals.list.ownerOnly')} />}
      {isError && <Notice tone="danger" text={t('deals.list.loadError')} />}

      {empty && !isError ? (
        <GameEmptyState
          visual={<Image source={DEALS_IMAGE} style={styles.emptyImage} contentFit="contain" accessible={false} />}
          title={t('deals.list.emptyTitle')}
          text={t('deals.list.intro')}
          steps={[t('deals.list.how1'), t('deals.list.how2'), t('deals.list.how3')]}
          action={canManage ? (
            <Button icon={Plus} label={t('deals.list.create')} onPress={create} disabled={!!limitMessage} style={styles.stretch} />
          ) : undefined}
        />
      ) : null}

      {limits && !empty ? (
        <SummaryCard
          label={t('deals.list.heroLabel')}
          value={limits.activeCount}
          max={limits.maxActive}
          stats={[
            { label: t('deals.list.views'), value: number(totals.views) },
            { label: t('deals.list.clicks'), value: number(totals.clicks) },
            { label: t('deals.list.today'), value: `${limits.createdToday}/${limits.maxPerDay}` },
          ]}
        />
      ) : null}

      {canManage && limitMessage && !empty && <Notice tone="warning" text={limitMessage} />}

      {canManage && limits && !limits.hasLocatedStore && (
        <View style={[styles.locationBox, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Text style={[styles.locationText, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
            {t('deals.list.needsLocation')}
          </Text>
          <Button variant="secondary" icon={JitPin} label={t('deals.list.addLocation')} onPress={goStores} />
        </View>
      )}

      {!empty && (
        <View style={[styles.tabBar, { flexDirection: row, backgroundColor: theme.bgCard, borderColor: theme.border }]} accessibilityRole="tablist">
          {DEAL_LIST_TABS.map((key) => {
            const active = key === tab;
            const label = t(`deals.list.tabs.${key}`);
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setTab(key)}
                style={[styles.tab, { flexDirection: row }, active && { backgroundColor: theme.primary }]}
                activeOpacity={0.75}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t('deals.list.tabCount', { label, count: counts[key] })}
              >
                <Text style={[styles.tabText, { color: active ? '#FFFFFF' : theme.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {label}
                </Text>
                <Text style={[styles.tabCount, { color: active ? 'rgba(255,255,255,0.7)' : theme.textMuted }]} maxFontSizeMultiplier={1.2}>
                  {counts[key]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {!empty && visible.length === 0 && (
        <Text style={[styles.emptyTab, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
          {t(`deals.list.emptyTab.${tab}`)}
        </Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title={t('deals.title')}
        right={(
          <DemoHeaderActions id="bonsplans">
            {canManage && !empty && !isLoading ? (
              <View style={limitMessage ? styles.dimmed : undefined}>
                <HeaderAddButton label={t('deals.list.create')} onPress={create} />
              </View>
            ) : null}
          </DemoHeaderActions>
        )}
      />

      {isLoading ? (
        <View style={styles.loader}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ItemSeparatorComponent={ListSeparator}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[theme.primary]} tintColor={theme.primary} />}
        />
      )}
    </View>
  );
}

/** One deal: visual, title and status, then its two figures and its dates. */
const DealCard = React.memo(function DealCard({ deal, look, onOpen }: {
  deal: MerchantDealDto;
  look: DealMerchantLook;
  onOpen: (id: string) => void;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row, textAlign, flip, isRTL } = useDir();
  const day = (ymd: string) => formatYmd(ymd, locale, false);
  const number = useNumberFormat();
  const dates = t('deals.list.dates', { start: day(deal.startsOn), end: day(deal.endsOn) });
  const scope = t(`deals.scope.${deal.scope}`);

  let headline: string;
  let headlineColor = theme.textSecondary;
  switch (deal.displayStatus) {
    case 'LIVE': {
      const time = dealTimeLeftLabel(deal.endsAt, t);
      headline = time.text;
      if (time.urgent) headlineColor = theme.warning;
      break;
    }
    case 'SCHEDULED':
      headline = t('deals.list.startsOn', { date: day(deal.startsOn) });
      break;
    case 'REMOVED':
      headline = t('deals.list.removed');
      headlineColor = theme.danger;
      break;
    default:
      headline = t('deals.list.endedOn', { date: day(moroccoYmdOf(new Date(deal.endsAt))) });
  }

  const views = number(deal.stats.views);
  const clicks = number(deal.stats.linkClicks);

  return (
    <TouchableOpacity
      onPress={() => onOpen(deal.id)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={[
        deal.title,
        t(`deals.status.${deal.displayStatus}`),
        headline,
        `${t('deals.list.views')} ${views}`,
        `${t('deals.list.clicks')} ${clicks}`,
        scope,
        dates,
      ].join(', ')}
      style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
    >
      <View style={[styles.cardTop, { flexDirection: row }]}>
        <DealThumb
          imageUrl={deal.imageUrl}
          coverUrl={look.coverUrl}
          themeColor={look.themeColor}
          category={look.categorie}
          badge={dealBadgeLabel(deal, t)}
          width={ms(64)}
          radius={14}
        />
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {deal.title}
          </Text>
          <View style={[styles.cardStatus, { flexDirection: row }]}>
            <DealStatusPill status={deal.displayStatus} />
            <Text style={[styles.cardHeadline, { color: headlineColor, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {headline}
            </Text>
          </View>
        </View>
        <ChevronRight size={18} color={theme.textMuted} strokeWidth={icon.stroke} style={flip} />
      </View>

      <View style={[styles.cardFooter, { flexDirection: row, borderTopColor: theme.borderLight }]}>
        <Text style={[styles.figureLabel, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
          <Text style={[styles.figureValue, { color: theme.text }]}>{views}</Text> {t('deals.list.views')}
        </Text>
        <Text style={[styles.figureLabel, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
          <Text style={[styles.figureValue, { color: theme.text }]}>{clicks}</Text> {t('deals.list.clicks')}
        </Text>
        <Text style={[styles.cardDates, { color: theme.textMuted, textAlign: isRTL ? 'left' : 'right' }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {scope} · {dates}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  headerContent: { gap: 12, marginBottom: 14 },
  stretch: { alignSelf: 'stretch' },
  dimmed: { opacity: 0.45 },

  emptyImage: { width: 104, height: 104 },
  locationBox: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 12 },
  locationText: { fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular },
  tabBar: { borderRadius: 14, borderWidth: 1, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  tabText: { flexShrink: 1, fontSize: ms(13), fontFamily: font.semibold },
  tabCount: { fontSize: ms(12), fontFamily: font.medium },
  emptyTab: { fontSize: ms(13), fontFamily: font.regular, textAlign: 'center', paddingVertical: 16 },

  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 12 },
  cardTop: { alignItems: 'center', gap: 12 },
  cardBody: { flex: 1, gap: 8 },
  cardTitle: { fontSize: 16, lineHeight: 21, fontFamily: font.semibold, letterSpacing: -0.2 },
  cardStatus: { alignItems: 'center', gap: 8 },
  cardHeadline: { flexShrink: 1, fontSize: ms(12), fontFamily: font.medium },
  cardFooter: { alignItems: 'center', gap: 14, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  figureLabel: { fontSize: ms(12), fontFamily: font.regular },
  figureValue: { fontSize: ms(13), fontFamily: font.semibold },
  cardDates: { flex: 1, fontSize: ms(12), fontFamily: font.regular },
});
