/**
 * FichePreviewModal — Aperçu pixel-perfect de la fiche telle qu'affichée
 * sur l'application cliente JitPlus (apps/jitplus/app/merchant/[id].tsx).
 * Toutes les sections sont reproduites à l'identique : hero, identité,
 * réseaux sociaux, description, badges, galerie, horaires, fidélité,
 * autres adresses et barre d'action.
 */
import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, Pressable, TouchableOpacity,
  StatusBar, I18nManager, Dimensions, Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X as XIcon, ArrowLeft, Send, Flag, Eye, Users, Clock, Gift, Coins, Stamp,
  MapPin, Phone, ChevronRight, Wallet,
  Instagram, Music2, Mail, Globe,
  Wifi, ParkingSquare, TreePine, Snowflake, CreditCard, Truck, ShoppingBag,
  Utensils, Leaf, Accessibility, Dog, Baby, CalendarCheck,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { wp, hp, ms } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';
import { MERCHANT_ICON_MAP } from '@/utils/merchantIcons';
import { palette } from '@/contexts/ThemeContext';
import { useRewards } from '@/hooks/useQueryHooks';
import type { Merchant, MerchantCategory, Reward } from '@/types';
import type { OpeningHours } from '@jitplus/shared';

// ─── Helpers identiques à la fiche client ────────────────────────────────
const BADGE_ICONS: Record<string, React.ComponentType<any>> = {
  WIFI: Wifi, PARKING: ParkingSquare, TERRASSE: TreePine, CLIMATISE: Snowflake,
  CARTE_BANCAIRE: CreditCard, LIVRAISON: Truck, TAKEAWAY: ShoppingBag,
  HALAL: Utensils, VEGETARIEN: Leaf, ACCESS_PMR: Accessibility,
  PETS_OK: Dog, KID_FRIENDLY: Baby, RESERVATION: CalendarCheck,
};

const WEEK_DAYS: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> =
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const EMERALD = '#10b981';
const RED = '#ef4444';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

function getTodayKey(): typeof WEEK_DAYS[number] {
  const js = new Date().getDay();
  return WEEK_DAYS[(js + 6) % 7];
}

function isOpenNow(hours: OpeningHours | null | undefined): boolean {
  if (!hours) return false;
  const today = hours[getTodayKey()];
  if (!today || today.closed || !today.slots?.length) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  return today.slots.some((s) => {
    const o = toMinutes(s.open);
    const c = toMinutes(s.close);
    return o >= 0 && c >= 0 && cur >= o && cur <= c;
  });
}

type PreviewState = {
  accent: string;
  iconSlug: string | null;
  tagline: string;
  badges: string[];
  hours: OpeningHours;
  gallery: string[];
  secondary: MerchantCategory[];
};

type Theme = {
  bg: string; bgCard: string; text: string; textSecondary: string;
  textMuted: string; borderLight: string;
};

interface Props {
  visible: boolean;
  onClose: () => void;
  merchant: Merchant;
  draft: PreviewState;
  theme: Theme;
  t: (key: string, opts?: any) => string;
  getCategoryLabel: (c: string) => string;
}

const SCREEN_W = Dimensions.get('window').width;

function FichePreviewModalInner({
  onClose, merchant, draft, theme, t, getCategoryLabel,
}: Omit<Props, 'visible'>) {
  const insets = useSafeAreaInsets();
  const [galleryIdx, setGalleryIdx] = useState<number | null>(null);
  const { data: rewardsData } = useRewards(true);

  const accent = draft.accent || palette.violet;
  const IconCmp = draft.iconSlug ? MERCHANT_ICON_MAP[draft.iconSlug] : null;
  const open = useMemo(() => isOpenNow(draft.hours), [draft.hours]);
  const todayKey = getTodayKey();
  const allCategoriesLabel = useMemo(() => {
    const list = [merchant.categorie, ...(draft.secondary || [])].filter(Boolean) as string[];
    return list.map((c) => getCategoryLabel(c)).join(' · ');
  }, [merchant.categorie, draft.secondary, getCategoryLabel]);

  const hasAnyHours = !!draft.hours && WEEK_DAYS.some((d) => draft.hours[d]);
  const hasGallery = draft.gallery.length > 0;
  const hasBadges = draft.badges.length > 0;
  const hasDescription = !!merchant.description && merchant.description.trim().length > 0;
  const hasStores = !!merchant.stores && merchant.stores.length > 0;

  // Fallback : si pas de stores créés, on synthétise une "adresse" depuis le merchant
  // pour que la section Localisation reste visible en preview comme côté client.
  const fallbackStore = useMemo(() => {
    if (hasStores) return null;
    const hasAnyAddress = !!merchant.adresse
      || !!merchant.quartier
      || !!merchant.ville
      || (merchant.latitude != null && merchant.longitude != null);
    if (!hasAnyAddress) return null;
    return {
      id: 'preview-primary',
      nom: merchant.nom,
      adresse: merchant.adresse,
      quartier: merchant.quartier,
      ville: merchant.ville,
      latitude: merchant.latitude,
      longitude: merchant.longitude,
      telephone: merchant.phoneNumber,
    };
  }, [hasStores, merchant.adresse, merchant.quartier, merchant.ville, merchant.latitude, merchant.longitude, merchant.nom, merchant.phoneNumber]);

  const displayedStores = hasStores
    ? merchant.stores!
    : (fallbackStore ? [fallbackStore] : []);
  const showLocations = displayedStores.length > 0;

  // Réseaux sociaux
  const storeEmail = useMemo(
    () => merchant.stores?.find((s) => !!s.email)?.email,
    [merchant.stores],
  );
  const hasSocial = !!storeEmail
    || !!merchant.socialLinks?.instagram
    || !!merchant.socialLinks?.tiktok
    || !!merchant.socialLinks?.website;

  // Rewards : on combine les vrais rewards + fallback tampons (comme la fiche client)
  const rewardsList: Reward[] = useMemo(() => {
    if (rewardsData && rewardsData.length > 0) return rewardsData;
    if (merchant.loyaltyType === 'STAMPS') {
      return [{
        id: 'default-stamp',
        titre: t('common.gift') || 'Cadeau',
        cout: merchant.stampsForReward || 10,
      }];
    }
    return [];
  }, [rewardsData, merchant.loyaltyType, merchant.stampsForReward, t]);

  const loyaltyTypeLabel = merchant.loyaltyType === 'STAMPS'
    ? t('storePreview.stampCard')
    : t('storePreview.pointsAccumulation');

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <View style={[s.root, { backgroundColor: theme.bg }]}>
        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero ──────────────────────────────────────────────── */}
          <View style={s.heroSection}>
            {merchant.coverUrl ? (
              <ExpoImage
                source={resolveImageUrl(merchant.coverUrl)}
                style={s.coverImage}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : (
              <LinearGradient
                colors={[`${accent}18`, `${accent}08`, theme.bg]}
                style={s.coverImage}
              />
            )}
            <LinearGradient
              colors={['transparent', theme.bg]}
              style={s.coverFade}
            />

            {/* Floating header (réplique exacte : back / share / flag) */}
            <View style={[s.floatingHeader, { paddingTop: insets.top + 4 }]}>
              <Pressable
                onPress={onClose}
                style={s.floatingBtn}
                hitSlop={8}
                accessibilityLabel={t('common.back')}
              >
                <ArrowLeft
                  size={20}
                  color={palette.gray900}
                  strokeWidth={2}
                  style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
                />
              </Pressable>

              {/* Badge APERÇU au centre — spécifique au preview */}
              <View style={s.previewBadge}>
                <Text style={s.previewBadgeText} numberOfLines={1}>
                  {t('storePreview.previewBadge')}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: wp(8) }}>
                <View style={s.floatingBtn}>
                  <Send size={18} color={palette.gray900} strokeWidth={2} />
                </View>
                <View style={s.floatingBtn}>
                  <Flag size={18} color={palette.gray900} strokeWidth={2} />
                </View>
                <Pressable
                  onPress={onClose}
                  style={s.floatingBtn}
                  hitSlop={8}
                  accessibilityLabel={t('common.close')}
                >
                  <XIcon size={20} color={palette.gray900} strokeWidth={2} />
                </Pressable>
              </View>
            </View>

            {/* Logo ring */}
            <View style={s.logoContainer}>
              <View style={[s.logoRing, { backgroundColor: theme.bg }]}>
                {merchant.logoUrl ? (
                  <ExpoImage
                    source={resolveImageUrl(merchant.logoUrl)}
                    style={s.logo}
                    contentFit="cover"
                    cachePolicy="disk"
                  />
                ) : IconCmp ? (
                  <View style={[s.emojiWrap, { backgroundColor: `${accent}15` }]}>
                    <IconCmp size={ms(44)} color={accent} strokeWidth={1.75} />
                  </View>
                ) : (
                  <View style={[s.emojiWrap, { backgroundColor: `${accent}10` }]}>
                    <Text style={s.emoji}>🏪</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* ── Identity ─────────────────────────────────────────── */}
          <View style={s.identitySection}>
            <Text style={[s.merchantName, { color: theme.text }]} numberOfLines={2}>
              {merchant.nom}
            </Text>
            {draft.tagline.trim().length > 0 && (
              <Text style={[s.tagline, { color: theme.textMuted }]} numberOfLines={3}>
                {draft.tagline.trim()}
              </Text>
            )}
            <View style={[s.categoryBadge, { backgroundColor: `${accent}10` }]}>
              {IconCmp ? (
                <IconCmp size={14} color={accent} strokeWidth={2} />
              ) : null}
              <Text
                style={[s.categoryText, { color: accent }]}
                numberOfLines={1}
              >
                {allCategoriesLabel}
              </Text>
            </View>
            <View style={s.statsRow}>
              <View style={[s.statChip, { backgroundColor: theme.bgCard }]}>
                <Eye size={15} color={accent} strokeWidth={2} />
                <Text style={[s.statValue, { color: theme.text }]}>0</Text>
                <Text style={[s.statLabel, { color: theme.textMuted }]}>
                  {t('storePreview.previewViews')}
                </Text>
              </View>
              <View style={s.statDivider} />
              <View style={[s.statChip, { backgroundColor: theme.bgCard }]}>
                <Users size={15} color={accent} strokeWidth={2} />
                <Text style={[s.statValue, { color: theme.text }]}>0</Text>
                <Text style={[s.statLabel, { color: theme.textMuted }]}>
                  {t('storePreview.previewClients')}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Réseaux sociaux ──────────────────────────────────── */}
          {hasSocial && (
            <View style={s.socialRow}>
              {!!merchant.socialLinks?.instagram && (
                <View style={[s.socialIconBtn, { backgroundColor: '#E1306C12' }]}>
                  <Instagram size={18} color="#E1306C" strokeWidth={2} />
                </View>
              )}
              {!!merchant.socialLinks?.tiktok && (
                <View style={[s.socialIconBtn, { backgroundColor: `${palette.gray900}08` }]}>
                  <Music2 size={18} color={palette.gray900} strokeWidth={2} />
                </View>
              )}
              {!!storeEmail && (
                <View style={[s.socialIconBtn, { backgroundColor: '#EA433512' }]}>
                  <Mail size={18} color="#EA4335" strokeWidth={2} />
                </View>
              )}
              {!!merchant.socialLinks?.website && (
                <View style={[s.socialIconBtn, { backgroundColor: `${accent}10` }]}>
                  <Globe size={18} color={accent} strokeWidth={2} />
                </View>
              )}
            </View>
          )}

          {/* ── Contenu ──────────────────────────────────────────── */}
          <View style={s.contentArea}>
            {/* Description */}
            {hasDescription && (
              <LinearGradient
                colors={[theme.bgCard, `${accent}10`, `${accent}18`]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[s.descriptionCard, { backgroundColor: theme.bgCard }]}
              >
                <Text style={[s.sectionTitle, { color: theme.text }]}>
                  {t('storePreview.previewAboutUs')}
                </Text>
                <Text style={[s.descriptionText, { color: theme.textSecondary }]}>
                  {merchant.description}
                </Text>
              </LinearGradient>
            )}

            {/* Badges */}
            {hasBadges && (
              <View style={[s.card, { backgroundColor: theme.bgCard }]}>
                <Text style={[s.sectionTitle, { color: theme.text }]}>
                  {t('storePreview.badgesTitle')}
                </Text>
                <View style={s.badgesWrap}>
                  {draft.badges.map((code) => {
                    const Icon = BADGE_ICONS[code];
                    return (
                      <View
                        key={code}
                        style={[s.badgePill, { backgroundColor: `${accent}12`, borderColor: `${accent}30` }]}
                      >
                        {Icon && <Icon size={14} color={accent} strokeWidth={2} />}
                        <Text
                          style={[s.badgePillText, { color: accent }]}
                          numberOfLines={1}
                        >
                          {t(`storePreview.badges.${code}`)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Galerie */}
            {hasGallery && (
              <View style={s.galleryCard}>
                <Text style={[s.sectionTitle, { color: theme.text, paddingHorizontal: wp(16) }]}>
                  {t('storePreview.galleryTitle')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[s.galleryScrollContent, { paddingHorizontal: wp(16) }]}
                >
                  {draft.gallery.map((url, idx) => (
                    <Pressable
                      key={`${url}-${idx}`}
                      onPress={() => setGalleryIdx(idx)}
                      style={s.galleryThumbBtn}
                    >
                      <ExpoImage
                        source={resolveImageUrl(url)}
                        style={s.galleryThumb}
                        contentFit="cover"
                        cachePolicy="disk"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Horaires */}
            {hasAnyHours && (
              <View style={[s.card, { backgroundColor: theme.bgCard }]}>
                <View style={s.hoursHeader}>
                  <View style={[s.hoursIconBadge, { backgroundColor: `${accent}15` }]}>
                    <Clock size={18} color={accent} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                      {t('storePreview.hoursTitle')}
                    </Text>
                    <Text style={[s.hoursStatus, { color: open ? EMERALD : RED }]}>
                      {open ? t('storePreview.hoursOpen') : t('storePreview.hoursClosed')}
                    </Text>
                  </View>
                </View>
                <View style={s.hoursList}>
                  {WEEK_DAYS.map((d) => {
                    const day = draft.hours[d];
                    const isToday = d === todayKey;
                    const label = day && !day.closed && day.slots?.length
                      ? day.slots.map((sl) => `${sl.open} – ${sl.close}`).join(', ')
                      : t('storePreview.previewDayClosed');
                    return (
                      <View key={d} style={s.hoursRow}>
                        <Text style={[
                          s.hoursDay,
                          {
                            color: isToday ? accent : theme.textSecondary,
                            fontWeight: isToday ? '700' : '500',
                          },
                        ]}>
                          {t(`storePreview.days.${d}`)}
                        </Text>
                        <Text style={[
                          s.hoursValue,
                          {
                            color: isToday ? accent : theme.text,
                            fontWeight: isToday ? '700' : '500',
                          },
                        ]}>
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Fidélité + cadeaux */}
            <LinearGradient
              colors={[theme.bgCard, `${palette.gold}10`, `${palette.gold}18`]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[s.loyaltyCard, { backgroundColor: theme.bgCard }]}
            >
              <View style={s.loyaltyRow}>
                <View style={[s.cardIconBadge, { backgroundColor: `${accent}15` }]}>
                  {merchant.loyaltyType === 'STAMPS'
                    ? <Stamp size={ms(16)} color={accent} strokeWidth={1.5} />
                    : <Coins size={ms(16)} color={accent} strokeWidth={1.5} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardLabel, { color: theme.textMuted }]}>
                    {t('storePreview.previewLoyaltyProgram')}
                  </Text>
                  <Text style={[s.cardValue, { color: theme.text }]} numberOfLines={1}>
                    {loyaltyTypeLabel}
                  </Text>
                </View>
              </View>

              {rewardsList.length > 0 && (
                <>
                  <View style={[s.loyaltyDivider, { backgroundColor: theme.borderLight }]} />
                  <View style={s.rewardsSectionHeader}>
                    <View style={[s.cardIconBadge, { backgroundColor: `${accent}15` }]}>
                      <Gift size={ms(16)} color={accent} strokeWidth={1.5} />
                    </View>
                    <Text style={[s.cardLabel, { color: theme.textMuted, marginBottom: 0 }]}>
                      {t('storePreview.previewRewardsSection')}
                    </Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.rewardsScrollContent}
                  >
                    {rewardsList.map((reward) => (
                      <View
                        key={reward.id}
                        style={[s.rewardCard, { backgroundColor: `${accent}08`, borderColor: `${accent}20` }]}
                      >
                        {reward.imageUrl ? (
                          <ExpoImage
                            source={resolveImageUrl(reward.imageUrl)}
                            style={{ width: ms(48), height: ms(48), borderRadius: ms(10) }}
                            contentFit="cover"
                            cachePolicy="disk"
                            recyclingKey={reward.imageUrl}
                          />
                        ) : (
                          <Gift size={ms(22)} color={accent} strokeWidth={1.5} />
                        )}
                        <Text style={[s.rewardCardTitle, { color: theme.text }]} numberOfLines={2}>
                          {reward.titre}
                        </Text>
                        <View style={[s.rewardCostBadge, { backgroundColor: `${accent}15` }]}>
                          <Text style={[s.rewardCost, { color: accent }]} numberOfLines={1}>
                            {merchant.loyaltyType === 'STAMPS'
                              ? t('storePreview.previewStampsCost', { count: reward.cout })
                              : t('storePreview.previewPointsCost', { count: reward.cout })}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </>
              )}
            </LinearGradient>

            {/* Autres adresses */}
            {showLocations && (
              <LinearGradient
                colors={[theme.bgCard, `${accent}10`, `${accent}18`]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[s.locationsCard, { backgroundColor: theme.bgCard }]}
              >
                <View style={s.locationsHeader}>
                  <View style={[s.cardIconBadge, { backgroundColor: `${palette.gold}12` }]}>
                    <MapPin size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                      {displayedStores.length > 1
                        ? t('storePreview.previewOtherLocationsTitle')
                        : t('storePreview.previewLocationTitle')}
                    </Text>
                    {displayedStores.length > 1 && (
                      <Text style={[s.locationsCount, { color: theme.textMuted }]}>
                        {t('storePreview.previewOtherLocationsCount', { count: displayedStores.length })}
                      </Text>
                    )}
                  </View>
                </View>
                {displayedStores.map((store, idx) => (
                  <View
                    key={store.id}
                    style={[s.storeItem, idx === 0 && { borderTopWidth: 0 }]}
                  >
                    <View style={[s.storeItemDot, { backgroundColor: palette.gold }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.storeItemName, { color: theme.text }]} numberOfLines={1}>
                        {store.nom}
                      </Text>
                      {(store.adresse || store.quartier || store.ville) && (
                        <Text style={[s.storeAddress, { color: theme.textMuted }]} numberOfLines={1}>
                          {store.adresse || [store.quartier, store.ville].filter(Boolean).join(', ')}
                        </Text>
                      )}
                      {!!store.telephone && (
                        <View style={s.storePhoneRow}>
                          <Phone size={13} color={EMERALD} strokeWidth={2} />
                          <Text style={[s.storePhone, { color: EMERALD }]} numberOfLines={1}>
                            {store.telephone}
                          </Text>
                        </View>
                      )}
                    </View>
                    {(store.latitude != null && store.longitude != null) && (
                      <ChevronRight size={16} color={palette.gold} strokeWidth={2} />
                    )}
                  </View>
                ))}
              </LinearGradient>
            )}
          </View>

          <View style={{ height: hp(20) }} />
          <Text style={[s.footerHint, { color: theme.textMuted }]}>
            {t('storePreview.previewFooter')}
          </Text>
          <View style={{ height: hp(80) + insets.bottom }} />
        </ScrollView>

        {/* ── Barre d'action bas (réplique du bouton "Obtenir ma carte") ── */}
        <View style={[
          s.bottomBar,
          {
            backgroundColor: theme.bg,
            borderTopColor: theme.borderLight,
            paddingBottom: insets.bottom || hp(10),
          },
        ]}>
          <View style={[
            s.joinBtn,
            { backgroundColor: palette.violet },
          ]}>
            <Wallet size={18} color="#fff" strokeWidth={2} />
            <Text style={s.joinBtnText} numberOfLines={1}>
              {t('storePreview.previewGetCard')}
            </Text>
          </View>
        </View>

        {/* ── Lightbox galerie ─────────────────────────────────────── */}
        {galleryIdx !== null && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setGalleryIdx(null)}>
            <View style={s.lightbox}>
              <TouchableOpacity
                style={[s.lightboxClose, { top: insets.top + 12 }]}
                onPress={() => setGalleryIdx(null)}
                hitSlop={10}
              >
                <XIcon size={22} color="#fff" />
              </TouchableOpacity>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                contentOffset={{ x: galleryIdx * SCREEN_W, y: 0 }}
              >
                {draft.gallery.map((url, i) => (
                  <View
                    key={i}
                    style={{ width: SCREEN_W, height: '100%', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <ExpoImage
                      source={resolveImageUrl(url)}
                      style={{ width: SCREEN_W, height: '80%' }}
                      contentFit="contain"
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

export default function FichePreviewModal(props: Props) {
  if (!props.visible) return null;
  return <FichePreviewModalInner {...props} />;
}

// ─── Styles (identiques à apps/jitplus/components/merchant/merchantStyles.ts) ─
const s = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingBottom: hp(20) },

  // Hero
  heroSection: {
    position: 'relative',
    height: hp(220),
    marginBottom: hp(40),
  },
  coverImage: { width: '100%', height: '100%' },
  coverFade: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: hp(80),
  },
  floatingHeader: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: wp(16),
  },
  floatingBtn: {
    width: ms(40), height: ms(40), borderRadius: ms(20),
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  previewBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: wp(12), paddingVertical: hp(6),
    borderRadius: 999,
  },
  previewBadgeText: {
    color: '#fff', fontSize: ms(12), fontWeight: '700', letterSpacing: 0.4,
  },
  logoContainer: {
    position: 'absolute', bottom: -ms(40), alignSelf: 'center',
    left: 0, right: 0, alignItems: 'center',
  },
  logoRing: {
    width: ms(92), height: ms(92), borderRadius: ms(46),
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  logo: { width: ms(84), height: ms(84), borderRadius: ms(42) },
  emojiWrap: {
    width: ms(84), height: ms(84), borderRadius: ms(42),
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: ms(38) },

  // Identity
  identitySection: {
    alignItems: 'center',
    paddingHorizontal: wp(20),
    paddingBottom: hp(20),
  },
  merchantName: {
    fontSize: ms(26), fontWeight: '800',
    letterSpacing: -0.5, maxWidth: '92%',
    marginBottom: hp(8), textAlign: 'center',
  },
  tagline: {
    fontSize: ms(14), fontWeight: '500',
    fontStyle: 'italic', textAlign: 'center',
    marginTop: hp(-4), marginBottom: hp(10),
    paddingHorizontal: wp(20), maxWidth: '92%',
  },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    paddingHorizontal: wp(14), paddingVertical: hp(5),
    borderRadius: ms(20), marginBottom: hp(14),
    maxWidth: '95%',
  },
  categoryText: { fontSize: ms(12), fontWeight: '600' },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
  },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    borderRadius: ms(12),
    paddingHorizontal: wp(14), paddingVertical: hp(8),
  },
  statValue: { fontSize: ms(14), fontWeight: '800' },
  statLabel: { fontSize: ms(11), fontWeight: '500' },
  statDivider: { width: 1, height: ms(20), backgroundColor: '#00000010' },

  // Social
  socialRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: wp(14), paddingBottom: hp(16),
  },
  socialIconBtn: {
    width: ms(42), height: ms(42), borderRadius: ms(21),
    alignItems: 'center', justifyContent: 'center',
  },

  // Content
  contentArea: { paddingHorizontal: wp(16), gap: hp(12) },
  sectionTitle: {
    fontSize: ms(16), fontWeight: '700',
    letterSpacing: -0.2, marginBottom: hp(8),
  },

  // Generic card
  card: {
    borderRadius: ms(18), padding: wp(16),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 1 },
    }),
  },

  // Description
  descriptionCard: {
    borderRadius: ms(18), padding: wp(16),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 1 },
    }),
  },
  descriptionText: {
    fontSize: ms(14), lineHeight: ms(22), fontWeight: '400',
  },

  // Badges
  badgesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(8) },
  badgePill: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    paddingHorizontal: wp(12), paddingVertical: hp(6),
    borderRadius: ms(20), borderWidth: 1,
  },
  badgePillText: { fontSize: ms(12), fontWeight: '600' },

  // Hours
  hoursHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: wp(12), marginBottom: hp(10),
  },
  hoursIconBadge: {
    width: ms(36), height: ms(36), borderRadius: ms(12),
    alignItems: 'center', justifyContent: 'center',
  },
  hoursStatus: { fontSize: ms(12), fontWeight: '700', marginTop: hp(2) },
  hoursList: { gap: hp(6) },
  hoursRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: hp(4),
  },
  hoursDay: { fontSize: ms(13) },
  hoursValue: { fontSize: ms(13) },

  // Gallery
  galleryCard: { paddingHorizontal: 0 },
  galleryScrollContent: { gap: wp(8), paddingVertical: hp(4) },
  galleryThumbBtn: { borderRadius: ms(12), overflow: 'hidden' },
  galleryThumb: {
    width: wp(140), height: wp(140),
    borderRadius: ms(12), backgroundColor: '#00000010',
  },

  // Loyalty
  loyaltyCard: {
    borderRadius: ms(18), padding: wp(16),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 1 },
    }),
  },
  loyaltyRow: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  loyaltyDivider: { height: StyleSheet.hairlineWidth, marginVertical: hp(12) },
  cardIconBadge: {
    width: ms(36), height: ms(36), borderRadius: ms(12),
    alignItems: 'center', justifyContent: 'center',
  },
  cardLabel: {
    fontSize: ms(11), fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: hp(4),
  },
  cardValue: { fontSize: ms(14), fontWeight: '700', lineHeight: ms(20) },
  rewardsSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12), marginBottom: hp(8),
  },
  rewardsScrollContent: { gap: wp(10) },
  rewardCard: {
    alignItems: 'center', width: wp(120),
    paddingVertical: hp(12), paddingHorizontal: wp(10),
    borderRadius: ms(14), borderWidth: 1,
  },
  rewardCardTitle: {
    fontSize: ms(12), fontWeight: '700',
    lineHeight: ms(16), textAlign: 'center',
    marginTop: hp(6), marginBottom: hp(6),
  },
  rewardCostBadge: {
    paddingHorizontal: wp(10), paddingVertical: hp(3), borderRadius: ms(8),
  },
  rewardCost: { fontSize: ms(11), fontWeight: '700' },

  // Locations
  locationsCard: {
    borderRadius: ms(18), padding: wp(14),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 1 },
    }),
  },
  locationsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12), marginBottom: hp(6),
  },
  locationsCount: { fontSize: ms(12), fontWeight: '500', marginTop: hp(2) },
  storeItem: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12),
    paddingVertical: hp(12),
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#00000008',
    borderRadius: ms(8), paddingHorizontal: wp(4),
  },
  storeItemDot: { width: ms(8), height: ms(8), borderRadius: ms(4) },
  storeItemName: { fontSize: ms(14), fontWeight: '700', lineHeight: ms(20) },
  storeAddress: { fontSize: ms(12), fontWeight: '400', lineHeight: ms(17), marginTop: hp(2) },
  storePhoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(5), marginTop: hp(4),
  },
  storePhone: { fontSize: ms(12), fontWeight: '600', lineHeight: ms(17) },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: wp(16), paddingTop: hp(10),
  },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: wp(10), paddingVertical: hp(15), borderRadius: ms(16),
    ...Platform.select({
      ios: { shadowColor: palette.violet, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  joinBtnText: {
    color: '#fff', fontSize: ms(15), fontWeight: '700', letterSpacing: 0.2,
  },

  footerHint: {
    fontSize: ms(11), textAlign: 'center', paddingHorizontal: wp(24),
  },

  // Lightbox
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  lightboxClose: {
    position: 'absolute', right: wp(16), zIndex: 20,
    width: ms(38), height: ms(38), borderRadius: ms(19),
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
});
