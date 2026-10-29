import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { Plus } from 'lucide-react-native';
import { JitPin } from '@/components/icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { useMerchantDeals } from '@/hooks/queries/deals';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import { Button, Notice, ScreenHeader } from '@/components/scratch/ScratchUI';
import { CampaignRow, GameEmptyState, HeaderAddButton, ListSeparator, type CampaignLine } from '@/components/games/GameList';
import { formatYmd } from '@/components/scratch/DateField';
import { moroccoYmdOf } from '@/components/scratch/campaignForm';
import DealThumb from '@/components/deals/DealThumb';
import { DealStatusPill, useDealMerchantLook, type DealMerchantLook } from '@/components/deals/DealRows';
import { dealBadgeLabel, dealTimeLeftLabel } from '@/components/deals/dealVisual';
import { DEAL_LIST_TABS, dealLimitReached, dealsForTab, type DealListTab } from '@/components/deals/dealForm';
import type { MerchantDealDto } from '@jitplus/shared/src/deals';

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
  const limit = dealLimitReached(limits);
  const limitMessage = limit === 'active'
    ? t('deals.list.limitActive', { max: limits?.maxActive })
    : limit === 'daily'
      ? t('deals.list.limitDaily', { max: limits?.maxPerDay })
      : null;

  const look = useDealMerchantLook();

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
    ({ item }: { item: MerchantDealDto }) => <DealListItem deal={item} look={look} onOpen={openDeal} />,
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
          visual={
            <DealThumb
              coverUrl={look.coverUrl}
              themeColor={look.themeColor}
              category={look.categorie}
              badge={t('deals.badge.percent', { value: 20 })}
              width={ms(112)}
              radius={20}
            />
          }
          title={t('deals.list.emptyTitle')}
          text={t('deals.list.intro')}
          steps={[t('deals.list.how1'), t('deals.list.how2'), t('deals.list.how3')]}
          action={canManage ? (
            <Button icon={Plus} label={t('deals.list.create')} onPress={create} disabled={!!limitMessage} style={styles.stretch} />
          ) : undefined}
        />
      ) : null}

      {limits && !empty && (
        <Text style={[styles.limits, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.3}>
          {t('deals.list.limits', {
            active: limits.activeCount,
            maxActive: limits.maxActive,
            today: limits.createdToday,
            maxPerDay: limits.maxPerDay,
          })}
        </Text>
      )}
      {canManage && limitMessage && !empty && <Notice tone="warning" text={limitMessage} />}

      {canManage && limits && !limits.hasLocatedStore && (
        <View style={[styles.locationBox, { backgroundColor: `${theme.warning}12`, borderColor: `${theme.warning}35` }]}>
          <Text style={[styles.locationText, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
            {t('deals.list.needsLocation')}
          </Text>
          <Button variant="secondary" icon={JitPin} label={t('deals.list.addLocation')} onPress={goStores} />
        </View>
      )}

      {!empty && (
        <View style={[styles.tabBar, { flexDirection: row, backgroundColor: theme.bgCard, borderColor: theme.borderLight }]} accessibilityRole="tablist">
          {DEAL_LIST_TABS.map((key) => {
            const active = key === tab;
            const label = t('deals.list.tabCount', { label: t(`deals.list.tabs.${key}`), count: counts[key] });
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setTab(key)}
                style={[styles.tab, active && { backgroundColor: theme.primary }]}
                activeOpacity={0.75}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
              >
                <Text style={[styles.tabText, { color: active ? '#FFFFFF' : theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {label}
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
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        right={canManage && !empty ? (
          <View style={limitMessage ? styles.dimmed : undefined}>
            <HeaderAddButton label={t('deals.list.create')} onPress={create} />
          </View>
        ) : undefined}
      />
      {isLoading ? (
        <View style={styles.loader}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ItemSeparatorComponent={ListSeparator}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary} />}
        />
      )}
    </View>
  );
}

const DealListItem = React.memo(function DealListItem({ deal, look, onOpen }: {
  deal: MerchantDealDto;
  look: DealMerchantLook;
  onOpen: (id: string) => void;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const day = (ymd: string) => formatYmd(ymd, locale, false);
  const stats: CampaignLine = { text: t('deals.list.stats', { views: deal.stats.views, clicks: deal.stats.linkClicks }) };
  const dates = t('deals.list.dates', { start: day(deal.startsOn), end: day(deal.endsOn) });
  const scope = t(`deals.scope.${deal.scope}`);

  let lines: CampaignLine[];
  switch (deal.displayStatus) {
    case 'LIVE': {
      const time = dealTimeLeftLabel(deal.endsAt, t);
      lines = [
        { text: time.text, color: time.urgent ? theme.warning : undefined, tone: 'secondary' },
        { text: `${scope} · ${dates}` },
        stats,
      ];
      break;
    }
    case 'SCHEDULED':
      lines = [{ text: t('deals.list.startsOn', { date: day(deal.startsOn) }), tone: 'secondary' }, { text: `${scope} · ${dates}` }];
      break;
    case 'REMOVED':
      lines = [{ text: t('deals.list.removed'), color: theme.danger }, stats];
      break;
    default:
      lines = [{ text: t('deals.list.endedOn', { date: day(moroccoYmdOf(new Date(deal.endsAt))) }) }, stats];
  }

  return (
    <CampaignRow
      leading={
        <DealThumb
          imageUrl={deal.imageUrl}
          coverUrl={look.coverUrl}
          themeColor={look.themeColor}
          category={look.categorie}
          badge={dealBadgeLabel(deal, t)}
          width={ms(60)}
        />
      }
      title={deal.title}
      status={<DealStatusPill status={deal.displayStatus} />}
      lines={lines}
      onPress={() => onOpen(deal.id)}
      accessibilityLabel={`${deal.title}, ${t(`deals.status.${deal.displayStatus}`)}`}
    />
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  headerContent: { gap: 12, marginBottom: 14 },
  stretch: { alignSelf: 'stretch' },
  dimmed: { opacity: 0.45 },
  limits: { fontSize: ms(13), fontFamily: font.medium, paddingHorizontal: 2 },
  locationBox: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  locationText: { fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular },
  tabBar: { borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabText: { fontSize: ms(13), fontFamily: font.semibold },
  emptyTab: { fontSize: ms(13), fontFamily: font.regular, textAlign: 'center', paddingVertical: 16 },
});
