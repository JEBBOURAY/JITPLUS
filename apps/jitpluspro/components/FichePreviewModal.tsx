/**
 * Full-screen preview of the public merchant page, as the jitplus app shows
 * it to a customer who has no card yet (apps/jitplus/app/merchant/[id].tsx).
 *
 * The screen mirrors the client one block for block (MerchantHero,
 * MerchantStickyHeader, MerchantQuickActions, MerchantBottomBar), with the
 * client colors (fichePreview/clientTheme), the shared rules (@jitplus/shared
 * merchantFiche) and the shared wording (`fiche.*`). When the client page
 * changes, change this file and fichePreview/FicheSections with it.
 *
 * Known differences: the distance to the customer and the deals (fetched for
 * signed-in customers only) are not shown, share and "more" are inert, and the
 * card button does nothing. Contact buttons and links really open, so the
 * merchant can check them.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, Pressable, ScrollView, StatusBar, Platform, Animated, useWindowDimensions,
  type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Share2, MoreHorizontal, Navigation, Phone, MessageCircle, Globe, Mail, Wallet, EyeOff, type LucideIcon,
} from 'lucide-react-native';
import {
  MIN_MEMBERS_SHOWN, formatCompactCount, getCategoryEmoji, getFicheContacts, getFicheRewards, getFicheTabs, getKnownBadges,
  getOpenStatus, getSocialProfiles, describeOpenStatus, hasOpeningHours, type FicheContact,
} from '@jitplus/shared';
import { openDirections, openFirst } from '@jitplus/shared/src/openLinks';
import { palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMoney } from '@/config/currency';
import { useDir } from '@/hooks/useDir';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useLuckyWheelCampaigns, useRewards } from '@/hooks/useQueryHooks';
import { useDashboardKpis } from '@/hooks/queries/dashboard';
import { font } from '@/constants/design';
import { getCategoryLabel } from '@/constants/categories';
import { hapticLight } from '@/utils/haptics';
import { resolveImageUrl } from '@/utils/imageUrl';
import { MERCHANT_ICON_MAP } from '@/utils/merchantIcons';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant, Store } from '@/types';
import { useClientTheme } from '@/components/fichePreview/clientTheme';
import {
  FicheAbout, FicheGallery, FicheHours, FicheInfoSummary, FicheLocations, FicheLoyalty, FicheLoyaltySummary,
  FicheLuckyWheel, FicheTabs, TAB_BAR_HEIGHT, type FicheWheel, type PreviewTab,
} from '@/components/fichePreview/FicheSections';

// Same metrics as jitplus MerchantHero, MerchantStickyHeader and MerchantBottomBar.
const HERO_HEIGHT = hp(170);
const LOGO_SIZE = ms(84);
const LOGO_BORDER = 3;
const HEADER_BUTTON = ms(40);
const HEADER_PAD_TOP = hp(4);
const HEADER_PAD_BOTTOM = hp(8);
const TOP_SCRIM = ['rgba(0,0,0,0.30)', 'rgba(0,0,0,0)'] as const;
/** Room for the fixed bottom bar so the last section stays reachable. */
const BOTTOM_BAR_SPACE = hp(96);

const CONTACT_UI: Record<FicheContact['key'], { Icon: LucideIcon; labelKey: string }> = {
  directions: { Icon: Navigation, labelKey: 'fiche.directions' },
  call: { Icon: Phone, labelKey: 'fiche.call' },
  whatsapp: { Icon: MessageCircle, labelKey: 'fiche.whatsapp' },
  website: { Icon: Globe, labelKey: 'fiche.website' },
  email: { Icon: Mail, labelKey: 'fiche.email' },
};

type Campaigns = ReturnType<typeof useLuckyWheelCampaigns>['data'];

/** The campaign running right now, with only the prizes still available. */
function findActiveWheel(campaigns: Campaigns): FicheWheel | null {
  const now = Date.now();
  const active = campaigns?.find((c) => c.status === 'ACTIVE'
    && new Date(c.startsAt).getTime() <= now && new Date(c.endsAt).getTime() >= now);
  if (!active) return null;
  return {
    ...active,
    prizes: active.prizes.filter((p) => p.remaining > 0).sort((a, b) => b.weight - a.weight),
  };
}

function openContact(contact: FicheContact) {
  if (contact.key === 'directions') void openDirections(contact.latitude, contact.longitude, contact.label);
  else void openFirst([contact.url]);
}

interface Props {
  visible: boolean;
  onClose: () => void;
  merchant: Merchant;
  /** Every store of the merchant; only the active ones appear on the page. */
  stores: Store[];
  /** Opens the locations editor, offered when the page is not public yet. */
  onManageLocations?: () => void;
}

function FichePreview({ onClose, merchant, stores, onManageLocations }: Omit<Props, 'visible'>) {
  const theme = useClientTheme();
  const { t, locale } = useLanguage();
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const { isPremium } = usePlanStatus(merchant);
  const { data: rewardsData } = useRewards(true);
  const { data: campaigns } = useLuckyWheelCampaigns(isPremium);
  const { data: kpis } = useDashboardKpis();

  const pageBg = theme.bg;
  const ThemeIcon = merchant.themeIcon ? MERCHANT_ICON_MAP[merchant.themeIcon] : undefined;
  const coverUrl = merchant.coverUrl;

  // The client endpoint only returns active stores, and hides the page without any.
  const activeStores = useMemo(() => stores.filter((s) => s.isActive !== false), [stores]);
  const isPublic = merchant.isActive !== false && activeStores.length > 0;

  const openStatus = useMemo(() => getOpenStatus(merchant.openingHours), [merchant.openingHours]);
  const contacts = useMemo(() => getFicheContacts({
    name: merchant.nom,
    latitude: merchant.latitude,
    longitude: merchant.longitude,
    socialLinks: merchant.socialLinks,
    stores: activeStores,
  }), [merchant.nom, merchant.latitude, merchant.longitude, merchant.socialLinks, activeStores]);
  const profiles = useMemo(() => getSocialProfiles(merchant.socialLinks), [merchant.socialLinks]);
  const badges = useMemo(() => getKnownBadges(merchant.badges), [merchant.badges]);
  const rewards = useMemo(
    () => getFicheRewards(rewardsData, merchant.stampsForReward, t('fiche.defaultReward')),
    [rewardsData, merchant.stampsForReward, t],
  );

  const wheel = useMemo(() => findActiveWheel(campaigns), [campaigns]);

  // Main category and city only, as in the client hero.
  const subtitle = [merchant.categorie ? getCategoryLabel(merchant.categorie) : null, merchant.ville].filter(Boolean).join(' · ');
  // The client also shows its distance here; the member count is every loyalty card of the merchant.
  const members = kpis?.totalClients ?? 0;
  const facts = members >= MIN_MEMBERS_SHOWN ? t('fiche.members', { count: formatCompactCount(members) }) : '';

  const earnLine = merchant.stampEarningMode === 'PER_AMOUNT' && merchant.amountPerStamp
    ? t('fiche.earnPerAmount', { amount: formatMoney(merchant.amountPerStamp, merchant.currency, locale) })
    : t('fiche.earnPerVisit');
  const gallery = merchant.gallery ?? [];

  const tabs = useMemo(
    () => getFicheTabs({ hasDeals: false, photoCount: gallery.length }).filter((k): k is PreviewTab => k !== 'deals'),
    [gallery.length],
  );
  const [tab, setTab] = useState<PreviewTab>('overview');
  const activeTab = tabs.includes(tab) ? tab : 'overview';

  // Same pinned tab bar as the client page (translateY on the native driver).
  const { height: windowHeight } = useWindowDimensions();
  const [scrollY] = useState(() => new Animated.Value(0));
  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }),
    [scrollY],
  );
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
  const [tabsY, setTabsY] = useState<number | null>(null);
  const pinOffset = insets.top + HEADER_PAD_TOP + HEADER_BUTTON + HEADER_PAD_BOTTOM;
  const pinAt = tabsY == null ? null : Math.max(0, tabsY - pinOffset);
  const tabsMotion = useMemo(() => (pinAt == null ? undefined : {
    transform: [{
      translateY: scrollY.interpolate({ inputRange: [pinAt, pinAt + 1], outputRange: [0, 1], extrapolateLeft: 'clamp' }),
    }],
  }), [scrollY, pinAt]);
  // The solid bar and its title fade in once the hero scrolls away; the preview pill fades out.
  const { headerBarOpacity, pillOpacity } = useMemo(() => {
    const end = HERO_HEIGHT - insets.top - HEADER_BUTTON;
    const inputRange = [end - hp(50), end];
    return {
      headerBarOpacity: scrollY.interpolate({ inputRange, outputRange: [0, 1], extrapolate: 'clamp' }),
      pillOpacity: scrollY.interpolate({ inputRange, outputRange: [1, 0], extrapolate: 'clamp' }),
    };
  }, [scrollY, insets.top]);
  // Stretches the cover on pull-down (iOS bounce) so no gap opens above it.
  const coverMotion = useMemo(() => ({
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [-HERO_HEIGHT, 0],
          outputRange: [-HERO_HEIGHT / 2, 0],
          extrapolateRight: 'clamp',
        }),
      },
      { scale: scrollY.interpolate({ inputRange: [-HERO_HEIGHT, 0], outputRange: [2, 1], extrapolateRight: 'clamp' }) },
    ],
  }), [scrollY]);

  const onTabsLayout = useCallback((e: LayoutChangeEvent) => setTabsY(e.nativeEvent.layout.y), []);
  const recordOffset = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = e.nativeEvent.contentOffset.y;
  }, []);
  const selectTab = useCallback((next: PreviewTab) => {
    setTab(next);
    // Past the pin point, start the new tab at its top instead of somewhere in the middle.
    if (pinAt != null && offsetRef.current > pinAt) {
      scrollRef.current?.scrollTo({ y: pinAt, animated: false });
      offsetRef.current = pinAt;
    }
  }, [pinAt]);
  const openLoyaltyTab = useCallback(() => selectTab('loyalty'), [selectTab]);
  const openInfoTab = useCallback(() => selectTab('info'), [selectTab]);

  const headerButtonBg = theme.mode === 'dark' ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.94)';

  return (
    <View style={[s.root, { backgroundColor: pageBg }]}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        onScrollEndDrag={recordOffset}
        onMomentumScrollEnd={recordOffset}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_BAR_SPACE }}
      >
        {/* jitplus MerchantHero */}
        <View style={[s.cover, { backgroundColor: theme.bgInput }]}>
          {!!coverUrl && (
            <Animated.View style={[StyleSheet.absoluteFill, coverMotion]}>
              <ExpoImage
                source={resolveImageUrl(coverUrl)}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={coverUrl}
                transition={200}
              />
            </Animated.View>
          )}
          {/* Keeps the floating header buttons readable over a photo. */}
          {!!coverUrl && <LinearGradient pointerEvents="none" colors={TOP_SCRIM} style={s.topScrim} />}
        </View>

        <View style={s.identity}>
          <View style={[s.logoFrame, { alignSelf: dir.alignStart, backgroundColor: pageBg }]}>
            {merchant.logoUrl ? (
              <ExpoImage
                source={resolveImageUrl(merchant.logoUrl)}
                style={s.logo}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={merchant.logoUrl}
                accessibilityLabel={merchant.nom}
              />
            ) : (
              <View style={[s.logo, s.logoFallback, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                {ThemeIcon
                  ? <ThemeIcon size={ms(36)} color={theme.textSecondary} strokeWidth={1.75} />
                  : <Text style={s.emoji}>{getCategoryEmoji(merchant.categorie)}</Text>}
              </View>
            )}
          </View>
          <Text style={[s.name, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={2} accessibilityRole="header">
            {merchant.nom}
          </Text>
          {!!subtitle && (
            <Text style={[s.line, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1}>{subtitle}</Text>
          )}
          {!!merchant.tagline && (
            <Text style={[s.tagline, { color: theme.textSecondary, textAlign: dir.textAlign }]} numberOfLines={3}>
              {merchant.tagline}
            </Text>
          )}
          {/* Last, right above the directions/call buttons it goes with. */}
          {(openStatus || !!facts) && (
            <Text style={[s.line, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={2}>
              {openStatus && (
                <Text style={{ color: openStatus.isOpen ? theme.success : theme.danger, fontFamily: font.semibold }}>
                  {describeOpenStatus(openStatus, t, 'fiche')}
                </Text>
              )}
              {openStatus && !!facts ? ' · ' : ''}
              {facts}
            </Text>
          )}
        </View>

        {/* jitplus MerchantQuickActions */}
        {contacts.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.actionsRow, { flexDirection: dir.row }]}
            style={s.actions}
          >
            {contacts.map((contact) => {
              const { Icon, labelKey } = CONTACT_UI[contact.key];
              const label = t(labelKey);
              return (
                <Pressable
                  key={contact.key}
                  onPress={() => { hapticLight(); openContact(contact); }}
                  style={({ pressed }) => [
                    s.pill,
                    { flexDirection: dir.row, borderColor: theme.border, backgroundColor: pressed ? theme.bgInput : theme.bg },
                  ]}
                  accessibilityRole={contact.key === 'directions' ? 'button' : 'link'}
                  accessibilityLabel={label}
                >
                  <Icon size={ms(16)} color={theme.text} strokeWidth={2} />
                  <Text style={[s.pillLabel, { color: theme.text }]} numberOfLines={1}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Preview only: the page is not visible to customers yet. */}
        {!isPublic && (
          <View style={s.hiddenWrap}>
            <View style={[s.hidden, { backgroundColor: `${theme.warning}14`, borderColor: `${theme.warning}40` }]}>
              <View style={[s.hiddenHead, { flexDirection: dir.row }]}>
                <EyeOff size={ms(18)} color={theme.warning} strokeWidth={2} />
                <Text style={[s.hiddenTitle, { color: theme.text, textAlign: dir.textAlign }]}>{t('storePreview.previewHiddenTitle')}</Text>
              </View>
              <Text style={[s.hiddenBody, { color: theme.textSecondary, textAlign: dir.textAlign }]}>
                {t('storePreview.previewHiddenBody')}
              </Text>
              {onManageLocations && (
                <Pressable onPress={onManageLocations} style={[s.hiddenCta, { alignSelf: dir.alignStart, backgroundColor: theme.warning }]} accessibilityRole="button">
                  <Text style={s.hiddenCtaText}>{t('storePreview.previewHiddenCta')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        <Animated.View
          onLayout={onTabsLayout}
          style={[s.tabs, { backgroundColor: pageBg, borderBottomColor: theme.border }, tabsMotion]}
        >
          <FicheTabs tabs={tabs} active={activeTab} onChange={selectTab} />
        </Animated.View>

        {/* Tall enough for the tab bar to pin even when the active tab is short. */}
        <View style={[s.sections, { minHeight: windowHeight - pinOffset - TAB_BAR_HEIGHT }]}>
          {activeTab === 'overview' && (
            <>
              <FicheLoyaltySummary rewards={rewards} earnLine={earnLine} wheelEndsAt={wheel?.endsAt} onOpen={openLoyaltyTab} />
              <FicheInfoSummary
                hours={merchant.openingHours}
                status={openStatus}
                store={activeStores[0]}
                merchantName={merchant.nom}
                onOpen={openInfoTab}
              />
            </>
          )}
          {activeTab === 'loyalty' && (
            <>
              <FicheLoyalty rewards={rewards} earnLine={earnLine} validityDays={merchant.stampValidityDays} />
              {wheel && <FicheLuckyWheel wheel={wheel} />}
            </>
          )}
          {activeTab === 'info' && (
            <>
              {/* Same order as the overview: where, when, then who. */}
              <FicheLocations stores={activeStores} merchantName={merchant.nom} />
              {hasOpeningHours(merchant.openingHours) && <FicheHours hours={merchant.openingHours} />}
              <FicheAbout description={merchant.description?.trim() ?? ''} badges={badges} profiles={profiles} />
            </>
          )}
          {activeTab === 'photos' && <FicheGallery images={gallery} />}

          {/* Preview only. */}
          <Text style={[s.footer, { color: theme.textMuted }]}>{t('storePreview.previewFooter')}</Text>
        </View>
      </Animated.ScrollView>

      {/* jitplus MerchantStickyHeader; share and "more" are shown but inert. */}
      <View style={[s.header, { paddingTop: insets.top + HEADER_PAD_TOP }]} pointerEvents="box-none">
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, s.headerBar, { backgroundColor: theme.bgCard, borderBottomColor: theme.border, opacity: headerBarOpacity }]}
        />
        <View style={[s.headerRow, { flexDirection: dir.row }]} pointerEvents="box-none">
          <Pressable
            onPress={() => { hapticLight(); onClose(); }}
            style={({ pressed }) => [s.headerBtn, { backgroundColor: headerButtonBg, opacity: pressed ? 0.75 : 1 }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ArrowLeft size={ms(19)} color={theme.text} strokeWidth={2.2} style={dir.flip} />
          </Pressable>
          <View style={s.headerCenter} pointerEvents="none">
            <Animated.Text style={[s.headerTitle, { color: theme.text, opacity: headerBarOpacity }]} numberOfLines={1}>
              {merchant.nom}
            </Animated.Text>
            <Animated.View style={[s.previewPill, { opacity: pillOpacity }]}>
              <Text style={s.previewPillText} numberOfLines={1}>{t('storePreview.previewBadge')}</Text>
            </Animated.View>
          </View>
          {[Share2, MoreHorizontal].map((Icon, i) => (
            <View key={i} style={[s.headerBtn, { backgroundColor: headerButtonBg }]} accessible={false} importantForAccessibility="no-hide-descendants">
              <Icon size={ms(19)} color={theme.text} strokeWidth={2.2} />
            </View>
          ))}
        </View>
      </View>

      {/* jitplus MerchantBottomBar, visitor state; the button is inert here. */}
      <View style={[s.bar, { backgroundColor: theme.bg, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, hp(10)) }]}>
        <View style={[s.cta, { flexDirection: dir.row }]} accessibilityLabel={t('fiche.getLoyaltyCard')}>
          <Wallet size={ms(18)} color="#fff" strokeWidth={2} />
          <Text style={s.ctaText} numberOfLines={1}>{t('fiche.getLoyaltyCard')}</Text>
        </View>
      </View>
    </View>
  );
}

export default function FichePreviewModal({ visible, ...props }: Props) {
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={props.onClose} statusBarTranslucent>
      <FichePreview {...props} />
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  cover: { height: HERO_HEIGHT, overflow: 'hidden' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: hp(100) },

  identity: { paddingHorizontal: wp(16) },
  logoFrame: { marginTop: -LOGO_SIZE / 2, padding: LOGO_BORDER, borderRadius: ms(18) + LOGO_BORDER },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: ms(18) },
  logoFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  emoji: { fontSize: ms(34) },
  name: { fontSize: ms(22), lineHeight: ms(28), fontFamily: font.semibold, letterSpacing: -0.4, marginTop: hp(10) },
  line: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular, marginTop: hp(3) },
  tagline: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular, marginTop: hp(6) },

  actions: { marginTop: hp(16), flexGrow: 0 },
  actionsRow: { gap: wp(8), paddingHorizontal: wp(16) },
  pill: { alignItems: 'center', gap: wp(6), height: ms(38), paddingHorizontal: wp(14), borderRadius: 999, borderWidth: 1 },
  pillLabel: { fontSize: ms(14), fontFamily: font.semibold },

  tabs: {
    marginTop: hp(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
    // Above the cards' Android elevation once pinned over them.
    ...Platform.select({ android: { elevation: 2 } }),
  },
  sections: { paddingHorizontal: wp(16) },
  hiddenWrap: { paddingHorizontal: wp(16), marginTop: hp(18) },
  hidden: { borderRadius: ms(18), borderWidth: 1, padding: wp(14), gap: hp(8) },
  hiddenHead: { alignItems: 'center', gap: wp(8) },
  hiddenTitle: { flex: 1, fontSize: ms(14), fontFamily: font.semibold },
  hiddenBody: { fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular },
  hiddenCta: { paddingHorizontal: wp(14), paddingVertical: hp(8), borderRadius: 999, marginTop: hp(2) },
  hiddenCtaText: { color: '#fff', fontSize: ms(13), fontFamily: font.semibold },
  footer: { fontSize: ms(11), lineHeight: ms(16), fontFamily: font.regular, textAlign: 'center', paddingVertical: hp(18) },

  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: HEADER_PAD_BOTTOM },
  headerBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  headerRow: { alignItems: 'center', gap: wp(10), paddingHorizontal: wp(16) },
  headerBtn: {
    width: HEADER_BUTTON, height: HEADER_BUTTON, borderRadius: HEADER_BUTTON / 2,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  headerCenter: { flex: 1, height: HEADER_BUTTON, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { alignSelf: 'stretch', fontSize: ms(16), fontFamily: font.semibold, textAlign: 'center' },
  previewPill: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: wp(12), paddingVertical: hp(6), borderRadius: 999 },
  previewPillText: { color: '#fff', fontSize: ms(12), fontFamily: font.semibold },

  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: wp(16), paddingTop: hp(10), borderTopWidth: StyleSheet.hairlineWidth,
  },
  cta: {
    alignItems: 'center', justifyContent: 'center', gap: wp(8),
    height: ms(48), paddingHorizontal: wp(16), borderRadius: ms(12), backgroundColor: palette.violet,
  },
  ctaText: { color: '#fff', fontSize: ms(15), fontFamily: font.semibold, flexShrink: 1, textAlign: 'center' },
});
