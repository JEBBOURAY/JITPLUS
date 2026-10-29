/**
 * Sections of the public merchant page, rebuilt for the JitPlus Pro preview.
 *
 * Mirrors apps/jitplus/components/merchant/* as a visitor without a card sees
 * them: same tabs, same rules (@jitplus/shared merchantFiche) and same
 * wording (`fiche.*`, shared with jitplus). Keep both sides in step when the
 * public page changes. Links open for real so the merchant can test them.
 */
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  View, Text, Pressable, ScrollView, Modal, FlatList, StyleSheet, Platform, LayoutAnimation,
  useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent, type StyleProp, type TextStyle,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Clock,
  ChevronDown,
  ChevronRight,
  Info,
  Images,
  Navigation,
  Phone,
  Trophy,
  ShoppingBag,
  X as XIcon,
  Instagram,
  Music2,
  Facebook,
  Youtube,
  Ghost,
  Wifi,
  ParkingSquare,
  TreePine,
  Snowflake,
  CreditCard,
  Truck,
  Utensils,
  Leaf,
  Accessibility,
  Dog,
  Baby,
  CalendarCheck,
  type LucideIcon,
} from 'lucide-react-native';
import {
  JitGift,
  JitPin,
  JitStamp,
  JitTicket,
} from '@/components/icons';
import {
  WEEK_DAYS, describeOpenStatus, describeWheelEnd, formatDaySlots, hasCoords, linkifyText, pluralKey, toTel, weekDayOf,
  type FicheReward, type FicheTab, type MerchantBadge, type OpenStatus, type OpeningHours, type SocialNetwork, type SocialProfile,
} from '@jitplus/shared';
import { openDirections, openFirst } from '@jitplus/shared/src/openLinks';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font } from '@/constants/design';
import { hapticLight } from '@/utils/haptics';
import { resolveImageUrl } from '@/utils/imageUrl';
import { wp, hp, ms } from '@/utils/responsive';

const REWARDS_PREVIEW = 3;
const COLLAPSED_LINES = 4;
/** Rough length past which the description no longer fits in the collapsed lines. */
const COLLAPSIBLE_LENGTH = 180;
const GRID_COLUMNS = 3;
const GRID_GAP = wp(8);
/** Page side padding plus card padding, on both sides. */
const GRID_INSET = wp(16) * 4;
const MAX_PRIZES = 6;
export const TAB_BAR_HEIGHT = ms(48);
/** jitplus `brandGradientFull`: the wheel card keeps the client colors. */
const WHEEL_GRADIENT = ['#5B21B6', '#7C3AED', '#F59E0B'] as const;
const DIAG_START = { x: 0, y: 0 } as const;
const DIAG_END = { x: 1, y: 1 } as const;

function animateNext() {
  hapticLight();
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

// ── Shell ───────────────────────────────────────────────────────────────────

function FicheSection({ title, Icon, accent, right, action, children }: {
  title: string;
  Icon: LucideIcon;
  accent: string;
  right?: ReactNode;
  /** Link at the end of the title row, e.g. "Voir tout" toward a tab. */
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <View style={[s.header, { flexDirection: dir.row }]}>
        <View style={[s.headerIcon, { backgroundColor: `${accent}14` }]}>
          <Icon size={ms(16)} color={accent} strokeWidth={2} />
        </View>
        <Text style={[s.title, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {right}
        {action && (
          <Pressable onPress={() => { hapticLight(); action.onPress(); }} hitSlop={10} accessibilityRole="button">
            <Text style={[s.action, { color: accent }]}>{action.label}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function ToggleRow({ label, expanded, accent, onPress }: { label: string; expanded: boolean; accent: string; onPress: () => void }) {
  const dir = useDir();
  return (
    <Pressable onPress={onPress} style={[s.toggle, { flexDirection: dir.row }]} accessibilityRole="button" hitSlop={6}>
      <Text style={[s.toggleText, { color: accent }]}>{label}</Text>
      <ChevronDown size={ms(16)} color={accent} strokeWidth={2.2} style={expanded ? s.chevronUp : undefined} />
    </Pressable>
  );
}

function Count({ value }: { value: number }) {
  const theme = useTheme();
  return <Text style={[s.count, { color: theme.textMuted }]}>{value}</Text>;
}

function RewardThumb({ imageUrl, accent }: { imageUrl?: string | null; accent: string }) {
  return (
    <View style={[s.rewardThumb, { backgroundColor: `${accent}12` }]}>
      {imageUrl ? (
        <ExpoImage source={resolveImageUrl(imageUrl)} style={s.fill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={imageUrl} />
      ) : (
        <JitGift size={ms(20)} color={accent} strokeWidth={1.8} />
      )}
    </View>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────

/** The preview never shows deals: only signed-in customers fetch them. */
export type PreviewTab = Exclude<FicheTab, 'deals'>;

const TAB_LABEL_KEYS: Record<PreviewTab, string> = {
  overview: 'fiche.tabOverview',
  loyalty: 'fiche.tabLoyalty',
  info: 'fiche.tabInfo',
  photos: 'fiche.tabPhotos',
};

export const FicheTabs = memo(function FicheTabs({ tabs, active, accent, onChange }: {
  tabs: PreviewTab[];
  active: PreviewTab;
  accent: string;
  onChange: (tab: PreviewTab) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[s.tabsContent, { flexDirection: dir.row }]}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => {
        const selected = tab === active;
        return (
          <Pressable
            key={tab}
            onPress={() => { if (!selected) { hapticLight(); onChange(tab); } }}
            style={s.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text
              style={[s.tabLabel, { color: selected ? accent : theme.textMuted, fontFamily: selected ? font.bold : font.semibold }]}
              numberOfLines={1}
            >
              {t(TAB_LABEL_KEYS[tab])}
            </Text>
            <View style={[s.tabIndicator, selected && { backgroundColor: accent }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

// ── Overview ────────────────────────────────────────────────────────────────

export const FicheLoyaltySummary = memo(function FicheLoyaltySummary({ accent, rewards, earnLine, wheelEndsAt, onOpen }: {
  accent: string;
  rewards: FicheReward[];
  earnLine: string;
  wheelEndsAt?: string | null;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const first = rewards[0];
  return (
    <FicheSection title={t('fiche.loyaltyProgram')} Icon={JitStamp} accent={accent} action={{ label: t('fiche.seeAll'), onPress: onOpen }}>
      <View style={[s.first, { flexDirection: dir.row, backgroundColor: `${accent}0D`, borderColor: `${accent}26` }]}>
        <RewardThumb imageUrl={first.imageUrl} accent={accent} />
        <View style={s.flex}>
          <Text style={[s.overline, { color: theme.textMuted, textAlign: dir.textAlign }]}>{t('fiche.firstReward')}</Text>
          <Text style={[s.firstTitle, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={2}>{first.titre}</Text>
          <Text style={[s.firstMeta, { color: theme.textSecondary, textAlign: dir.textAlign }]} numberOfLines={2}>
            {`${t(pluralKey('fiche.stampsCost', first.cout), { count: first.cout })} · ${earnLine}`}
          </Text>
        </View>
      </View>
      {!!wheelEndsAt && (
        <Pressable
          onPress={() => { hapticLight(); onOpen(); }}
          style={({ pressed }) => [s.wheelRow, { flexDirection: dir.row, backgroundColor: `${palette.violet}12`, opacity: pressed ? 0.8 : 1 }]}
          accessibilityRole="button"
        >
          <JitTicket size={ms(18)} color={palette.violet} strokeWidth={2} />
          <Text style={[s.wheelRowText, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1}>
            {`${t('fiche.luckyWheelLabel')} · ${describeWheelEnd(wheelEndsAt, t, 'fiche')}`}
          </Text>
          <ChevronRight size={ms(16)} color={theme.textMuted} strokeWidth={2.2} style={dir.flip} />
        </Pressable>
      )}
    </FicheSection>
  );
});

export const FicheInfoSummary = memo(function FicheInfoSummary({ hours, status, store, merchantName, accent, onOpen }: {
  hours: OpeningHours | null | undefined;
  status: OpenStatus | null;
  /** First active store. */
  store: FicheStore | undefined;
  merchantName: string;
  accent: string;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  if (!status && !store) return null;

  const todaySlots = hours ? formatDaySlots(hours[weekDayOf(new Date())]) : null;
  const statusText = status ? describeOpenStatus(status, t, 'fiche') : '';
  const storeName = store?.nom || merchantName;
  const address = store ? store.adresse || [store.quartier, store.ville].filter(Boolean).join(', ') || storeName : '';
  const target = store && hasCoords(store) ? store : null;

  return (
    <FicheSection title={t('fiche.tabInfo')} Icon={Info} accent={accent} action={{ label: t('fiche.seeAll'), onPress: onOpen }}>
      {status && (
        <Pressable
          onPress={() => { hapticLight(); onOpen(); }}
          style={({ pressed }) => [s.infoRow, { flexDirection: dir.row }, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${t('fiche.hoursTitle')} · ${statusText}`}
        >
          <View style={[s.infoIcon, { backgroundColor: `${accent}14` }]}>
            <Clock size={ms(17)} color={accent} strokeWidth={2} />
          </View>
          <View style={s.flex}>
            <Text style={[s.infoTitle, { color: status.isOpen ? theme.success : theme.danger, textAlign: dir.textAlign }]} numberOfLines={2}>
              {statusText}
            </Text>
            <Text style={[s.infoSubtitle, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1}>
              {`${t('fiche.today')} · ${todaySlots ?? t('fiche.dayClosed')}`}
            </Text>
          </View>
          <ChevronRight size={ms(16)} color={theme.textMuted} strokeWidth={2.2} style={dir.flip} />
        </Pressable>
      )}
      {store && (
        <Pressable
          onPress={target ? () => { hapticLight(); void openDirections(target.latitude, target.longitude, storeName); } : undefined}
          disabled={!target}
          style={({ pressed }) => [
            s.infoRow,
            { flexDirection: dir.row },
            status && [s.infoSeparator, { borderTopColor: theme.border }],
            pressed && s.pressed,
          ]}
          accessibilityRole={target ? 'button' : undefined}
          accessibilityLabel={target ? `${t('fiche.directions')} ${storeName}` : address}
        >
          <View style={[s.infoIcon, { backgroundColor: `${accent}14` }]}>
            <JitPin size={ms(17)} color={accent} strokeWidth={2} />
          </View>
          <Text style={[s.flex, s.infoTitle, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={2}>{address}</Text>
          {target && <Navigation size={ms(17)} color={accent} strokeWidth={2} />}
        </Pressable>
      )}
    </FicheSection>
  );
});

// ── Loyalty ─────────────────────────────────────────────────────────────────

export const FicheLoyalty = memo(function FicheLoyalty({ accent, rewards, earnLine, validityDays }: {
  accent: string;
  rewards: FicheReward[];
  earnLine: string;
  validityDays?: number | null;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rewards : rewards.slice(0, REWARDS_PREVIEW);
  const toggle = useCallback(() => { animateNext(); setShowAll((v) => !v); }, []);

  return (
    <FicheSection title={t('fiche.loyaltyProgram')} Icon={JitStamp} accent={accent}>
      <View style={s.steps}>
        {[t('fiche.howStep1'), earnLine, t('fiche.howStep3')].map((label, i) => (
          <View key={i} style={[s.step, { flexDirection: dir.row }]}>
            <View style={[s.stepNumber, { backgroundColor: `${accent}14` }]}>
              <Text style={[s.stepNumberText, { color: accent }]}>{i + 1}</Text>
            </View>
            <Text style={[s.stepText, { color: theme.text, textAlign: dir.textAlign }]}>{label}</Text>
          </View>
        ))}
      </View>

      {!!validityDays && (
        <View style={[s.infoLine, { flexDirection: dir.row }]}>
          <Clock size={ms(14)} color={theme.textMuted} strokeWidth={2} />
          <Text style={[s.infoText, { color: theme.textMuted, textAlign: dir.textAlign }]}>
            {t('fiche.stampsValidity', { days: validityDays })}
          </Text>
        </View>
      )}

      <View style={[s.divider, { backgroundColor: theme.border }]} />

      <Text style={[s.subheading, { color: theme.text, textAlign: dir.textAlign }]}>{t('fiche.rewardsSection')}</Text>
      <View style={s.rewards}>
        {visible.map((reward) => (
          <View key={reward.id} style={[s.reward, { flexDirection: dir.row, borderColor: theme.border }]}>
            <RewardThumb imageUrl={reward.imageUrl} accent={accent} />
            <View style={s.flex}>
              <Text style={[s.rewardTitle, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={2}>{reward.titre}</Text>
              {!!reward.description && (
                <Text style={[s.rewardDesc, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1}>
                  {reward.description}
                </Text>
              )}
            </View>
            <View style={[s.rewardBadge, { backgroundColor: `${accent}14` }]}>
              <Text style={[s.rewardBadgeText, { color: accent }]} numberOfLines={1}>
                {t(pluralKey('fiche.stampsCost', reward.cout), { count: reward.cout })}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {rewards.length > REWARDS_PREVIEW && (
        <ToggleRow
          label={showAll ? t('fiche.showLess') : t('fiche.seeAllRewards', { count: rewards.length })}
          expanded={showAll}
          accent={accent}
          onPress={toggle}
        />
      )}
    </FicheSection>
  );
});

// ── Lucky wheel ─────────────────────────────────────────────────────────────

export interface FicheWheel {
  name: string;
  description?: string | null;
  endsAt: string;
  minSpendAmount: number;
  globalWinRate: number;
  prizes: { id: string; label: string }[];
}

export const FicheLuckyWheel = memo(function FicheLuckyWheel({ wheel }: { wheel: FicheWheel }) {
  const { t } = useLanguage();
  const dir = useDir();
  const endsLabel = describeWheelEnd(wheel.endsAt, t, 'fiche');
  const chips: { key: string; Icon: LucideIcon; label: string }[] = [
    ...(wheel.globalWinRate > 0
      ? [{ key: 'rate', Icon: Trophy, label: t('fiche.luckyWheelWinRate', { rate: Math.round(wheel.globalWinRate * 100) }) }]
      : []),
    ...(wheel.minSpendAmount > 0
      ? [{ key: 'min', Icon: ShoppingBag, label: t('fiche.luckyWheelMinSpend', { amount: wheel.minSpendAmount }) }]
      : []),
    { key: 'ends', Icon: Clock, label: endsLabel },
  ];
  const prizes = wheel.prizes.slice(0, MAX_PRIZES);

  return (
    <LinearGradient colors={WHEEL_GRADIENT} start={DIAG_START} end={DIAG_END} style={s.wheel}>
      <View pointerEvents="none" style={[s.wheelWatermark, dir.isRTL ? s.wheelWatermarkRtl : s.wheelWatermarkLtr]}>
        <JitTicket size={ms(130)} color="rgba(255,255,255,0.10)" strokeWidth={1.2} />
      </View>
      <View style={[s.wheelHeader, { flexDirection: dir.row }]}>
        <View style={s.wheelIcon}>
          <JitTicket size={ms(18)} color="#fff" strokeWidth={2} />
        </View>
        <View style={s.flex}>
          <Text style={[s.wheelOverline, { textAlign: dir.textAlign }]}>{t('fiche.luckyWheelLabel')}</Text>
          <Text style={[s.wheelName, { textAlign: dir.textAlign }]} numberOfLines={2}>{wheel.name}</Text>
        </View>
      </View>
      {!!wheel.description && (
        <Text style={[s.wheelDescription, { textAlign: dir.textAlign }]} numberOfLines={3}>{wheel.description}</Text>
      )}
      <View style={[s.wheelChips, { flexDirection: dir.row }]}>
        {chips.map(({ key, Icon, label }) => (
          <View key={key} style={[s.wheelChip, { flexDirection: dir.row }]}>
            <Icon size={ms(13)} color="#fff" strokeWidth={2} />
            <Text style={s.wheelChipText} numberOfLines={1}>{label}</Text>
          </View>
        ))}
      </View>
      {prizes.length > 0 && (
        <>
          <Text style={[s.wheelPrizesTitle, { textAlign: dir.textAlign }]}>{t('fiche.luckyWheelPrizes')}</Text>
          <View style={[s.wheelChips, { flexDirection: dir.row, marginTop: 0 }]}>
            {prizes.map((prize) => (
              <View key={prize.id} style={[s.wheelPrize, { flexDirection: dir.row }]}>
                <JitGift size={ms(13)} color="#FDE68A" strokeWidth={2} />
                <Text style={s.wheelPrizeText} numberOfLines={1}>{prize.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      <Text style={[s.wheelHint, { textAlign: dir.textAlign }]}>{t('fiche.luckyWheelHint')}</Text>
    </LinearGradient>
  );
});

// ── About: description, services, social profiles ──────────────────────────

const BADGE_ICONS: Record<MerchantBadge, LucideIcon> = {
  WIFI: Wifi,
  PARKING: ParkingSquare,
  TERRASSE: TreePine,
  CLIMATISE: Snowflake,
  CARTE_BANCAIRE: CreditCard,
  LIVRAISON: Truck,
  TAKEAWAY: ShoppingBag,
  HALAL: Utensils,
  VEGETARIEN: Leaf,
  ACCESS_PMR: Accessibility,
  PETS_OK: Dog,
  KID_FRIENDLY: Baby,
  RESERVATION: CalendarCheck,
};

const NETWORK_UI: Record<SocialNetwork, { Icon: LucideIcon; color: string | null; labelKey: string }> = {
  instagram: { Icon: Instagram, color: '#E1306C', labelKey: 'fiche.openInstagram' },
  // null: follows the text color so the TikTok mark stays visible in dark mode.
  tiktok: { Icon: Music2, color: null, labelKey: 'fiche.openTiktok' },
  facebook: { Icon: Facebook, color: '#1877F2', labelKey: 'fiche.openFacebook' },
  snapchat: { Icon: Ghost, color: '#C9A400', labelKey: 'fiche.openSnapchat' },
  youtube: { Icon: Youtube, color: '#FF0000', labelKey: 'fiche.openYoutube' },
};

function LinkifiedText({ text, style, linkColor, numberOfLines }: {
  text: string;
  style: StyleProp<TextStyle>;
  linkColor: string;
  numberOfLines?: number;
}) {
  const parts = useMemo(() => linkifyText(text), [text]);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) => {
        const url = part.url;
        if (!url) return part.text;
        return (
          <Text
            key={i}
            style={[s.link, { color: linkColor }]}
            onPress={() => { hapticLight(); void openFirst([url]); }}
            accessibilityRole="link"
          >
            {part.text}
          </Text>
        );
      })}
    </Text>
  );
}

export const FicheAbout = memo(function FicheAbout({ accent, description, badges, profiles }: {
  accent: string;
  description: string;
  badges: MerchantBadge[];
  profiles: SocialProfile[];
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => { animateNext(); setExpanded((v) => !v); }, []);
  if (!description && badges.length === 0 && profiles.length === 0) return null;

  const collapsible = description.length > COLLAPSIBLE_LENGTH;
  const neutral = theme.mode === 'dark' ? palette.white : palette.gray900;

  return (
    <FicheSection title={t('fiche.aboutUs')} Icon={Info} accent={accent}>
      {!!description && (
        <>
          <LinkifiedText
            text={description}
            linkColor={accent}
            style={[s.description, { color: theme.textSecondary, textAlign: dir.textAlign }]}
            numberOfLines={collapsible && !expanded ? COLLAPSED_LINES : undefined}
          />
          {collapsible && (
            <Pressable onPress={toggle} hitSlop={6} accessibilityRole="button" style={[s.readMore, { alignSelf: dir.alignStart }]}>
              <Text style={[s.readMoreText, { color: accent }]}>{expanded ? t('fiche.showLess') : t('fiche.readMore')}</Text>
            </Pressable>
          )}
        </>
      )}

      {badges.length > 0 && (
        <View style={description ? s.block : undefined}>
          <Text style={[s.subheading, { color: theme.text, textAlign: dir.textAlign }]}>{t('fiche.badgesTitle')}</Text>
          <View style={[s.wrap, { flexDirection: dir.row }]}>
            {badges.map((code) => {
              const Icon = BADGE_ICONS[code];
              return (
                <View key={code} style={[s.badge, { flexDirection: dir.row, backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                  <Icon size={ms(14)} color={accent} strokeWidth={2} />
                  <Text style={[s.badgeText, { color: theme.textSecondary }]} numberOfLines={1}>{t(`fiche.badges.${code}`)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {profiles.length > 0 && (
        <View style={description || badges.length ? s.block : undefined}>
          <Text style={[s.subheading, { color: theme.text, textAlign: dir.textAlign }]}>{t('fiche.followUs')}</Text>
          <View style={[s.wrap, { flexDirection: dir.row, gap: wp(10) }]}>
            {profiles.map(({ network, handle, urls }) => {
              const { Icon, color, labelKey } = NETWORK_UI[network];
              const tint = color ?? neutral;
              return (
                <Pressable
                  key={network}
                  onPress={() => { hapticLight(); void openFirst(urls); }}
                  style={({ pressed }) => [s.social, { backgroundColor: `${tint}14`, opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="link"
                  accessibilityLabel={`${t(labelKey)} @${handle}`}
                >
                  <Icon size={ms(19)} color={tint} strokeWidth={2} />
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </FicheSection>
  );
});

// ── Gallery ─────────────────────────────────────────────────────────────────

const galleryKey = (url: string, i: number) => `${url}-${i}`;

function GalleryViewer({ images, initialIndex, onClose }: { images: string[]; initialIndex: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [index, setIndex] = useState(initialIndex);
  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }, [width]);
  const getItemLayout = useCallback((_: unknown, i: number) => ({ length: width, offset: width * i, index: i }), [width]);
  const renderItem = useCallback(({ item }: { item: string }) => (
    <View style={{ width, height, justifyContent: 'center' }}>
      <ExpoImage
        source={resolveImageUrl(item)}
        style={{ width, height: height * 0.78 }}
        contentFit="contain"
        cachePolicy="memory-disk"
        recyclingKey={item}
      />
    </View>
  ), [width, height]);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.viewer}>
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={getItemLayout}
          onMomentumScrollEnd={onMomentumEnd}
          keyExtractor={galleryKey}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          renderItem={renderItem}
        />
        <View style={[s.viewerTop, { top: insets.top + hp(8) }]} pointerEvents="box-none">
          <View style={s.viewerCounter}>
            <Text style={s.viewerCounterText}>{`${index + 1} / ${images.length}`}</Text>
          </View>
          <Pressable onPress={onClose} style={s.viewerClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <XIcon size={ms(22)} color="#fff" strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export const FicheGallery = memo(function FicheGallery({ images, accent }: { images: string[]; accent: string }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const { width } = useWindowDimensions();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const close = useCallback(() => setOpenIndex(null), []);
  if (images.length === 0) return null;
  const size = Math.floor((width - GRID_INSET - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

  return (
    <>
      <FicheSection title={t('fiche.galleryTitle')} Icon={Images} accent={accent} right={<Count value={images.length} />}>
        <View style={[s.grid, { flexDirection: dir.row }]}>
          {images.map((url, i) => (
            <Pressable
              key={`${url}-${i}`}
              onPress={() => { hapticLight(); setOpenIndex(i); }}
              style={({ pressed }) => [s.thumb, { width: size, height: size, backgroundColor: theme.bgSkeleton, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${t('fiche.galleryTitle')} ${i + 1}/${images.length}`}
            >
              <ExpoImage source={resolveImageUrl(url)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={url} />
            </Pressable>
          ))}
        </View>
      </FicheSection>
      {openIndex !== null && <GalleryViewer images={images} initialIndex={openIndex} onClose={close} />}
    </>
  );
});

// ── Opening hours ───────────────────────────────────────────────────────────

export const FicheHours = memo(function FicheHours({ hours, status, accent }: {
  hours: OpeningHours;
  status: OpenStatus | null;
  accent: string;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const today = weekDayOf(new Date());
  const statusColor = status?.isOpen ? theme.success : theme.danger;

  return (
    <FicheSection
      title={t('fiche.hoursTitle')}
      Icon={Clock}
      accent={accent}
      right={status && (
        <View style={[s.status, { flexDirection: dir.row, backgroundColor: `${statusColor}14` }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusText, { color: statusColor }]}>{status.isOpen ? t('fiche.openNow') : t('fiche.closedNow')}</Text>
        </View>
      )}
    >
      <View style={s.hoursList}>
        {WEEK_DAYS.map((day) => {
          const isToday = day === today;
          const slots = formatDaySlots(hours[day]);
          const color = isToday ? theme.text : theme.textSecondary;
          return (
            <View key={day} style={[s.hoursRow, { flexDirection: dir.row }, isToday && { backgroundColor: `${accent}0F` }]}>
              <Text style={[s.hoursDay, { color, fontFamily: isToday ? font.bold : font.medium }]}>
                {t(`fiche.days.${day}`)}
                {isToday ? ` · ${t('fiche.today')}` : ''}
              </Text>
              <Text
                style={[
                  s.hoursSlots,
                  { color: slots ? color : theme.danger, fontFamily: isToday ? font.semibold : font.regular, textAlign: dir.isRTL ? 'left' : 'right' },
                ]}
              >
                {slots ?? t('fiche.dayClosed')}
              </Text>
            </View>
          );
        })}
      </View>
    </FicheSection>
  );
});

// ── Locations ───────────────────────────────────────────────────────────────

interface FicheStore {
  id: string;
  nom?: string | null;
  adresse?: string | null;
  quartier?: string | null;
  ville?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  telephone?: string | null;
}

export const FicheLocations = memo(function FicheLocations({ stores, merchantName, accent }: {
  stores: FicheStore[];
  merchantName: string;
  accent: string;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  if (stores.length === 0) return null;
  const multiple = stores.length > 1;

  return (
    <FicheSection
      title={multiple ? t('fiche.otherLocationsTitle') : t('fiche.locationTitle')}
      Icon={JitPin}
      accent={accent}
      right={multiple ? <Count value={stores.length} /> : undefined}
    >
      <View style={s.locations}>
        {stores.map((store, i) => {
          const name = store.nom || merchantName;
          const address = store.adresse || [store.quartier, store.ville].filter(Boolean).join(', ');
          const canNavigate = hasCoords(store);
          const tel = toTel(store.telephone);
          const navigate = () => {
            if (!hasCoords(store)) return;
            hapticLight();
            void openDirections(store.latitude, store.longitude, name);
          };
          return (
            <Pressable
              key={store.id}
              onPress={navigate}
              disabled={!canNavigate}
              style={({ pressed }) => [
                s.location,
                { flexDirection: dir.row },
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole={canNavigate ? 'button' : undefined}
              accessibilityLabel={canNavigate ? `${t('fiche.directions')} ${name}` : name}
            >
              <View style={s.flex}>
                <Text style={[s.locationName, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1}>{name}</Text>
                {!!address && (
                  <Text style={[s.locationAddress, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={2}>{address}</Text>
                )}
              </View>
              {!!tel && (
                <Pressable
                  onPress={() => { hapticLight(); void openFirst([tel]); }}
                  style={({ pressed }) => [s.locationAction, { backgroundColor: `${theme.success}14`, opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('fiche.call')} ${name}`}
                  hitSlop={4}
                >
                  <Phone size={ms(17)} color={theme.success} strokeWidth={2} />
                </Pressable>
              )}
              {canNavigate && (
                <View style={[s.locationAction, { backgroundColor: `${accent}14` }]}>
                  <Navigation size={ms(17)} color={accent} strokeWidth={2} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </FicheSection>
  );
});

const s = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  card: {
    borderRadius: ms(22),
    borderWidth: StyleSheet.hairlineWidth,
    padding: wp(16),
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 14 },
      android: { elevation: 1 },
    }),
  },
  header: { alignItems: 'center', gap: wp(10), marginBottom: hp(14) },
  headerIcon: { width: ms(32), height: ms(32), borderRadius: ms(10), alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: ms(16), fontFamily: font.bold, letterSpacing: -0.2 },
  count: { fontSize: ms(13), fontFamily: font.semibold },
  action: { fontSize: ms(13), fontFamily: font.semibold },
  pressed: { opacity: 0.7 },

  tabsContent: { flexGrow: 1, paddingHorizontal: wp(8) },
  tab: { flexGrow: 1, height: TAB_BAR_HEIGHT, paddingHorizontal: wp(12), alignItems: 'center', justifyContent: 'flex-end' },
  tabLabel: { fontSize: ms(14), marginBottom: hp(11) },
  tabIndicator: { alignSelf: 'stretch', height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },

  first: { alignItems: 'center', gap: wp(12), padding: wp(12), borderRadius: ms(18), borderWidth: 1 },
  overline: { fontSize: ms(11), fontFamily: font.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  firstTitle: { fontSize: ms(16), lineHeight: ms(21), fontFamily: font.bold, marginTop: hp(2) },
  firstMeta: { fontSize: ms(12), lineHeight: ms(17), fontFamily: font.medium, marginTop: hp(3) },
  wheelRow: { alignItems: 'center', gap: wp(10), marginTop: hp(10), paddingHorizontal: wp(12), paddingVertical: hp(11), borderRadius: ms(14) },
  wheelRowText: { flex: 1, fontSize: ms(13), fontFamily: font.semibold },
  infoRow: { alignItems: 'center', gap: wp(12), paddingVertical: hp(8) },
  infoSeparator: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: hp(4), paddingTop: hp(12) },
  infoIcon: { width: ms(36), height: ms(36), borderRadius: ms(12), alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: ms(14), lineHeight: ms(19), fontFamily: font.semibold },
  infoSubtitle: { fontSize: ms(12), marginTop: hp(2), fontFamily: font.regular },
  toggle: { alignItems: 'center', justifyContent: 'center', gap: wp(4), marginTop: hp(12) },
  toggleText: { fontSize: ms(13), fontFamily: font.semibold },
  chevronUp: { transform: [{ rotate: '180deg' }] },
  subheading: { fontSize: ms(14), fontFamily: font.bold, marginBottom: hp(10) },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: hp(16) },

  steps: { gap: hp(12) },
  step: { alignItems: 'center', gap: wp(12) },
  stepNumber: { width: ms(30), height: ms(30), borderRadius: ms(15), alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: ms(13), fontFamily: font.bold },
  stepText: { flex: 1, fontSize: ms(14), lineHeight: ms(20), fontFamily: font.medium },
  infoLine: { alignItems: 'center', gap: wp(8), marginTop: hp(12) },
  infoText: { flex: 1, fontSize: ms(12), lineHeight: ms(17), fontFamily: font.regular },
  rewards: { gap: hp(8) },
  reward: { alignItems: 'center', gap: wp(12), padding: wp(10), borderRadius: ms(16), borderWidth: 1 },
  rewardThumb: { width: ms(46), height: ms(46), borderRadius: ms(13), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rewardTitle: { fontSize: ms(14), lineHeight: ms(19), fontFamily: font.semibold },
  rewardDesc: { fontSize: ms(12), marginTop: hp(2), fontFamily: font.regular },
  rewardBadge: { paddingHorizontal: wp(10), paddingVertical: hp(5), borderRadius: 999 },
  rewardBadgeText: { fontSize: ms(12), fontFamily: font.bold },

  wheel: { borderRadius: ms(22), padding: wp(16), overflow: 'hidden' },
  wheelWatermark: { position: 'absolute', top: -ms(20), transform: [{ rotate: '-18deg' }] },
  wheelWatermarkLtr: { right: -ms(24) },
  wheelWatermarkRtl: { left: -ms(24) },
  wheelHeader: { alignItems: 'center', gap: wp(12) },
  wheelIcon: {
    width: ms(40), height: ms(40), borderRadius: ms(13),
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  wheelOverline: { color: 'rgba(255,255,255,0.8)', fontSize: ms(11), fontFamily: font.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  wheelName: { color: '#fff', fontSize: ms(17), fontFamily: font.bold, marginTop: hp(2) },
  wheelDescription: { color: 'rgba(255,255,255,0.88)', fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular, marginTop: hp(10) },
  wheelChips: { flexWrap: 'wrap', gap: wp(6), marginTop: hp(12) },
  wheelChip: {
    alignItems: 'center', gap: wp(5), paddingHorizontal: wp(10), paddingVertical: hp(5),
    borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)',
  },
  wheelChipText: { color: '#fff', fontSize: ms(12), fontFamily: font.semibold },
  wheelPrizesTitle: { color: '#fff', fontSize: ms(13), fontFamily: font.bold, marginTop: hp(16), marginBottom: hp(8) },
  wheelPrize: {
    alignItems: 'center', gap: wp(6), maxWidth: '100%', paddingHorizontal: wp(10), paddingVertical: hp(6),
    borderRadius: ms(12), backgroundColor: 'rgba(15,23,42,0.22)',
  },
  wheelPrizeText: { color: '#fff', fontSize: ms(12), fontFamily: font.medium, flexShrink: 1 },
  wheelHint: { color: 'rgba(255,255,255,0.78)', fontSize: ms(12), lineHeight: ms(17), fontFamily: font.regular, marginTop: hp(14) },

  description: { fontSize: ms(14), lineHeight: ms(22), fontFamily: font.regular },
  link: { textDecorationLine: 'underline' },
  readMore: { marginTop: hp(6) },
  readMoreText: { fontSize: ms(13), fontFamily: font.semibold },
  block: { marginTop: hp(18) },
  wrap: { flexWrap: 'wrap', gap: wp(8) },
  badge: {
    alignItems: 'center', gap: wp(6), paddingHorizontal: wp(12), paddingVertical: hp(7),
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: { fontSize: ms(12), fontFamily: font.medium },
  social: { width: ms(44), height: ms(44), borderRadius: ms(14), alignItems: 'center', justifyContent: 'center' },

  grid: { flexWrap: 'wrap', gap: GRID_GAP },
  thumb: { borderRadius: ms(14), overflow: 'hidden' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  viewerTop: { position: 'absolute', left: wp(16), right: wp(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewerCounter: { paddingHorizontal: wp(12), paddingVertical: hp(6), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  viewerCounterText: { color: '#fff', fontSize: ms(13), fontFamily: font.semibold },
  viewerClose: {
    width: ms(40), height: ms(40), borderRadius: ms(20),
    backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center',
  },

  status: { alignItems: 'center', gap: wp(6), paddingHorizontal: wp(10), paddingVertical: hp(4), borderRadius: 999 },
  statusDot: { width: ms(7), height: ms(7), borderRadius: ms(4) },
  statusText: { fontSize: ms(12), fontFamily: font.semibold },
  hoursList: { gap: hp(2) },
  hoursRow: {
    alignItems: 'center', justifyContent: 'space-between', gap: wp(12),
    paddingVertical: hp(9), paddingHorizontal: wp(10), borderRadius: ms(12),
  },
  hoursDay: { fontSize: ms(14) },
  hoursSlots: { flexShrink: 1, fontSize: ms(14) },

  locations: { marginTop: -hp(4) },
  location: { alignItems: 'center', gap: wp(10), paddingVertical: hp(12) },
  locationName: { fontSize: ms(14), fontFamily: font.semibold },
  locationAddress: { fontSize: ms(12), lineHeight: ms(17), fontFamily: font.regular, marginTop: hp(2) },
  locationAction: { width: ms(40), height: ms(40), borderRadius: ms(14), alignItems: 'center', justifyContent: 'center' },
});
