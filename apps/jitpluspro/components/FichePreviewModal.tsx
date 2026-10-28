/**
 * Full-screen preview of the public merchant page, as the jitplus app shows
 * it to a customer who has no card yet (apps/jitplus/app/merchant/[id].tsx).
 * Same tabs, rules (@jitplus/shared merchantFiche) and wording (`fiche.*`).
 * Contact buttons and links really open, so the merchant can check them.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, Pressable, StatusBar, Platform, Animated, useWindowDimensions,
  type ScrollView, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Navigation, Phone, MessageCircle, Globe, Mail, Wallet, EyeOff, type LucideIcon,
} from 'lucide-react-native';
import {
  getCategoryEmoji, getFicheContacts, getFicheRewards, getFicheTabs, getKnownBadges, getOpenStatus, getSocialProfiles,
  describeOpenStatus, hasOpeningHours, type FicheContact,
} from '@jitplus/shared';
import { openDirections, openFirst } from '@jitplus/shared/src/openLinks';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useLuckyWheelCampaigns, useRewards } from '@/hooks/useQueryHooks';
import { font } from '@/constants/design';
import { getCategoryLabel } from '@/constants/categories';
import { hapticLight } from '@/utils/haptics';
import { resolveImageUrl } from '@/utils/imageUrl';
import { MERCHANT_ICON_MAP } from '@/utils/merchantIcons';
import { wp, hp, ms } from '@/utils/responsive';
import { brandColor } from '@/components/stores/brand';
import type { Merchant, Store } from '@/types';
import {
  FicheAbout, FicheGallery, FicheHours, FicheInfoSummary, FicheLocations, FicheLoyalty, FicheLoyaltySummary,
  FicheLuckyWheel, FicheTabs, TAB_BAR_HEIGHT, type FicheWheel, type PreviewTab,
} from '@/components/fichePreview/FicheSections';

const HERO_HEIGHT = hp(190);
const LOGO_SIZE = ms(84);
const HEADER_BUTTON = ms(40);
const HEADER_PAD_TOP = hp(6);
const HEADER_PAD_BOTTOM = hp(8);
const TOP_SCRIM = ['rgba(0,0,0,0.38)', 'rgba(0,0,0,0)'] as const;
const DIAG_START = { x: 0, y: 0 } as const;
const DIAG_END = { x: 1, y: 1 } as const;
const BOTTOM_BAR_SPACE = hp(96);
/** jitplus light page background (palette.gray50). */
const LIGHT_PAGE_BG = '#F8FAFC';

const CONTACT_UI: Record<FicheContact['key'], { Icon: LucideIcon; labelKey: string }> = {
  directions: { Icon: Navigation, labelKey: 'fiche.directions' },
  call: { Icon: Phone, labelKey: 'fiche.call' },
  whatsapp: { Icon: MessageCircle, labelKey: 'fiche.whatsapp' },
  website: { Icon: Globe, labelKey: 'fiche.website' },
  email: { Icon: Mail, labelKey: 'fiche.email' },
};

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
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const { isPremium } = usePlanStatus(merchant);
  const { data: rewardsData } = useRewards(true);
  const { data: campaigns } = useLuckyWheelCampaigns(isPremium);

  const accent = brandColor(merchant.themeColor);
  const pageBg = theme.mode === 'dark' ? theme.bg : LIGHT_PAGE_BG;
  const ThemeIcon = merchant.themeIcon ? MERCHANT_ICON_MAP[merchant.themeIcon] : undefined;

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
  const rewards = useMemo(
    () => getFicheRewards(rewardsData, merchant.stampsForReward, t('fiche.defaultReward')),
    [rewardsData, merchant.stampsForReward, t],
  );

  const wheel = useMemo<FicheWheel | null>(() => {
    const now = Date.now();
    const active = campaigns?.find((c) => c.status === 'ACTIVE'
      && new Date(c.startsAt).getTime() <= now && new Date(c.endsAt).getTime() >= now);
    if (!active) return null;
    return {
      ...active,
      prizes: active.prizes.filter((p) => p.remaining > 0).sort((a, b) => b.weight - a.weight),
    };
  }, [campaigns]);

  const subtitle = useMemo(() => {
    const categories = [merchant.categorie, ...(merchant.secondaryCategories ?? [])]
      .filter(Boolean)
      .map((c) => getCategoryLabel(c))
      .join(' · ');
    return [categories, merchant.ville].filter(Boolean).join('  •  ');
  }, [merchant.categorie, merchant.secondaryCategories, merchant.ville]);

  const earnLine = merchant.stampEarningMode === 'PER_AMOUNT' && merchant.amountPerStamp
    ? t('fiche.earnPerAmount', { amount: merchant.amountPerStamp })
    : t('fiche.earnPerVisit');
  const statusColor = openStatus?.isOpen ? theme.success : theme.danger;
  const tagline = merchant.tagline?.trim();
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
  const headerBarOpacity = useMemo(() => {
    const end = HERO_HEIGHT - pinOffset;
    return scrollY.interpolate({ inputRange: [end - hp(50), end], outputRange: [0, 1], extrapolate: 'clamp' });
  }, [scrollY, pinOffset]);

  const onTabsLayout = useCallback((e: LayoutChangeEvent) => setTabsY(e.nativeEvent.layout.y), []);
  const recordOffset = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = e.nativeEvent.contentOffset.y;
  }, []);
  const selectTab = useCallback((next: PreviewTab) => {
    setTab(next);
    if (pinAt != null && offsetRef.current > pinAt) {
      scrollRef.current?.scrollTo({ y: pinAt, animated: false });
      offsetRef.current = pinAt;
    }
  }, [pinAt]);
  const openLoyaltyTab = useCallback(() => selectTab('loyalty'), [selectTab]);
  const openInfoTab = useCallback(() => selectTab('info'), [selectTab]);

  return (
    <View style={[s.root, { backgroundColor: pageBg }]}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        onScrollEndDrag={recordOffset}
        onMomentumScrollEnd={recordOffset}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_BAR_SPACE }}
      >
        <View style={s.cover}>
          {merchant.coverUrl ? (
            <ExpoImage source={resolveImageUrl(merchant.coverUrl)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <LinearGradient colors={[accent, `${accent}B3`, `${accent}59`]} start={DIAG_START} end={DIAG_END} style={StyleSheet.absoluteFill}>
              <View style={[s.orb, s.orbA]} />
              <View style={[s.orb, s.orbB]} />
            </LinearGradient>
          )}
          <LinearGradient pointerEvents="none" colors={TOP_SCRIM} style={s.topScrim} />
          <LinearGradient pointerEvents="none" colors={[`${pageBg}00`, pageBg]} style={s.bottomFade} />
        </View>

        <View style={s.identity}>
          <View style={[s.logoFrame, { backgroundColor: pageBg }]}>
            {merchant.logoUrl ? (
              <ExpoImage source={resolveImageUrl(merchant.logoUrl)} style={s.logo} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={[s.logo, s.logoFallback, { backgroundColor: theme.bgCard, borderColor: `${accent}30` }]}>
                {ThemeIcon
                  ? <ThemeIcon size={ms(38)} color={accent} strokeWidth={1.75} />
                  : <Text style={s.emoji}>{getCategoryEmoji(merchant.categorie)}</Text>}
              </View>
            )}
          </View>
          <Text style={[s.name, { color: theme.text }]} numberOfLines={2} accessibilityRole="header">{merchant.nom}</Text>
          {!!subtitle && <Text style={[s.subtitle, { color: theme.textMuted }]} numberOfLines={1}>{subtitle}</Text>}
          {!!tagline && <Text style={[s.tagline, { color: theme.textSecondary }]} numberOfLines={2}>{tagline}</Text>}
          {openStatus && (
            <View style={[s.meta, { flexDirection: dir.row }]}>
              <View style={[s.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[s.metaText, { color: statusColor }]} numberOfLines={1}>{describeOpenStatus(openStatus, t, 'fiche')}</Text>
            </View>
          )}
        </View>

        {contacts.length > 0 && (
          <View style={[s.actions, { flexDirection: dir.row }]}>
            {contacts.map((contact) => {
              const { Icon, labelKey } = CONTACT_UI[contact.key];
              const label = t(labelKey);
              return (
                <Pressable
                  key={contact.key}
                  onPress={() => { hapticLight(); openContact(contact); }}
                  style={({ pressed }) => [s.action, { opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole={contact.key === 'directions' ? 'button' : 'link'}
                  accessibilityLabel={label}
                >
                  <View style={[s.actionIcon, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                    <Icon size={ms(20)} color={accent} strokeWidth={2} />
                  </View>
                  <Text style={[s.actionLabel, { color: theme.textSecondary }]} numberOfLines={1}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

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
          <FicheTabs tabs={tabs} active={activeTab} accent={accent} onChange={selectTab} />
        </Animated.View>

        <View style={[s.sections, { minHeight: windowHeight - pinOffset - TAB_BAR_HEIGHT }]}>
          {activeTab === 'overview' && (
            <>
              <FicheLoyaltySummary
                accent={accent}
                rewards={rewards}
                earnLine={earnLine}
                wheelEndsAt={wheel?.endsAt}
                onOpen={openLoyaltyTab}
              />
              <FicheInfoSummary
                hours={merchant.openingHours}
                status={openStatus}
                store={activeStores[0]}
                merchantName={merchant.nom}
                accent={accent}
                onOpen={openInfoTab}
              />
            </>
          )}
          {activeTab === 'loyalty' && (
            <>
              <FicheLoyalty accent={accent} rewards={rewards} earnLine={earnLine} validityDays={merchant.stampValidityDays} />
              {wheel && <FicheLuckyWheel wheel={wheel} />}
            </>
          )}
          {activeTab === 'info' && (
            <>
              {hasOpeningHours(merchant.openingHours) && (
                <FicheHours hours={merchant.openingHours} status={openStatus} accent={accent} />
              )}
              <FicheLocations stores={activeStores} merchantName={merchant.nom} accent={accent} />
              <FicheAbout
                accent={accent}
                description={merchant.description?.trim() ?? ''}
                badges={getKnownBadges(merchant.badges)}
                profiles={profiles}
              />
            </>
          )}
          {activeTab === 'photos' && <FicheGallery images={gallery} accent={accent} />}

          <Text style={[s.footer, { color: theme.textMuted }]}>{t('storePreview.previewFooter')}</Text>
        </View>
      </Animated.ScrollView>

      <View style={[s.header, { paddingTop: insets.top + HEADER_PAD_TOP }]} pointerEvents="box-none">
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, s.headerBar, { backgroundColor: theme.bgCard, borderBottomColor: theme.border, opacity: headerBarOpacity }]}
        />
        <View style={[s.headerRow, { flexDirection: dir.row }]} pointerEvents="box-none">
        <Pressable onPress={onClose} style={s.headerBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={ms(20)} color={palette.gray900} strokeWidth={2} style={dir.flip} />
        </Pressable>
        <View style={s.previewPill}>
          <Text style={s.previewPillText} numberOfLines={1}>{t('storePreview.previewBadge')}</Text>
        </View>
        <View style={s.headerSpacer} />
        </View>
      </View>

      <View style={[s.bar, { backgroundColor: theme.bgCard, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, hp(12)) }]}>
        <View style={[s.cta, { flexDirection: dir.row }]} accessibilityLabel={t('fiche.getLoyaltyCard')}>
          <Wallet size={ms(18)} color="#fff" strokeWidth={2} />
          <View>
            <Text style={s.ctaText} numberOfLines={1}>{t('fiche.getLoyaltyCard')}</Text>
            <Text style={s.ctaCaption} numberOfLines={1}>{t('fiche.joinFree')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function FichePreviewModal({ visible, ...props }: Props) {
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={props.onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <FichePreview {...props} />
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  cover: { height: HERO_HEIGHT, overflow: 'hidden' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: hp(120) },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: hp(90) },
  orb: { position: 'absolute', borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.10)' },
  orbA: { width: HERO_HEIGHT * 1.2, height: HERO_HEIGHT * 1.2, top: -HERO_HEIGHT * 0.5, right: -HERO_HEIGHT * 0.4 },
  orbB: { width: HERO_HEIGHT * 0.7, height: HERO_HEIGHT * 0.7, bottom: -HERO_HEIGHT * 0.3, left: -HERO_HEIGHT * 0.2 },

  identity: { alignItems: 'center', paddingHorizontal: wp(20) },
  logoFrame: {
    marginTop: -LOGO_SIZE / 2 - 4,
    padding: 4,
    borderRadius: ms(26),
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 18 },
      android: { elevation: 8 },
    }),
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: ms(22) },
  logoFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  emoji: { fontSize: ms(36) },
  name: { fontSize: ms(23), fontFamily: font.bold, letterSpacing: -0.5, textAlign: 'center', marginTop: hp(10) },
  subtitle: { fontSize: ms(13), fontFamily: font.medium, textAlign: 'center', marginTop: hp(4) },
  tagline: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular, textAlign: 'center', marginTop: hp(6), maxWidth: '92%' },
  meta: { alignItems: 'center', gap: wp(5), marginTop: hp(10) },
  statusDot: { width: ms(7), height: ms(7), borderRadius: ms(4) },
  metaText: { fontSize: ms(13), fontFamily: font.semibold },

  actions: { justifyContent: 'center', gap: wp(8), paddingHorizontal: wp(16), marginTop: hp(18) },
  action: { flex: 1, maxWidth: wp(88), alignItems: 'center', gap: hp(6) },
  actionIcon: {
    width: ms(52), height: ms(52), borderRadius: ms(18), borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: ms(12), fontFamily: font.medium },

  tabs: {
    marginTop: hp(16),
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
    // Above the cards' Android elevation once pinned over them.
    ...Platform.select({ android: { elevation: 2 } }),
  },
  sections: { paddingHorizontal: wp(16), paddingTop: hp(16), gap: hp(14) },
  hiddenWrap: { paddingHorizontal: wp(16), marginTop: hp(18) },
  hidden: { borderRadius: ms(18), borderWidth: 1, padding: wp(14), gap: hp(8) },
  hiddenHead: { alignItems: 'center', gap: wp(8) },
  hiddenTitle: { flex: 1, fontSize: ms(14), fontFamily: font.bold },
  hiddenBody: { fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular },
  hiddenCta: { paddingHorizontal: wp(14), paddingVertical: hp(8), borderRadius: 999, marginTop: hp(2) },
  hiddenCtaText: { color: '#fff', fontSize: ms(13), fontFamily: font.semibold },
  footer: { fontSize: ms(11), lineHeight: ms(16), fontFamily: font.regular, textAlign: 'center', paddingHorizontal: wp(16), marginTop: hp(6) },

  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: HEADER_PAD_BOTTOM },
  headerBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  headerRow: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: wp(16) },
  headerBtn: {
    width: HEADER_BUTTON, height: HEADER_BUTTON, borderRadius: HEADER_BUTTON / 2, backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerSpacer: { width: HEADER_BUTTON },
  previewPill: { backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: wp(12), paddingVertical: hp(6), borderRadius: 999 },
  previewPillText: { color: '#fff', fontSize: ms(12), fontFamily: font.semibold },

  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: wp(16), paddingTop: hp(12), borderTopWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  cta: {
    alignItems: 'center', justifyContent: 'center', gap: wp(10),
    minHeight: ms(52), paddingHorizontal: wp(16), borderRadius: ms(16), backgroundColor: palette.violet,
  },
  ctaText: { color: '#fff', fontSize: ms(15), fontFamily: font.bold, textAlign: 'center' },
  ctaCaption: { color: 'rgba(255,255,255,0.78)', fontSize: ms(11), fontFamily: font.medium, textAlign: 'center', marginTop: 1 },
});
