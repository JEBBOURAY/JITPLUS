import { moneyFormatter } from '@jitplus/shared/src/currency';
import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Share, Alert, Linking, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bookmark, ChevronRight, ExternalLink, Flag, Flame, Globe,
  Hourglass, ListChecks, MapPin, Navigation, Phone, Share2, Store, FileText, Ticket,
} from 'lucide-react-native';
import { hasCoords, pluralKey, toTel } from '@jitplus/shared';
import { openDirections, openFirst } from '@jitplus/shared/src/openLinks';
import { DEAL_REPORT_REASONS, type ClientDealDetail, type ClientDealStore, type DealReportReason } from '@jitplus/shared/src/deals';
import { Text } from '@/components/AppText';
import Skeleton from '@/components/Skeleton';
import MerchantLogo from '@/components/MerchantLogo';
import ActionSheet, { type ActionSheetOption } from '@/components/ActionSheet';
import DetailErrorState from '@/components/DetailErrorState';
import { HeaderBackButton } from '@/components/ScreenHeader';
import MerchantSection from '@/components/merchant/MerchantSection';
import DealThumb from '@/components/deals/DealThumb';
import DealPassSheet from '@/components/deals/DealPassSheet';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { recordDealEvent, useClaimDeal, useDeal, useReportDeal, useSaveDeal } from '@/hooks/useDealHooks';
import { useKnownLocation } from '@/hooks/useKnownLocation';
import { usePromptLogin } from '@/hooks/usePromptLogin';
import { getServerBaseUrl } from '@/services/api';
import { savePendingDeal } from '@/services/pendingDeal';
import {
  dealBadgeLabel, dealLinkHost, dealPrices, dealStoresByDistance, dealTimeLeftLabel, formatDealEndDate, isSafeDealLink,
} from '@/utils/dealVisual';
import { formatDistance } from '@/utils/distance';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { isNotFoundError } from '@/utils/errorMessage';
import { isEntityId } from '@/utils/ids';
import { getMerchantAccent } from '@/utils/merchantAccent';
import { wp, hp, ms, fontSize } from '@/utils/responsive';
import { DIR_FLIP } from '@/utils/rtl';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const BOTTOM_BAR_SPACE = hp(110);

export default function DealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dealId = isEntityId(id) ? id.toLowerCase() : undefined;
  return <DealDetail dealId={dealId} />;
}

/** Guests see the whole deal; using, saving or reporting it needs an account. */
function DealDetail({ dealId }: { dealId?: string }) {
  const { isAuthenticated } = useAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const userLocation = useKnownLocation();
  const { data: deal, isLoading, error, refetch } = useDeal(dealId);
  const { mutateAsync: reportDeal, isPending: reportPending } = useReportDeal(dealId ?? '');
  const { mutate: claimDeal, isPending: claimPending } = useClaimDeal(dealId ?? '');
  const { mutate: saveDeal } = useSaveDeal(dealId ?? '');
  const [sheet, setSheet] = useState(false);
  const [passVisible, setPassVisible] = useState(false);

  const stores = useMemo(() => dealStoresByDistance(deal?.stores, userLocation), [deal?.stores, userLocation]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/deals');
  }, [router]);

  const share = useCallback(async () => {
    if (!deal) return;
    haptic();
    const url = `${getServerBaseUrl()}/bp/${deal.id}`;
    try {
      const result = await Share.share({
        message: `${t('deals.detail.shareText', { title: deal.title, merchant: deal.merchant.nom })}\n\n${url}`,
        url,
      });
      if (result.action === Share.sharedAction) recordDealEvent(deal.id, 'SHARE');
    } catch { /* user cancelled */ }
  }, [deal, t]);

  /** The guest comes back to this deal once signed in. */
  const showLoginPrompt = usePromptLogin();
  const promptLogin = useCallback(() => {
    showLoginPrompt({ remember: () => { if (dealId) savePendingDeal(dealId); } });
  }, [dealId, showLoginPrompt]);

  const toggleSaved = useCallback(() => {
    if (!deal) return;
    if (!isAuthenticated) { promptLogin(); return; }
    haptic();
    saveDeal(!deal.saved, { onError: () => Alert.alert(t('common.error'), t('deals.detail.saveError')) });
  }, [deal, isAuthenticated, promptLogin, saveDeal, t]);

  /** First tap takes the pass (counted once for the merchant), later taps only show it again. */
  const openPass = useCallback(() => {
    if (!deal || claimPending) return;
    if (!isAuthenticated) { promptLogin(); return; }
    haptic();
    if (deal.claimedAt) { setPassVisible(true); return; }
    claimDeal(undefined, {
      onSuccess: () => setPassVisible(true),
      onError: () => Alert.alert(t('common.error'), t('deals.detail.claimError')),
    });
  }, [deal, claimPending, isAuthenticated, promptLogin, claimDeal, t]);

  const call = useCallback((tel: string) => {
    if (!deal) return;
    haptic();
    recordDealEvent(deal.id, 'CALL');
    void openFirst([tel]);
  }, [deal]);

  const openLink = useCallback(async () => {
    // Checked again right before opening: the link comes from a merchant.
    if (!deal || !isSafeDealLink(deal.linkUrl)) return;
    haptic();
    recordDealEvent(deal.id, 'LINK_CLICK');
    try {
      await Linking.openURL(deal.linkUrl);
    } catch {
      Alert.alert(t('common.error'), t('deals.detail.linkError'));
    }
  }, [deal, t]);

  const directionsTo = useCallback((store: ClientDealStore) => {
    if (!deal || !hasCoords(store)) return;
    haptic();
    recordDealEvent(deal.id, 'DIRECTIONS');
    void openDirections(store.latitude, store.longitude, store.nom || deal.merchant.nom);
  }, [deal]);

  const openMerchant = useCallback(() => {
    if (!deal || !isEntityId(deal.merchant.id)) return;
    haptic();
    router.push({ pathname: '/merchant/[id]', params: { id: deal.merchant.id } });
  }, [deal, router]);

  const submitReport = useCallback(async (reason: DealReportReason) => {
    if (reportPending) return;
    try {
      const res = await reportDeal({ reason });
      haptic();
      if (res.alreadyReported) {
        Alert.alert(t('deals.report.title'), t('deals.report.already'));
      } else {
        Alert.alert(t('deals.report.thanksTitle'), t('deals.report.thanksBody'), [{ text: t('common.ok'), onPress: goBack }]);
      }
    } catch {
      Alert.alert(t('common.error'), t('deals.report.error'));
    }
  }, [reportDeal, reportPending, t, goBack]);

  const reportOptions = useMemo<ActionSheetOption[]>(
    () => DEAL_REPORT_REASONS.map((reason) => ({
      key: reason,
      label: t(`deals.report.reasons.${reason}`),
      onPress: () => { void submitReport(reason); },
    })),
    [submitReport, t],
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Skeleton width="100%" height={wp(250)} borderRadius={0} />
        <View style={styles.skeletonBody}>
          <Skeleton width={wp(120)} height={hp(22)} borderRadius={ms(8)} />
          <Skeleton width="90%" height={hp(28)} borderRadius={ms(8)} />
          <Skeleton width={wp(160)} height={hp(20)} borderRadius={ms(8)} />
          <Skeleton width="100%" height={hp(70)} borderRadius={ms(18)} />
          <Skeleton width="100%" height={hp(140)} borderRadius={ms(22)} />
        </View>
      </View>
    );
  }

  if (!deal) {
    const notFound = !dealId || !error || isNotFoundError(error);
    return (
      <DetailErrorState
        header={<View style={styles.plainHeader}><HeaderBackButton onPress={goBack} /></View>}
        title={notFound ? t('deals.detail.notFoundTitle') : t('common.error')}
        message={notFound ? t('deals.detail.notFoundBody') : t('errors.generic')}
        actions={[notFound
          ? { label: t('deals.title'), onPress: () => router.replace('/(tabs)/deals') }
          : { label: t('common.retry'), onPress: () => { void refetch(); } }]}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_BAR_SPACE }}>
        <DealThumb
          imageUrl={deal.imageUrl}
          coverUrl={deal.merchant.coverUrl}
          themeColor={deal.merchant.themeColor}
          category={deal.merchant.categorie}
          badge={dealBadgeLabel(deal, t)}
          width={width}
          height={Math.round(width * 0.72)}
          radius={0}
        />
        <DealBody
          deal={deal}
          stores={stores}
          suggestCard={isAuthenticated && !deal.hasCard && !deal.isOver}
          onMerchant={openMerchant}
          onDirections={directionsTo}
          onCall={call}
        />
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + hp(8) }]} pointerEvents="box-none">
        <HeaderBackButton onPress={goBack} floating />
        <View style={styles.topActions}>
          <Pressable onPress={share} hitSlop={8} style={[styles.roundBtn, styles.floatingBtn]} accessibilityRole="button" accessibilityLabel={t('deals.detail.share')}>
            <Share2 size={ms(18)} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
          {!deal.isOver && (
            <Pressable
              onPress={toggleSaved}
              hitSlop={8}
              style={[styles.roundBtn, styles.floatingBtn]}
              accessibilityRole="button"
              accessibilityLabel={deal.saved ? t('deals.detail.unsave') : t('deals.detail.save')}
              accessibilityState={{ selected: deal.saved }}
            >
              <Bookmark size={ms(18)} color="#FFFFFF" fill={deal.saved ? '#FFFFFF' : 'transparent'} strokeWidth={2} />
            </Pressable>
          )}
          {isAuthenticated && (
            <Pressable
              onPress={() => { haptic(); setSheet(true); }}
              hitSlop={8}
              style={[styles.roundBtn, styles.floatingBtn]}
              accessibilityRole="button"
              accessibilityLabel={t('deals.report.action')}
            >
              <Flag size={ms(17)} color="#FFFFFF" strokeWidth={2} />
            </Pressable>
          )}
        </View>
      </View>

      <DealActionBar
        deal={deal}
        nearest={stores.find((s) => hasCoords(s))}
        claimPending={claimPending}
        onLink={openLink}
        onPass={openPass}
        onDirections={directionsTo}
        onMerchant={openMerchant}
        onCall={call}
      />

      <DealPassSheet
        visible={passVisible}
        deal={deal}
        badge={dealBadgeLabel(deal, t)}
        price={dealPrices(deal, moneyFormatter(deal.merchant.currency, locale), t).price}
        onClose={() => setPassVisible(false)}
      />

      <ActionSheet
        visible={sheet}
        title={t('deals.report.title')}
        message={t('deals.report.body')}
        options={reportOptions}
        cancelLabel={t('common.cancel')}
        onClose={() => setSheet(false)}
      />
    </View>
  );
}

function DealBody({ deal, stores, suggestCard, onMerchant, onDirections, onCall }: {
  deal: ClientDealDetail;
  /** Nearest first, with the distances known on the device */
  stores: ClientDealStore[];
  /** The client has no loyalty card at this merchant yet */
  suggestCard: boolean;
  onMerchant: () => void;
  onDirections: (store: ClientDealStore) => void;
  onCall: (tel: string) => void;
}) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const accent = getMerchantAccent(deal.merchant.themeColor);
  const badge = dealBadgeLabel(deal, t);
  const { price, original, struck, savings } = dealPrices(deal, moneyFormatter(deal.merchant.currency, locale), t);
  // The deal is fetched without the position: the distance comes from the nearest store.
  const distanceKm = deal.distanceKm ?? stores[0]?.distanceKm ?? null;
  const category = t(`categories.${deal.merchant.categorie}`, { defaultValue: deal.merchant.categorie });
  const time = dealTimeLeftLabel(deal.endsAt, t);
  const online = deal.scope === 'ONLINE';
  const endDate = formatDealEndDate(deal.endsAt, locale);
  const timeColor = time.urgent ? theme.warning : theme.textSecondary;

  return (
    <View style={styles.body}>
      {deal.isOver && (
        <View style={[styles.overBox, { backgroundColor: `${theme.warning}18`, borderColor: `${theme.warning}55` }]}>
          <Hourglass size={ms(18)} color={theme.warning} strokeWidth={2} />
          <View style={styles.flex}>
            <Text style={[styles.overTitle, { color: theme.text, fontFamily: fonts.bold }]}>{t('deals.detail.overTitle')}</Text>
            <Text style={[styles.overText, { color: theme.textSecondary, fontFamily: fonts.regular }]}>
              {t('deals.detail.overBody', { merchant: deal.merchant.nom })}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.pills}>
        {!!badge && (
          <View style={[styles.pill, { backgroundColor: theme.danger }]}>
            <Text style={[styles.pillText, { color: '#FFFFFF', fontFamily: fonts.bold }]}>{badge}</Text>
          </View>
        )}
        <View style={[styles.pill, { backgroundColor: theme.bgInput }]}>
          {online ? <Globe size={ms(12)} color={theme.textSecondary} strokeWidth={2} /> : <Store size={ms(12)} color={theme.textSecondary} strokeWidth={2} />}
          <Text style={[styles.pillText, { color: theme.textSecondary, fontFamily: fonts.semibold }]}>{t(`deals.scope.${deal.scope}`)}</Text>
        </View>
        {deal.isPopular && (
          <View style={[styles.pill, { backgroundColor: `${theme.warning}1F` }]}>
            <Flame size={ms(12)} color={theme.warning} strokeWidth={2.4} />
            <Text style={[styles.pillText, { color: theme.warning, fontFamily: fonts.semibold }]}>{t('deals.popular')}</Text>
          </View>
        )}
      </View>

      <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header">{deal.title}</Text>

      {(price || original) && (
        <View style={styles.priceRow}>
          {!!price && <Text style={[styles.price, { color: theme.danger, fontFamily: fonts.bold }]}>{price}</Text>}
          {!!original && (
            <Text style={[styles.original, { color: theme.textMuted, fontFamily: fonts.regular }, struck && styles.struck]}>
              {original}
            </Text>
          )}
        </View>
      )}
      {!!savings && !deal.isOver && (
        <Text style={[styles.savings, { color: theme.success, fontFamily: fonts.medium }]}>{t('deals.savings', { amount: savings })}</Text>
      )}

      {!deal.isOver && (
        <View style={styles.timeRow}>
          <Hourglass size={ms(14)} color={timeColor} strokeWidth={2} />
          <Text style={[styles.timeText, { color: timeColor, fontFamily: fonts.medium }]}>
            {endDate ? `${time.text} · ${t('deals.detail.validUntil', { date: endDate })}` : time.text}
          </Text>
        </View>
      )}

      <Pressable
        onPress={onMerchant}
        style={({ pressed }) => [styles.merchantRow, { backgroundColor: theme.bgCard, borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`${t('deals.detail.merchantCta')}: ${deal.merchant.nom}`}
      >
        <View style={[styles.logoBox, { backgroundColor: `${accent}12` }]}>
          <MerchantLogo logoUrl={deal.merchant.logoUrl} style={styles.logo} merchantName={deal.merchant.nom} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.merchantName, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1}>{deal.merchant.nom}</Text>
          <Text style={[styles.merchantMeta, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={1}>
            {distanceKm != null ? `${category} · ${t('deals.detail.distanceAway', { distance: formatDistance(distanceKm) })}` : category}
          </Text>
          {suggestCard && (
            <Text style={[styles.merchantMeta, { color: theme.primary, fontFamily: fonts.medium }]} numberOfLines={1}>
              {t('deals.detail.getCard')}
            </Text>
          )}
        </View>
        <ChevronRight size={ms(18)} color={theme.textMuted} strokeWidth={2} style={DIR_FLIP} />
      </Pressable>

      {!!deal.description && (
        <MerchantSection title={t('deals.detail.description')} icon={FileText} accent={accent}>
          <Text style={[styles.paragraph, { color: theme.textSecondary, fontFamily: fonts.regular }]} selectable>{deal.description}</Text>
        </MerchantSection>
      )}

      {!!deal.conditions && (
        <MerchantSection title={t('deals.detail.conditions')} icon={ListChecks} accent={accent}>
          <Text style={[styles.paragraph, { color: theme.textSecondary, fontFamily: fonts.regular }]} selectable>{deal.conditions}</Text>
        </MerchantSection>
      )}

      {!online && stores.length > 0 && (
        <MerchantSection
          title={t('deals.detail.storesTitle')}
          icon={MapPin}
          accent={accent}
          right={stores.length > 1 ? (
            <Text style={[styles.count, { color: theme.textMuted, fontFamily: fonts.semibold }]}>
              {t(pluralKey('deals.detail.storeCount', stores.length), { count: stores.length })}
            </Text>
          ) : undefined}
        >
          <View style={styles.storeList}>
            {stores.map((store, i) => (
              <DealStoreRow
                key={store.id}
                store={store}
                fallbackName={deal.merchant.nom}
                accent={accent}
                first={i === 0}
                onDirections={onDirections}
                onCall={onCall}
              />
            ))}
          </View>
        </MerchantSection>
      )}
    </View>
  );
}

function DealStoreRow({ store, fallbackName, accent, first, onDirections, onCall }: {
  store: ClientDealStore;
  fallbackName: string;
  accent: string;
  first: boolean;
  onDirections: (store: ClientDealStore) => void;
  onCall: (tel: string) => void;
}) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  const name = store.nom || fallbackName;
  const address = store.adresse || [store.quartier, store.ville].filter(Boolean).join(', ');
  const tel = toTel(store.telephone);
  const canNavigate = hasCoords(store);

  return (
    <View style={[styles.storeRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <View style={styles.flex}>
        <Text style={[styles.storeName, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1}>{name}</Text>
        {!!address && (
          <Text style={[styles.storeAddress, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={2}>{address}</Text>
        )}
        {store.distanceKm != null && (
          <Text style={[styles.storeDistance, { color: accent, fontFamily: fonts.semibold }]}>{formatDistance(store.distanceKm)}</Text>
        )}
      </View>
      {!!tel && (
        <Pressable
          onPress={() => onCall(tel)}
          style={({ pressed }) => [styles.storeAction, { backgroundColor: `${theme.success}14`, opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('deals.detail.call')} ${name}`}
          hitSlop={4}
        >
          <Phone size={ms(17)} color={theme.success} strokeWidth={2} />
        </Pressable>
      )}
      {canNavigate && (
        <Pressable
          onPress={() => onDirections(store)}
          style={({ pressed }) => [styles.storeAction, { backgroundColor: `${accent}14`, opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('deals.detail.directions')} ${name}`}
          hitSlop={4}
        >
          <Navigation size={ms(17)} color={accent} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * One primary action: the offer page of an online deal, the pass of an in-store
 * one, the merchant page once the deal is over. Call and directions stay one tap away.
 */
function DealActionBar({ deal, nearest, claimPending, onLink, onPass, onDirections, onMerchant, onCall }: {
  deal: ClientDealDetail;
  nearest: ClientDealStore | undefined;
  claimPending: boolean;
  onLink: () => void;
  onPass: () => void;
  onDirections: (store: ClientDealStore) => void;
  onMerchant: () => void;
  onCall: (tel: string) => void;
}) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const tel = toTel(deal.merchantPhone);
  const link = !deal.isOver && deal.scope === 'ONLINE' && isSafeDealLink(deal.linkUrl) ? deal.linkUrl : null;
  const host = link ? dealLinkHost(link) : null;

  const inStore = !deal.isOver && deal.scope === 'LOCAL';

  let primary: { label: string; icon: typeof Navigation; onPress: () => void };
  if (link) primary = { label: t('deals.detail.seeOffer'), icon: ExternalLink, onPress: onLink };
  else if (inStore) primary = { label: t(deal.claimedAt ? 'deals.detail.showPass' : 'deals.detail.claim'), icon: Ticket, onPress: onPass };
  else primary = { label: t('deals.detail.merchantCta'), icon: Store, onPress: onMerchant };
  const PrimaryIcon = primary.icon;

  return (
    <View style={[styles.actionBar, { paddingBottom: insets.bottom + hp(10), backgroundColor: theme.bgElevated, borderTopColor: theme.border }]}>
      <View style={styles.actionRow}>
        {!deal.isOver && !!tel && (
          <Pressable
            onPress={() => onCall(tel)}
            style={({ pressed }) => [styles.callBtn, { backgroundColor: `${theme.success}14`, opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('deals.detail.call')}
          >
            <Phone size={ms(20)} color={theme.success} strokeWidth={2} />
          </Pressable>
        )}
        {inStore && !!nearest && (
          <Pressable
            onPress={() => onDirections(nearest)}
            style={({ pressed }) => [styles.callBtn, { backgroundColor: theme.primaryBg, opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('deals.detail.directions')}
          >
            <Navigation size={ms(20)} color={theme.primary} strokeWidth={2} />
          </Pressable>
        )}
        <Pressable
          onPress={primary.onPress}
          disabled={claimPending}
          style={({ pressed }) => [styles.flex, { opacity: pressed || claimPending ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityState={{ busy: claimPending }}
        >
          <View style={[styles.primaryBtn, { backgroundColor: palette.violet }]}>
            <PrimaryIcon size={ms(18)} color="#FFFFFF" strokeWidth={2} />
            <Text style={[styles.primaryText, { fontFamily: fonts.semibold }]}>{primary.label}</Text>
          </View>
        </Pressable>
      </View>
      {!!host && (
        <Text style={[styles.hostText, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={1}>
          {t('deals.detail.linkOn', { host })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  plainHeader: { paddingHorizontal: wp(16), paddingTop: hp(8) },
  primaryText: { color: '#FFFFFF', fontSize: fontSize.md },

  skeletonBody: { padding: wp(16), gap: hp(14) },

  topBar: { position: 'absolute', left: wp(16), right: wp(16), flexDirection: 'row', justifyContent: 'space-between' },
  topActions: { flexDirection: 'row', gap: wp(10) },
  roundBtn: { width: ms(40), height: ms(40), borderRadius: ms(20), alignItems: 'center', justifyContent: 'center' },
  floatingBtn: { backgroundColor: 'rgba(15,23,42,0.45)' },

  body: { paddingHorizontal: wp(16), paddingTop: hp(16), gap: hp(14) },
  overBox: { flexDirection: 'row', gap: wp(10), padding: ms(14), borderRadius: ms(16), borderWidth: 1 },
  overTitle: { fontSize: ms(15) },
  overText: { fontSize: ms(13), lineHeight: ms(19), marginTop: hp(2) },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(8) },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: ms(10), paddingHorizontal: wp(9), paddingVertical: hp(4) },
  pillText: { fontSize: ms(12) },
  title: { fontSize: ms(22), lineHeight: ms(29), letterSpacing: -0.3, marginTop: -hp(4) },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: wp(10), marginTop: -hp(6) },
  price: { fontSize: ms(24) },
  original: { fontSize: ms(15) },
  struck: { textDecorationLine: 'line-through' },
  savings: { fontSize: ms(13), marginTop: -hp(8) },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: wp(6) },
  timeText: { flexShrink: 1, fontSize: ms(13) },
  merchantRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12), padding: ms(12),
    borderRadius: ms(18), borderWidth: StyleSheet.hairlineWidth,
  },
  logoBox: { width: ms(46), height: ms(46), borderRadius: ms(14), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logo: { width: ms(46), height: ms(46) },
  merchantName: { fontSize: ms(15) },
  merchantMeta: { fontSize: ms(12), marginTop: hp(2) },
  paragraph: { fontSize: ms(14), lineHeight: ms(21), marginTop: -hp(4) },
  count: { fontSize: ms(12) },
  storeList: { marginTop: -hp(4) },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: wp(10), paddingVertical: hp(12) },
  storeName: { fontSize: ms(14) },
  storeAddress: { fontSize: ms(12), lineHeight: ms(17), marginTop: hp(2) },
  storeDistance: { fontSize: ms(12), marginTop: hp(4) },
  storeAction: { width: ms(40), height: ms(40), borderRadius: ms(14), alignItems: 'center', justifyContent: 'center' },

  actionBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: wp(16), paddingTop: hp(12), borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: wp(10) },
  callBtn: { width: ms(52), height: ms(52), borderRadius: ms(16), alignItems: 'center', justifyContent: 'center' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(8),
    height: ms(52), borderRadius: ms(16),
  },
  hostText: { fontSize: ms(11), textAlign: 'center', marginTop: hp(6) },
});
