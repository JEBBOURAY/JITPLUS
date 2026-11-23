/**
 * Sections of the public merchant page, rebuilt for the JitPlus Pro preview.
 *
 * Each block mirrors its counterpart in apps/jitplus/components/merchant/* as a
 * visitor without a card sees it: same layout, sizes and colors (clientTheme),
 * same rules (@jitplus/shared merchantFiche) and same wording (`fiche.*`,
 * shared with jitplus). The counterpart is named above each block: when the
 * client component changes, change this one too. Links open for real so the
 * merchant can test them.
 */
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  Modal,
  FlatList,
  StyleSheet,
  LayoutAnimation,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { Text } from '@/components/AppText';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Gift,
  MapPin,
  Navigation,
  Phone,
  Trophy,
  ShoppingBag,
  X as XIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { MERCHANT_BADGE_ICONS, SOCIAL_NETWORK_ICONS } from '@jitplus/shared/src/fiche/ficheIcons';
import {
  WEEK_DAYS, describeWheelEnd, formatDaySlots, hasCoords, hasOpeningHours, linkifyText, pluralKey, toTel, weekDayOf,
  type FicheReward, type FicheTab, type MerchantBadge, type OpeningHours, type SocialNetwork, type SocialProfile,
} from '@jitplus/shared';
import { openDirections, openFirst } from '@jitplus/shared/src/openLinks';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMoney } from '@/hooks/useCurrency';
import { useDir } from '@/hooks/useDir';
import { font } from '@/constants/design';
import { hapticLight } from '@/utils/haptics';
import { resolveImageUrl } from '@/utils/imageUrl';
import { wp, hp, ms } from '@/utils/responsive';
import { useClientTheme } from './clientTheme';

const REWARDS_PREVIEW = 3;
const COLLAPSED_LINES = 4;
/** Rough length past which the description no longer fits in the collapsed lines. */
const COLLAPSIBLE_LENGTH = 180;
const GRID_COLUMNS = 3;
const GRID_GAP = wp(4);
/** Page side padding, on both sides. */
const GRID_INSET = wp(16) * 2;
const MAX_PRIZES = 6;
function animateNext() {
  hapticLight();
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

// ── Tabs (jitplus MerchantTabs) ─────────────────────────────────────────────

export const TAB_BAR_HEIGHT = ms(48);

/** The preview never shows deals: only signed-in customers fetch them. */
export type PreviewTab = Exclude<FicheTab, 'deals'>;

const TAB_LABEL_KEYS: Record<PreviewTab, string> = {
  shop: 'fiche.tabShop',
  loyalty: 'fiche.tabLoyalty',
  photos: 'fiche.tabPhotos',
};

export const FicheTabs = memo(function FicheTabs({ tabs, active, onChange }: {
  tabs: PreviewTab[];
  active: PreviewTab;
  onChange: (tab: PreviewTab) => void;
}) {
  const theme = useClientTheme();
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
              style={[s.tabLabel, { color: selected ? theme.text : theme.textMuted, fontFamily: selected ? font.semibold : font.medium }]}
              numberOfLines={1}
            >
              {t(TAB_LABEL_KEYS[tab])}
            </Text>
            <View style={[s.tabIndicator, selected && { backgroundColor: theme.text }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

// ── Shell (jitplus FicheSection) ────────────────────────────────────────────

/** Flat block of the page, separated from the next one by a hairline. */
function FicheSection({ title, action, children }: {
  title?: string;
  /** Link at the end of the title row, e.g. "Voir tout". */
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  const theme = useClientTheme();
  const dir = useDir();
  return (
    <View style={[s.section, { borderBottomColor: theme.border }]}>
      {!!title && (
        <View style={[s.header, { flexDirection: dir.row }]}>
          <Text style={[s.title, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {action && (
            <Pressable onPress={() => { hapticLight(); action.onPress(); }} hitSlop={10} accessibilityRole="button">
              <Text style={[s.action, { color: theme.primary }]}>{action.label}</Text>
            </Pressable>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

/** jitplus RewardThumb: reward picture, or a neutral gift icon. */
function RewardThumb({ imageUrl }: { imageUrl?: string | null }) {
  const theme = useClientTheme();
  return (
    <View style={[s.rewardThumb, { backgroundColor: theme.bgInput }]}>
      {imageUrl ? (
        <ExpoImage source={resolveImageUrl(imageUrl)} style={s.fill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={imageUrl} />
      ) : (
        <Gift size={ms(20)} color={theme.textSecondary} strokeWidth={1.8} />
      )}
    </View>
  );
}

// ── Loyalty (jitplus MerchantLoyaltyCard, visitor) ──────────────────────────

export const FicheLoyalty = memo(function FicheLoyalty({ rewards, earnLine, validityDays }: {
  rewards: FicheReward[];
  earnLine: string;
  validityDays?: number | null;
}) {
  const theme = useClientTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rewards : rewards.slice(0, REWARDS_PREVIEW);
  const toggle = useCallback(() => { animateNext(); setShowAll((v) => !v); }, []);

  return (
    <>
      <FicheSection title={t('fiche.loyaltyProgram')}>
        <View style={s.steps}>
          {[t('fiche.howStep1'), earnLine, t('fiche.howStep3')].map((label, i) => (
            <View key={i} style={[s.step, { flexDirection: dir.row }]}>
              <View style={[s.stepNumber, { borderColor: theme.border }]}>
                <Text style={[s.stepNumberText, { color: theme.text }]}>{i + 1}</Text>
              </View>
              <Text style={[s.stepText, { color: theme.text, textAlign: dir.textAlign }]}>{label}</Text>
            </View>
          ))}
        </View>

        {!!validityDays && (
          <View style={[s.infoLine, { flexDirection: dir.row }]}>
            <Clock size={ms(15)} color={theme.textMuted} strokeWidth={2} />
            <Text style={[s.infoText, { color: theme.textMuted, textAlign: dir.textAlign }]}>
              {t('fiche.stampsValidity', { days: validityDays })}
            </Text>
          </View>
        )}
      </FicheSection>

      <FicheSection title={t('fiche.rewardsSection')}>
        {visible.map((reward, i) => (
          <View
            key={reward.id}
            style={[s.reward, { flexDirection: dir.row }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
          >
            <RewardThumb imageUrl={reward.imageUrl} />
            <View style={s.flex}>
              <Text style={[s.rewardTitle, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={2}>{reward.titre}</Text>
              {!!reward.description && (
                <Text style={[s.rewardDesc, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={2}>
                  {reward.description}
                </Text>
              )}
            </View>
            <Text style={[s.rewardCost, { color: theme.textSecondary }]} numberOfLines={1}>
              {t(pluralKey('fiche.stampsCost', reward.cout), { count: reward.cout })}
            </Text>
          </View>
        ))}
        {rewards.length > REWARDS_PREVIEW && (
          <Pressable onPress={toggle} style={[s.toggle, { alignSelf: dir.alignStart }]} accessibilityRole="button" hitSlop={6}>
            <Text style={[s.toggleText, { color: theme.primary }]}>
              {showAll ? t('fiche.showLess') : t('fiche.seeAllRewards', { count: rewards.length })}
            </Text>
          </Pressable>
        )}
      </FicheSection>
    </>
  );
});

// ── Lucky wheel (jitplus MerchantLuckyWheel) ────────────────────────────────

export interface FicheWheel {
  name: string;
  description?: string | null;
  endsAt: string;
  minSpendAmount: number;
  globalWinRate: number;
  prizes: { id: string; label: string }[];
}

export const FicheLuckyWheel = memo(function FicheLuckyWheel({ wheel }: { wheel: FicheWheel }) {
  const theme = useClientTheme();
  const { t } = useLanguage();
  const { money } = useMoney();
  const dir = useDir();
  const facts: { key: string; Icon: LucideIcon; label: string }[] = [
    { key: 'ends', Icon: Clock, label: describeWheelEnd(wheel.endsAt, t, 'fiche') },
    ...(wheel.globalWinRate > 0
      ? [{ key: 'rate', Icon: Trophy, label: t('fiche.luckyWheelWinRate', { rate: Math.round(wheel.globalWinRate * 100) }) }]
      : []),
    ...(wheel.minSpendAmount > 0
      ? [{ key: 'min', Icon: ShoppingBag, label: t('fiche.luckyWheelMinSpend', { amount: money(wheel.minSpendAmount) }) }]
      : []),
  ];
  const prizes = wheel.prizes.slice(0, MAX_PRIZES);
  const label = t('fiche.luckyWheelLabel');
  // Merchants often keep the default name: do not print "Roue de la chance" twice.
  const showName = !!wheel.name && wheel.name.trim().toLowerCase() !== label.toLowerCase();

  return (
    <FicheSection title={label}>
      {showName && (
        <Text style={[s.wheelName, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={2}>{wheel.name}</Text>
      )}
      {!!wheel.description && (
        <Text style={[s.wheelDescription, { color: theme.textSecondary, textAlign: dir.textAlign }]} numberOfLines={3}>
          {wheel.description}
        </Text>
      )}

      <View style={[s.lines, (showName || !!wheel.description) && s.linesSpaced]}>
        {facts.map(({ key, Icon, label }) => (
          <View key={key} style={[s.line, { flexDirection: dir.row }]}>
            <Icon size={ms(15)} color={theme.textMuted} strokeWidth={2} />
            <Text style={[s.lineText, { color: theme.textSecondary, textAlign: dir.textAlign }]} numberOfLines={1}>{label}</Text>
          </View>
        ))}
      </View>

      {prizes.length > 0 && (
        <>
          <Text style={[s.wheelSubheading, { color: theme.text, textAlign: dir.textAlign }]}>{t('fiche.luckyWheelPrizes')}</Text>
          <View style={[s.lines, s.linesSpaced]}>
            {prizes.map((prize) => (
              <View key={prize.id} style={[s.line, { flexDirection: dir.row }]}>
                <Gift size={ms(15)} color={theme.textMuted} strokeWidth={2} />
                <Text style={[s.lineText, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1}>{prize.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={[s.wheelHint, { color: theme.textMuted, textAlign: dir.textAlign }]}>{t('fiche.luckyWheelHint')}</Text>
    </FicheSection>
  );
});

// ── About (jitplus MerchantAbout, MerchantSocialLinks, LinkifiedText) ───────

const NETWORK_LABEL_KEYS: Record<SocialNetwork, string> = {
  instagram: 'fiche.openInstagram',
  tiktok: 'fiche.openTiktok',
  facebook: 'fiche.openFacebook',
  snapchat: 'fiche.openSnapchat',
  youtube: 'fiche.openYoutube',
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

/** Description, amenities and social profiles, one section each. */
export const FicheAbout = memo(function FicheAbout({ description, badges, profiles }: {
  description: string;
  badges: MerchantBadge[];
  profiles: SocialProfile[];
}) {
  const theme = useClientTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => { animateNext(); setExpanded((v) => !v); }, []);

  const collapsible = description.length > COLLAPSIBLE_LENGTH;

  return (
    <>
      {!!description && (
        <FicheSection title={t('fiche.aboutUs')}>
          <LinkifiedText
            text={description}
            linkColor={theme.primary}
            style={[s.description, { color: theme.textSecondary, textAlign: dir.textAlign }]}
            numberOfLines={collapsible && !expanded ? COLLAPSED_LINES : undefined}
          />
          {collapsible && (
            <Pressable onPress={toggle} hitSlop={6} accessibilityRole="button" style={[s.readMore, { alignSelf: dir.alignStart }]}>
              <Text style={[s.readMoreText, { color: theme.text }]}>{expanded ? t('fiche.showLess') : t('fiche.readMore')}</Text>
            </Pressable>
          )}
        </FicheSection>
      )}

      {badges.length > 0 && (
        <FicheSection title={t('fiche.badgesTitle')}>
          {/* Two columns, like the amenities list of a maps listing. */}
          <View style={[s.badges, { flexDirection: dir.row }]}>
            {badges.map((code) => {
              const Icon = MERCHANT_BADGE_ICONS[code];
              return (
                <View key={code} style={[s.badge, { flexDirection: dir.row }]}>
                  <Icon size={ms(18)} color={theme.textSecondary} strokeWidth={1.8} />
                  <Text style={[s.badgeText, { color: theme.text }]} numberOfLines={1}>{t(`fiche.badges.${code}`)}</Text>
                </View>
              );
            })}
          </View>
        </FicheSection>
      )}

      {profiles.length > 0 && (
        <FicheSection title={t('fiche.followUs')}>
          <View style={[s.socials, { flexDirection: dir.row }]}>
            {profiles.map(({ network, handle, urls }) => {
              const Icon = SOCIAL_NETWORK_ICONS[network];
              const labelKey = NETWORK_LABEL_KEYS[network];
              return (
                <Pressable
                  key={network}
                  onPress={() => { hapticLight(); void openFirst(urls); }}
                  style={({ pressed }) => [s.social, { borderColor: theme.border, backgroundColor: pressed ? theme.bgInput : theme.bg }]}
                  accessibilityRole="link"
                  accessibilityLabel={`${t(labelKey)} @${handle}`}
                >
                  <Icon size={ms(20)} color={theme.text} strokeWidth={1.8} />
                </Pressable>
              );
            })}
          </View>
        </FicheSection>
      )}
    </>
  );
});

// ── Gallery (jitplus MerchantGallery) ───────────────────────────────────────

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
        transition={150}
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

/** Photos tab: a grid of thumbnails opening a full-screen viewer. */
export const FicheGallery = memo(function FicheGallery({ images }: { images: string[] }) {
  const theme = useClientTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const { width } = useWindowDimensions();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const close = useCallback(() => setOpenIndex(null), []);
  if (images.length === 0) return null;
  const size = Math.floor((width - GRID_INSET - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

  return (
    <>
      <FicheSection title={`${t('fiche.galleryTitle')} (${images.length})`}>
        <View style={[s.grid, { flexDirection: dir.row }]}>
          {images.map((url, i) => (
            <Pressable
              key={`${url}-${i}`}
              onPress={() => { hapticLight(); setOpenIndex(i); }}
              style={({ pressed }) => [s.thumb, { width: size, height: size, backgroundColor: theme.bgSkeleton, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${t('fiche.galleryTitle')} ${i + 1}/${images.length}`}
            >
              <ExpoImage
                source={resolveImageUrl(url)}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={url}
                transition={150}
              />
            </Pressable>
          ))}
        </View>
      </FicheSection>
      {openIndex !== null && <GalleryViewer images={images} initialIndex={openIndex} onClose={close} />}
    </>
  );
});

// ── Shop info (jitplus MerchantShopInfo) ────────────────────────────────────

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

/**
 * jitplus MerchantShopInfo: practical info as a maps listing shows it, one row
 * per address (tap for directions), then today's hours opening onto the week.
 * The client also sees its distance to each store.
 */
export const FicheShopInfo = memo(function FicheShopInfo({ stores, hours, merchantName }: {
  stores: FicheStore[];
  hours: OpeningHours | null | undefined;
  merchantName: string;
}) {
  const theme = useClientTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const [weekOpen, setWeekOpen] = useState(false);
  const showHours = hasOpeningHours(hours);
  if (stores.length === 0 && !showHours) return null;
  const multiple = stores.length > 1;
  const today = weekDayOf(new Date());
  const Chevron = weekOpen ? ChevronUp : ChevronDown;

  return (
    <FicheSection>
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
        // Without an address the name is the only line, so the row is never blank.
        const showName = multiple || !address || (!!store.nom && store.nom !== merchantName);
        return (
          <Pressable
            key={store.id}
            onPress={navigate}
            disabled={!canNavigate}
            style={({ pressed }) => [
              s.location,
              { flexDirection: dir.row },
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
              pressed && s.pressed,
            ]}
            accessibilityRole={canNavigate ? 'button' : undefined}
            accessibilityLabel={canNavigate ? `${t('fiche.directions')} ${name}` : name}
          >
            <MapPin size={ms(20)} color={theme.textSecondary} strokeWidth={1.8} />
            <View style={s.flex}>
              {showName && (
                <Text style={[s.locationName, { color: theme.text, fontFamily: font.medium, textAlign: dir.textAlign }]} numberOfLines={1}>
                  {name}
                </Text>
              )}
              {!!address && (
                <Text
                  style={showName
                    ? [s.locationAddress, { color: theme.textMuted, textAlign: dir.textAlign }]
                    : [s.locationName, { color: theme.text, fontFamily: font.regular, textAlign: dir.textAlign }]}
                  numberOfLines={2}
                >
                  {address}
                </Text>
              )}
            </View>
            {multiple && !!tel && (
              <Pressable
                onPress={() => { hapticLight(); void openFirst([tel]); }}
                style={({ pressed }) => [s.locationAction, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`${t('fiche.call')} ${name}`}
                hitSlop={4}
              >
                <Phone size={ms(17)} color={theme.text} strokeWidth={2} />
              </Pressable>
            )}
            {multiple && canNavigate && (
              <View style={[s.locationAction, { borderColor: theme.border }]}>
                <Navigation size={ms(17)} color={theme.text} strokeWidth={2} />
              </View>
            )}
          </Pressable>
        );
      })}

      {showHours && (
        <View style={stores.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }}>
          <Pressable
            onPress={() => { animateNext(); setWeekOpen((v) => !v); }}
            style={({ pressed }) => [s.location, { flexDirection: dir.row }, pressed && s.pressed]}
            accessibilityRole="button"
            accessibilityState={{ expanded: weekOpen }}
            accessibilityLabel={t('fiche.hoursTitle')}
          >
            <Clock size={ms(20)} color={theme.textSecondary} strokeWidth={1.8} />
            <Text style={[s.locationName, s.flex, { color: theme.text, fontFamily: font.regular, textAlign: dir.textAlign }]} numberOfLines={1}>
              {`${t('fiche.today')} · ${formatDaySlots(hours![today]) ?? t('fiche.dayClosed')}`}
            </Text>
            <Chevron size={ms(18)} color={theme.textMuted} strokeWidth={2} />
          </Pressable>
          {weekOpen && (
            <View style={[s.week, dir.isRTL ? { paddingRight: WEEK_INDENT } : { paddingLeft: WEEK_INDENT }]}>
              {WEEK_DAYS.map((day) => {
                const slots = formatDaySlots(hours![day]);
                const fontFamily = day === today ? font.semibold : font.regular;
                return (
                  <View key={day} style={[s.hoursRow, { flexDirection: dir.row }]}>
                    <Text style={[s.hoursDay, { color: theme.text, fontFamily }]}>{t(`fiche.days.${day}`)}</Text>
                    <Text style={[s.hoursSlots, { color: slots ? theme.text : theme.textMuted, fontFamily, textAlign: dir.isRTL ? 'left' : 'right' }]}>
                      {slots ?? t('fiche.dayClosed')}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </FicheSection>
  );
});

/** Week list aligned past the clock icon. */
const WEEK_INDENT = ms(20) + wp(14);

const s = StyleSheet.create({
  tabsContent: { flexGrow: 1, paddingHorizontal: wp(4) },
  tab: { flexGrow: 1, height: TAB_BAR_HEIGHT, paddingHorizontal: wp(12), alignItems: 'center', justifyContent: 'flex-end' },
  tabLabel: { fontSize: ms(14), marginBottom: hp(12) },
  tabIndicator: { alignSelf: 'stretch', height: 2 },
  week: { paddingBottom: hp(10) },
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  pressed: { opacity: 0.6 },

  section: { paddingVertical: hp(18), borderBottomWidth: StyleSheet.hairlineWidth },
  header: { alignItems: 'center', gap: wp(10), marginBottom: hp(12) },
  title: { flex: 1, fontSize: ms(17), fontFamily: font.semibold, letterSpacing: -0.2 },
  action: { fontSize: ms(14), fontFamily: font.semibold },


  steps: { gap: hp(12) },
  step: { alignItems: 'center', gap: wp(12) },
  stepNumber: { width: ms(26), height: ms(26), borderRadius: ms(13), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: ms(13), fontFamily: font.semibold },
  stepText: { flex: 1, fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular },
  infoLine: { alignItems: 'center', gap: wp(8), marginTop: hp(14) },
  infoText: { flex: 1, fontSize: ms(13), lineHeight: ms(18), fontFamily: font.regular },
  reward: { alignItems: 'center', gap: wp(12), paddingVertical: hp(10) },
  rewardThumb: { width: ms(44), height: ms(44), borderRadius: ms(10), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rewardTitle: { fontSize: ms(15), lineHeight: ms(20), fontFamily: font.semibold },
  rewardDesc: { fontSize: ms(13), lineHeight: ms(18), fontFamily: font.regular, marginTop: hp(2) },
  rewardCost: { fontSize: ms(13), fontFamily: font.medium },
  toggle: { marginTop: hp(8) },
  toggleText: { fontSize: ms(14), fontFamily: font.semibold },

  wheelName: { fontSize: ms(15), lineHeight: ms(20), fontFamily: font.semibold },
  wheelDescription: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular, marginTop: hp(4) },
  lines: { gap: hp(8) },
  linesSpaced: { marginTop: hp(12) },
  line: { alignItems: 'center', gap: wp(10) },
  lineText: { flex: 1, fontSize: ms(14), fontFamily: font.regular },
  wheelSubheading: { fontSize: ms(14), fontFamily: font.semibold, marginTop: hp(16) },
  wheelHint: { fontSize: ms(13), lineHeight: ms(18), fontFamily: font.regular, marginTop: hp(14) },

  description: { fontSize: ms(15), lineHeight: ms(22), fontFamily: font.regular },
  link: { textDecorationLine: 'underline' },
  readMore: { marginTop: hp(6) },
  readMoreText: { fontSize: ms(14), fontFamily: font.semibold },
  badges: { flexWrap: 'wrap', rowGap: hp(12) },
  badge: { width: '50%', alignItems: 'center', gap: wp(10), paddingEnd: wp(8) },
  badgeText: { flexShrink: 1, fontSize: ms(14), fontFamily: font.regular },
  socials: { flexWrap: 'wrap', gap: wp(10) },
  social: { width: ms(44), height: ms(44), borderRadius: ms(22), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  grid: { flexWrap: 'wrap', gap: GRID_GAP },
  thumb: { borderRadius: ms(4), overflow: 'hidden' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  viewerTop: { position: 'absolute', left: wp(16), right: wp(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewerCounter: { paddingHorizontal: wp(12), paddingVertical: hp(6), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  viewerCounterText: { color: '#fff', fontSize: ms(13), fontFamily: font.semibold },
  viewerClose: {
    width: ms(40), height: ms(40), borderRadius: ms(20),
    backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center',
  },

  hoursRow: { alignItems: 'center', justifyContent: 'space-between', gap: wp(12), paddingVertical: hp(4) },
  hoursDay: { fontSize: ms(14) },
  hoursSlots: { flexShrink: 1, fontSize: ms(14) },

  location: { alignItems: 'center', gap: wp(14), paddingVertical: hp(10) },
  locationName: { fontSize: ms(15) },
  locationAddress: { fontSize: ms(13), lineHeight: ms(18), fontFamily: font.regular, marginTop: hp(2) },
  locationAction: { width: ms(38), height: ms(38), borderRadius: ms(19), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
