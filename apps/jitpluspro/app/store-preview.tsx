import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  I18nManager,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Save, Check, Eye, Users, Gift, Coins, Stamp, Palette as PaletteIcon, Shapes, X as XIcon, Tags, Sparkles, Award, Clock, Plus, Trash2, ImagePlus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Star } from 'lucide-react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUpdateMerchantTheme, useUploadMerchantGalleryImage, useUploadMerchantCardBackground, useDeleteMerchantCardBackground } from '@/hooks/useQueryHooks';
import { resolveImageUrl } from '@/utils/imageUrl';
import { getErrorMessage } from '@/utils/error';
import { ms, wp, hp } from '@/utils/responsive';
import { MERCHANT_ICON_MAP, MERCHANT_ICON_SLUGS, getMerchantIconComponent } from '@/utils/merchantIcons';
import { MerchantCategory, MERCHANT_BADGE_CODES, type MerchantBadge, type OpeningHours } from '@/types';
import { getCategoryLabel, getCategoryOptions, CATEGORY_EMOJIS } from '@/constants/categories';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import FichePreviewModal from '@/components/FichePreviewModal';

const haptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_COLOR = palette.violet;

const ICON_COLS = 6;
const ICON_GAP = 8;
const ICON_TILE_SIZE = Math.floor((Dimensions.get('window').width - 32 - (ICON_COLS - 1) * ICON_GAP) / ICON_COLS);

const GALLERY_COLS = 3;
const GALLERY_GAP = 10;
const GALLERY_TILE_SIZE = Math.floor((Dimensions.get('window').width - 32 - (GALLERY_COLS - 1) * GALLERY_GAP) / GALLERY_COLS);
const GALLERY_MAX = 5;

const PRESET_COLORS: { hex: string; nameKey: string }[] = [
  { hex: '#7C3AED', nameKey: 'colorViolet' },
  { hex: '#2563EB', nameKey: 'colorBlue' },
  { hex: '#0EA5E9', nameKey: 'colorSky' },
  { hex: '#10B981', nameKey: 'colorEmerald' },
  { hex: '#F59E0B', nameKey: 'colorAmber' },
  { hex: '#EF4444', nameKey: 'colorRed' },
  { hex: '#EC4899', nameKey: 'colorPink' },
  { hex: '#111827', nameKey: 'colorDark' },
];

const CARD_BG_MAX_BYTES = 5 * 1024 * 1024;

function normalizeColor(input?: string | null): string {
  if (!input) return DEFAULT_COLOR;
  return HEX_RE.test(input) ? input : DEFAULT_COLOR;
}

const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type WeekDayKey = (typeof WEEK_DAYS)[number];
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function emptyHours(): OpeningHours {
  return { mon: { slots: [] }, tue: { slots: [] }, wed: { slots: [] }, thu: { slots: [] }, fri: { slots: [] }, sat: { slots: [] }, sun: { slots: [] } };
}

function normalizeHours(input?: OpeningHours | null): OpeningHours {
  const base = emptyHours();
  if (!input) return base;
  for (const d of WEEK_DAYS) {
    const day = input[d];
    if (!day) continue;
    base[d] = {
      closed: !!day.closed,
      slots: Array.isArray(day.slots) ? day.slots.map((s) => ({ open: s.open, close: s.close })) : [],
    };
  }
  return base;
}

function hoursHasAny(h: OpeningHours): boolean {
  return WEEK_DAYS.some((d) => h[d]?.closed || (h[d]?.slots?.length ?? 0) > 0);
}

function autoFormatTime(value: string): string {
  const digits = value.replace(/[^0-9]/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export default function StorePreviewScreen() {
  const { merchant, loadProfile } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const updateTheme = useUpdateMerchantTheme();
  const uploadGalleryImage = useUploadMerchantGalleryImage();
  const uploadCardBackground = useUploadMerchantCardBackground();
  const deleteCardBackground = useDeleteMerchantCardBackground();

  const isPremium = merchant?.plan === 'PREMIUM';
  const initial = normalizeColor(merchant?.themeColor);
  const initialIcon: string | null = merchant?.themeIcon && MERCHANT_ICON_MAP[merchant.themeIcon] ? merchant.themeIcon : null;
  const primaryCategory = merchant?.categorie;
  const initialSecondary: MerchantCategory[] = Array.isArray(merchant?.secondaryCategories)
    ? (merchant!.secondaryCategories as MerchantCategory[]).filter((c) => c !== primaryCategory)
    : [];
  const initialTagline: string = typeof merchant?.tagline === 'string' ? merchant.tagline : '';
  const initialBadges: MerchantBadge[] = Array.isArray(merchant?.badges)
    ? (merchant!.badges as string[]).filter((b): b is MerchantBadge =>
        (MERCHANT_BADGE_CODES as readonly string[]).includes(b),
      )
    : [];
  const [selected, setSelected] = useState<string>(initial);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(initialIcon);
  const [selectedSecondary, setSelectedSecondary] = useState<MerchantCategory[]>(initialSecondary);
  const [taglineInput, setTaglineInput] = useState<string>(initialTagline);
  const [selectedBadges, setSelectedBadges] = useState<MerchantBadge[]>(initialBadges);
  const initialHours = useMemo(() => normalizeHours(merchant?.openingHours ?? null), [merchant?.openingHours]);
  const [hours, setHours] = useState<OpeningHours>(initialHours);
  const initialCardBg: string | null = typeof merchant?.cardBackgroundUrl === 'string' ? merchant.cardBackgroundUrl : null;
  const initialCardBgColor: string | null = (typeof merchant?.cardBackgroundColor === 'string' && HEX_RE.test(merchant.cardBackgroundColor)) ? merchant.cardBackgroundColor : null;
  const initialCardTextColor: 'LIGHT' | 'DARK' = merchant?.cardTextColor === 'DARK' ? 'DARK' : 'LIGHT';
  const [cardBgUrl, setCardBgUrl] = useState<string | null>(initialCardBg);
  const [cardBgColor, setCardBgColor] = useState<string | null>(initialCardBgColor);
  const [cardTextColor, setCardTextColor] = useState<'LIGHT' | 'DARK'>(initialCardTextColor);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [openSection, setOpenSection] = useState<'fiche' | 'card'>('fiche');
  const toggleSection = useCallback((s: 'fiche' | 'card') => {
    haptic();
    setOpenSection((prev) => (prev === s ? prev : s));
  }, []);

  const accent = useMemo(() => normalizeColor(selected), [selected]);
  const SelectedIconCmp = selectedIcon ? MERCHANT_ICON_MAP[selectedIcon] : null;
  const secondarySorted = useMemo(() => [...selectedSecondary].sort(), [selectedSecondary]);
  const initialSecondarySorted = useMemo(() => [...initialSecondary].sort(), [initialSecondary]);
  const secondaryChanged = secondarySorted.join(',') !== initialSecondarySorted.join(',');
  const badgesSorted = useMemo(() => [...selectedBadges].sort(), [selectedBadges]);
  const initialBadgesSorted = useMemo(() => [...initialBadges].sort(), [initialBadges]);
  const badgesChanged = badgesSorted.join(',') !== initialBadgesSorted.join(',');
  const taglineTrimmed = taglineInput.trim();
  const taglineChanged = taglineTrimmed !== initialTagline.trim();
  const hoursSerialized = useMemo(() => JSON.stringify(hours), [hours]);
  const initialHoursSerialized = useMemo(() => JSON.stringify(initialHours), [initialHours]);
  const hoursChanged = hoursSerialized !== initialHoursSerialized;
  const cardBgChanged = (cardBgUrl ?? null) !== (initialCardBg ?? null);
  const cardBgColorChanged = (cardBgColor ?? null) !== (initialCardBgColor ?? null);
  const cardTextColorChanged = cardTextColor !== initialCardTextColor;
  const hasChanges = useMemo(
    () =>
      accent.toLowerCase() !== initial.toLowerCase() ||
      (selectedIcon ?? null) !== (initialIcon ?? null) ||
      secondaryChanged ||
      badgesChanged ||
      taglineChanged ||
      hoursChanged ||
      cardBgChanged ||
      cardBgColorChanged ||
      cardTextColorChanged,
    [accent, initial, selectedIcon, initialIcon, secondaryChanged, badgesChanged, taglineChanged, hoursChanged, cardBgChanged, cardBgColorChanged, cardTextColorChanged],
  );

  // Resync local state when the underlying merchant identity changes
  // (e.g. re-login, account switch). Avoids stale UI showing a previous shop.
  const merchantId = merchant?.id;
  useEffect(() => {
    setSelected(initial);
    setSelectedIcon(initialIcon);
    setSelectedSecondary(initialSecondary);
    setTaglineInput(initialTagline);
    setSelectedBadges(initialBadges);
    setHours(initialHours);
    setCardBgUrl(initialCardBg);
    setCardBgColor(initialCardBgColor);
    setCardTextColor(initialCardTextColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId]);

  // Guard against losing unsaved edits when navigating away
  const navigation = useNavigation();
  const hasChangesRef = useRef(hasChanges);
  useEffect(() => { hasChangesRef.current = hasChanges; }, [hasChanges]);
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (!hasChangesRef.current || updateTheme.isPending) return;
      e.preventDefault();
      Alert.alert(
        t('storePreview.discardTitle'),
        t('storePreview.discardBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('storePreview.discardConfirm'),
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
    return unsub;
  }, [navigation, t, updateTheme.isPending]);

  const setDayClosed = useCallback((day: WeekDayKey, closed: boolean) => {
    haptic();
    setHours((prev) => ({ ...prev, [day]: { closed, slots: closed ? [] : (prev[day]?.slots ?? []) } }));
  }, []);

  const addSlot = useCallback((day: WeekDayKey) => {
    haptic();
    setHours((prev) => {
      const current = prev[day]?.slots ?? [];
      if (current.length >= 3) return prev;
      return { ...prev, [day]: { closed: false, slots: [...current, { open: '09:00', close: '18:00' }] } };
    });
  }, []);

  const removeSlot = useCallback((day: WeekDayKey, idx: number) => {
    haptic();
    setHours((prev) => {
      const current = prev[day]?.slots ?? [];
      return { ...prev, [day]: { closed: prev[day]?.closed ?? false, slots: current.filter((_, i) => i !== idx) } };
    });
  }, []);

  const updateSlot = useCallback((day: WeekDayKey, idx: number, field: 'open' | 'close', value: string) => {
    setHours((prev) => {
      const current = prev[day]?.slots ?? [];
      const next = current.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
      return { ...prev, [day]: { closed: prev[day]?.closed ?? false, slots: next } };
    });
  }, []);

  const gallery: string[] = Array.isArray(merchant?.gallery) ? (merchant!.gallery as string[]) : [];
  const [galleryDraft, setGalleryDraft] = useState<string[]>(gallery);
  const [galleryBusyUrl, setGalleryBusyUrl] = useState<string | null>(null);

  useEffect(() => {
    const server = Array.isArray(merchant?.gallery) ? (merchant!.gallery as string[]) : [];
    setGalleryDraft(server);
  }, [merchant?.gallery]);

  const galleryFull = galleryDraft.length >= GALLERY_MAX;

  const pickAndUploadGalleryImages = useCallback(async () => {
    if (uploadGalleryImage.isPending) return;
    if (galleryFull) {
      Alert.alert(t('storePreview.galleryTitle'), t('storePreview.galleryMaxReached'));
      return;
    }
    if (!isPremium) {
      Alert.alert(t('storePreview.galleryTitle'), t('storePreview.galleryProOnly'));
      return;
    }
    try {
      const remaining = GALLERY_MAX - galleryDraft.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const assets = result.assets.slice(0, remaining);
      for (const asset of assets) {
        try {
          await uploadGalleryImage.mutateAsync({
            uri: asset.uri,
            mimeType: asset.mimeType,
            merchantName: merchant?.nom,
            fileSize: asset.fileSize,
          });
        } catch (err) {
          Alert.alert(t('common.error'), getErrorMessage(err, t('storePreview.galleryUploadError')));
          break;
        }
      }
      await loadProfile();
      haptic();
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('storePreview.galleryUploadError')));
    }
  }, [uploadGalleryImage, galleryFull, isPremium, galleryDraft.length, merchant?.nom, loadProfile, t]);

  const handleDeleteGalleryImage = useCallback((url: string) => {
    Alert.alert(
      t('storePreview.galleryDeleteTitle'),
      t('storePreview.galleryDeleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const prev = galleryDraft;
            const next = prev.filter((u) => u !== url);
            setGalleryDraft(next);
            setGalleryBusyUrl(url);
            try {
              await updateTheme.mutateAsync({ gallery: next });
              loadProfile().catch(() => {});
              haptic();
            } catch (err) {
              setGalleryDraft(prev);
              Alert.alert(t('common.error'), getErrorMessage(err));
            } finally {
              setGalleryBusyUrl(null);
            }
          },
        },
      ],
    );
  }, [galleryDraft, updateTheme, loadProfile, t]);

  const moveGalleryImage = useCallback(async (from: number, to: number) => {
    if (to < 0 || to >= galleryDraft.length || from === to) return;
    const prev = galleryDraft;
    const next = [...prev];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setGalleryDraft(next);
    haptic();
    try {
      await updateTheme.mutateAsync({ gallery: next });
      loadProfile().catch(() => {});
    } catch (err) {
      setGalleryDraft(prev);
      Alert.alert(t('common.error'), getErrorMessage(err));
    }
  }, [galleryDraft, updateTheme, loadProfile, t]);

  const setAsCoverPhoto = useCallback((idx: number) => {
    if (idx <= 0) return;
    moveGalleryImage(idx, 0);
  }, [moveGalleryImage]);

  const pickAndUploadCardBackground = useCallback(async () => {
    if (uploadCardBackground.isPending) return;
    if (!isPremium) {
      Alert.alert(t('storePreview.cardDesignTitle'), t('storePreview.cardBackgroundProOnly'));
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (typeof asset.fileSize === 'number' && asset.fileSize > CARD_BG_MAX_BYTES) {
        Alert.alert(t('storePreview.cardDesignTitle'), t('storePreview.cardBackgroundTooLarge'));
        return;
      }
      const uploaded = await uploadCardBackground.mutateAsync({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
      });
      setCardBgUrl(uploaded.url);
      await loadProfile();
      haptic();
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err));
    }
  }, [uploadCardBackground, isPremium, loadProfile, t]);

  const removeCardBackground = useCallback(() => {
    if (!cardBgUrl) return;
    Alert.alert(
      t('storePreview.cardBackgroundRemoveTitle'),
      t('storePreview.cardBackgroundRemoveMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const prev = cardBgUrl;
            setCardBgUrl(null);
            try {
              await deleteCardBackground.mutateAsync();
              await loadProfile();
              haptic();
            } catch (err) {
              setCardBgUrl(prev);
              Alert.alert(t('common.error'), getErrorMessage(err));
            }
          },
        },
      ],
    );
  }, [cardBgUrl, deleteCardBackground, loadProfile, t]);

  const handleCardTextColorChange = useCallback((mode: 'LIGHT' | 'DARK') => {
    haptic();
    setCardTextColor(mode);
  }, []);

  const handleCardBgColorChange = useCallback((color: string | null) => {
    haptic();
    setCardBgColor(color);
  }, []);

  const toggleBadge = useCallback((code: MerchantBadge) => {
    haptic();
    setSelectedBadges((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 8) return prev;
      return [...prev, code];
    });
  }, []);

  const toggleSecondary = useCallback((cat: MerchantCategory) => {
    haptic();
    setSelectedSecondary((prev) => {
      if (prev.includes(cat)) return prev.filter((c) => c !== cat);
      if (prev.length >= 3) return prev;
      return [...prev, cat];
    });
  }, []);

  const handlePresetPress = useCallback((color: string) => {
    haptic();
    setSelected(color);
  }, []);

  const handleSave = useCallback(async () => {
    if (!hasChanges) return;
    // Validate hours format
    for (const d of WEEK_DAYS) {
      const day = hours[d];
      if (!day || day.closed || !day.slots) continue;
      for (const s of day.slots) {
        if (!HHMM_RE.test(s.open) || !HHMM_RE.test(s.close)) {
          Alert.alert(t('common.error'), t('storePreview.hoursInvalidFormat'));
          return;
        }
        if (s.open >= s.close) {
          Alert.alert(t('common.error'), t('storePreview.hoursInvalidRange'));
          return;
        }
      }
    }
    try {
      await updateTheme.mutateAsync({
        themeColor: accent,
        themeIcon: selectedIcon,
        secondaryCategories: selectedSecondary,
        tagline: taglineTrimmed.length ? taglineTrimmed : null,
        badges: selectedBadges,
        openingHours: hoursHasAny(hours) ? hours : null,
        cardBackgroundUrl: cardBgUrl,
        cardBackgroundColor: cardBgColor,
        cardTextColor: cardTextColor,
      });
      await loadProfile();
      haptic();
      Alert.alert(t('storePreview.savedTitle'), t('storePreview.savedMsg'));
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err));
    }
  }, [accent, selectedIcon, selectedSecondary, taglineTrimmed, selectedBadges, hours, cardBgUrl, cardBgColor, cardTextColor, hasChanges, updateTheme, loadProfile, t]);

  if (!merchant) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft
            size={22}
            color={theme.text}
            style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1} accessibilityRole="header">
          {t('storePreview.title')}
        </Text>
        <TouchableOpacity
          onPress={() => { haptic(); setPreviewVisible(true); }}
          style={[styles.previewHeaderBtn, { backgroundColor: `${accent}15`, borderColor: `${accent}40` }]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('storePreview.previewBtn')}
        >
          <Eye size={ms(15)} color={accent} strokeWidth={2} />
          <Text style={[styles.previewHeaderBtnText, { color: accent }]} numberOfLines={1}>{t('storePreview.previewBtn')}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.intro, { color: theme.textSecondary }]}>{t('storePreview.intro')}</Text>

        {/* ── GROUP 1: Fiche commerce ── */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => toggleSection('fiche')}
          style={[styles.groupBanner, { backgroundColor: `${accent}1A`, borderColor: `${accent}40` }]}
          accessibilityRole="button"
          accessibilityState={{ expanded: openSection === 'fiche' }}
        >
          <View style={[styles.groupBannerStripe, { backgroundColor: accent }]} />
          <View style={styles.groupBannerContent}>
            <Text style={[styles.groupBannerTitle, { color: theme.text }]}>{t('storePreview.group1Title')}</Text>
            <Text style={[styles.groupBannerSubtitle, { color: theme.textMuted }]}>{t('storePreview.group1Subtitle')}</Text>
          </View>
          {openSection === 'fiche'
            ? <ChevronUp size={ms(18)} color={accent} strokeWidth={2} />
            : <ChevronDown size={ms(18)} color={accent} strokeWidth={2} />}
        </TouchableOpacity>

        {openSection === 'fiche' && (<>
        {/* ── Live preview (mini client card) ── */}
        <View style={[styles.previewCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
          <View style={styles.previewCover}>
            {merchant.coverUrl ? (
              <ExpoImage
                source={resolveImageUrl(merchant.coverUrl)}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <LinearGradient colors={[`${accent}40`, `${accent}10`, theme.bgCard]} style={StyleSheet.absoluteFillObject} />
            )}
            <LinearGradient colors={['transparent', theme.bgCard]} style={[StyleSheet.absoluteFillObject, { top: '40%' }]} />
            <View style={[styles.previewLogoRing, { backgroundColor: theme.bgCard, borderColor: theme.bgCard }]}>
              {merchant.logoUrl ? (
                <ExpoImage
                  source={resolveImageUrl(merchant.logoUrl)}
                  style={styles.previewLogo}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : SelectedIconCmp ? (
                <View style={[styles.previewLogo, { backgroundColor: `${accent}20`, justifyContent: 'center', alignItems: 'center' }]}>
                  <SelectedIconCmp size={ms(30)} color={accent} strokeWidth={1.75} />
                </View>
              ) : (
                <View style={[styles.previewLogo, { backgroundColor: `${accent}20`, justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ fontSize: 28 }}>🏪</Text>
                </View>
              )}
              {merchant.logoUrl && SelectedIconCmp && (
                <View style={[styles.previewIconBadge, { backgroundColor: accent, borderColor: theme.bgCard }]}>
                  <SelectedIconCmp size={ms(14)} color="#FFFFFF" strokeWidth={2} />
                </View>
              )}
            </View>
          </View>

          <View style={styles.previewBody}>
            <Text style={[styles.previewName, { color: theme.text }]} numberOfLines={1}>{merchant.nom}</Text>
            <View style={[styles.previewBadge, { backgroundColor: `${accent}15` }]}>
              <Text style={[styles.previewBadgeText, { color: accent }]} numberOfLines={1}>
                {[merchant.categorie, ...selectedSecondary].map((c) => getCategoryLabel(c as MerchantCategory)).join(' · ')}
              </Text>
            </View>

            <View style={styles.previewStatsRow}>
              <View style={[styles.previewStatChip, { backgroundColor: theme.bgElevated }]}>
                <Eye size={13} color={accent} strokeWidth={2} />
                <Text style={[styles.previewStatText, { color: theme.text }]}>0</Text>
              </View>
              <View style={[styles.previewStatChip, { backgroundColor: theme.bgElevated }]}>
                <Users size={13} color={accent} strokeWidth={2} />
                <Text style={[styles.previewStatText, { color: theme.text }]}>0</Text>
              </View>
            </View>

            <View style={[styles.previewRewardRow, { backgroundColor: `${accent}08`, borderColor: `${accent}20` }]}>
              <View style={[styles.previewRewardIcon, { backgroundColor: `${accent}15` }]}>
                {merchant.loyaltyType === 'STAMPS'
                  ? <Stamp size={14} color={accent} strokeWidth={1.5} />
                  : <Coins size={14} color={accent} strokeWidth={1.5} />}
              </View>
              <Text style={[styles.previewRewardText, { color: theme.text }]} numberOfLines={1}>
                {merchant.loyaltyType === 'STAMPS' ? t('storePreview.stampCard') : t('storePreview.pointsAccumulation')}
              </Text>
              <Gift size={14} color={accent} strokeWidth={1.5} />
            </View>
          </View>
        </View>

        {/* ── Preset palette ── */}
        <View style={styles.sectionHeaderRow}>
          <PaletteIcon size={ms(16)} color={accent} strokeWidth={1.5} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('storePreview.choosePresets')}</Text>
        </View>

        <View style={styles.swatchGrid}>
          {PRESET_COLORS.map(({ hex }) => {
            const isActive = hex.toLowerCase() === accent.toLowerCase();
            return (
              <TouchableOpacity
                key={hex}
                onPress={() => handlePresetPress(hex)}
                activeOpacity={0.85}
                style={[
                  styles.swatch,
                  { backgroundColor: hex, borderColor: isActive ? theme.text : 'transparent' },
                ]}
                accessibilityRole="button"
                accessibilityLabel={hex}
                accessibilityState={{ selected: isActive }}
              >
                {isActive && <Check size={18} color="#FFFFFF" strokeWidth={3} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Icon picker ── */}
        <View style={styles.sectionHeaderRow}>
          <Shapes size={ms(16)} color={accent} strokeWidth={1.5} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('storePreview.chooseIcon')}</Text>
        </View>
        <Text style={[styles.helperText, { color: theme.textMuted, marginBottom: 10 }]}>{t('storePreview.iconHint')}</Text>

        <View style={styles.iconGrid}>
          <TouchableOpacity
            onPress={() => { haptic(); setSelectedIcon(null); }}
            activeOpacity={0.85}
            style={[
              styles.iconTile,
              { backgroundColor: theme.bgCard, borderColor: !selectedIcon ? accent : theme.borderLight },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('storePreview.noIcon')}
            accessibilityState={{ selected: !selectedIcon }}
          >
            <XIcon size={ms(18)} color={theme.textMuted} strokeWidth={1.75} />
          </TouchableOpacity>

          {MERCHANT_ICON_SLUGS.map((slug) => {
            const Cmp = MERCHANT_ICON_MAP[slug];
            const isActive = selectedIcon === slug;
            return (
              <TouchableOpacity
                key={slug}
                onPress={() => { haptic(); setSelectedIcon(slug); }}
                activeOpacity={0.85}
                style={[
                  styles.iconTile,
                  {
                    backgroundColor: isActive ? `${accent}15` : theme.bgCard,
                    borderColor: isActive ? accent : theme.borderLight,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={slug}
                accessibilityState={{ selected: isActive }}
              >
                <Cmp size={ms(18)} color={isActive ? accent : theme.text} strokeWidth={1.75} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Secondary categories ── */}
        <View style={styles.sectionHeaderRow}>
          <Tags size={ms(16)} color={accent} strokeWidth={1.5} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('storePreview.secondaryCategoriesTitle')}</Text>
        </View>
        <Text style={[styles.helperText, { color: theme.textMuted, marginBottom: 10 }]}>
          {t('storePreview.secondaryCategoriesHint', { max: 3 })}
        </Text>

        <View style={styles.categoryChipsRow}>
          {getCategoryOptions()
            .filter((opt) => opt.value !== merchant.categorie)
            .map((opt) => {
              const isActive = selectedSecondary.includes(opt.value);
              const disabled = !isActive && selectedSecondary.length >= 3;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => toggleSecondary(opt.value)}
                  disabled={disabled}
                  activeOpacity={0.85}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: isActive ? `${accent}15` : theme.bgCard,
                      borderColor: isActive ? accent : theme.borderLight,
                      opacity: disabled ? 0.4 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={{ fontSize: ms(13) }}>{CATEGORY_EMOJIS[opt.value] ?? '🏷️'}</Text>
                  <Text style={[styles.categoryChipText, { color: isActive ? accent : theme.text }]} numberOfLines={1}>
                    {opt.label}
                  </Text>
                  {isActive && <Check size={ms(13)} color={accent} strokeWidth={2.5} />}
                </TouchableOpacity>
              );
            })}
        </View>

        {/* ── Tagline (slogan court) ── */}
        <View style={styles.sectionHeaderRow}>
          <Sparkles size={ms(16)} color={accent} strokeWidth={1.5} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('storePreview.taglineTitle')}</Text>
        </View>
        <Text style={[styles.helperText, { color: theme.textMuted, marginBottom: 10 }]}>
          {t('storePreview.taglineHint')}
        </Text>
        <View style={[styles.taglineWrap, { borderColor: theme.borderLight, backgroundColor: theme.bgCard }]}>
          <TextInput
            value={taglineInput}
            onChangeText={(v) => setTaglineInput(v.slice(0, 120))}
            placeholder={t('storePreview.taglinePlaceholder')}
            placeholderTextColor={theme.textMuted}
            maxLength={120}
            multiline
            style={[styles.taglineInput, { color: theme.text }]}
            accessibilityLabel={t('storePreview.taglineTitle')}
          />
          <Text style={[styles.taglineCounter, { color: theme.textMuted }]}>
            {taglineInput.length}/120
          </Text>
        </View>

        {/* ── Badges ── */}
        <View style={styles.sectionHeaderRow}>
          <Award size={ms(16)} color={accent} strokeWidth={1.5} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('storePreview.badgesTitle')}</Text>
        </View>
        <Text style={[styles.helperText, { color: theme.textMuted, marginBottom: 10 }]}>
          {t('storePreview.badgesHint', { max: 8 })}
        </Text>
        <View style={styles.categoryChipsRow}>
          {MERCHANT_BADGE_CODES.map((code) => {
            const isActive = selectedBadges.includes(code);
            const disabled = !isActive && selectedBadges.length >= 8;
            return (
              <TouchableOpacity
                key={code}
                onPress={() => toggleBadge(code)}
                disabled={disabled}
                activeOpacity={0.85}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: isActive ? `${accent}15` : theme.bgCard,
                    borderColor: isActive ? accent : theme.borderLight,
                    opacity: disabled ? 0.4 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t(`storePreview.badges.${code}` as never)}
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.categoryChipText, { color: isActive ? accent : theme.text }]} numberOfLines={1}>
                  {t(`storePreview.badges.${code}` as never)}
                </Text>
                {isActive && <Check size={ms(13)} color={accent} strokeWidth={2.5} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Opening Hours ── */}
        <View style={styles.sectionHeaderRow}>
          <Clock size={ms(16)} color={accent} strokeWidth={1.5} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('storePreview.hoursTitle')}</Text>
        </View>
        <Text style={[styles.helperText, { color: theme.textMuted, marginBottom: 10 }]}>
          {t('storePreview.hoursHint')}
        </Text>
        <View style={[styles.hoursContainer, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
          {WEEK_DAYS.map((day, idx) => {
            const dayData = hours[day];
            const isClosed = !!dayData?.closed;
            const slots = dayData?.slots ?? [];
            return (
              <View key={day} style={[styles.hoursDayBlock, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.borderLight }]}>
                <View style={styles.hoursDayHeader}>
                  <Text style={[styles.hoursDayLabel, { color: theme.text }]}>{t(`storePreview.days.${day}` as never)}</Text>
                  <TouchableOpacity
                    onPress={() => setDayClosed(day, !isClosed)}
                    style={[styles.hoursToggle, { backgroundColor: isClosed ? '#ef444415' : `${accent}15`, borderColor: isClosed ? '#ef4444' : accent }]}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: !isClosed }}
                  >
                    <Text style={[styles.hoursToggleText, { color: isClosed ? '#ef4444' : accent }]}>
                      {isClosed ? t('storePreview.hoursClosed') : t('storePreview.hoursOpen')}
                    </Text>
                  </TouchableOpacity>
                </View>
                {!isClosed && (
                  <View style={styles.hoursSlots}>
                    {slots.map((slot, sIdx) => (
                      <View key={sIdx} style={styles.hoursSlotRow}>
                        <TextInput
                          value={slot.open}
                          onChangeText={(v) => updateSlot(day, sIdx, 'open', autoFormatTime(v))}
                          placeholder="09:00"
                          placeholderTextColor={theme.textMuted}
                          maxLength={5}
                          keyboardType="numbers-and-punctuation"
                          style={[styles.hoursTimeInput, { color: theme.text, borderColor: theme.borderLight, backgroundColor: theme.bg }]}
                        />
                        <Text style={[styles.hoursTimeSep, { color: theme.textMuted }]}>–</Text>
                        <TextInput
                          value={slot.close}
                          onChangeText={(v) => updateSlot(day, sIdx, 'close', autoFormatTime(v))}
                          placeholder="18:00"
                          placeholderTextColor={theme.textMuted}
                          maxLength={5}
                          keyboardType="numbers-and-punctuation"
                          style={[styles.hoursTimeInput, { color: theme.text, borderColor: theme.borderLight, backgroundColor: theme.bg }]}
                        />
                        <TouchableOpacity onPress={() => removeSlot(day, sIdx)} style={styles.hoursSlotRemove} hitSlop={8}>
                          <Trash2 size={ms(16)} color="#ef4444" strokeWidth={2} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {slots.length < 3 && (
                      <TouchableOpacity
                        onPress={() => addSlot(day)}
                        style={[styles.hoursAddBtn, { borderColor: accent }]}
                      >
                        <Plus size={ms(14)} color={accent} strokeWidth={2} />
                        <Text style={[styles.hoursAddText, { color: accent }]}>{t('storePreview.hoursAddSlot')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── Gallery ── */}
        <View style={styles.sectionHeaderRow}>
          <ImagePlus size={ms(16)} color={accent} strokeWidth={1.5} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t('storePreview.galleryTitle')}
          </Text>
          <View style={[styles.galleryCountPill, { backgroundColor: `${accent}15`, borderColor: `${accent}30` }]}>
            <Text style={[styles.galleryCountText, { color: accent }]}>{galleryDraft.length}/{GALLERY_MAX}</Text>
          </View>
        </View>
        <Text style={[styles.helperText, { color: theme.textMuted, marginBottom: 10 }]}>
          {t('storePreview.galleryHint')}
        </Text>
        <View style={styles.galleryGrid}>
          {galleryDraft.map((url, idx) => {
            const isBusy = galleryBusyUrl === url;
            const isCover = idx === 0;
            return (
              <View key={`${url}_${idx}`} style={[styles.galleryThumbWrap, { borderColor: isCover ? accent : theme.borderLight, backgroundColor: theme.bgCard, borderWidth: isCover ? 2 : StyleSheet.hairlineWidth }]}>
                <ExpoImage source={resolveImageUrl(url)} style={styles.galleryThumb} contentFit="cover" />

                {/* Position pill */}
                <View style={styles.galleryPosPill}>
                  <Text style={styles.galleryPosText}>{idx + 1}</Text>
                </View>

                {/* Cover badge */}
                {isCover && (
                  <View style={[styles.galleryCoverBadge, { backgroundColor: accent }]}>
                    <Star size={ms(10)} color="#fff" strokeWidth={2.5} fill="#fff" />
                    <Text style={styles.galleryCoverText} numberOfLines={1}>{t('storePreview.galleryCover')}</Text>
                  </View>
                )}

                {/* Remove button */}
                <TouchableOpacity
                  onPress={() => handleDeleteGalleryImage(url)}
                  disabled={isBusy || updateTheme.isPending}
                  style={styles.galleryRemoveBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('storePreview.galleryDeleteTitle')}
                >
                  <XIcon size={ms(14)} color="#fff" strokeWidth={2.5} />
                </TouchableOpacity>

                {/* Bottom controls: set-as-cover + reorder */}
                <View style={styles.galleryOrderRow}>
                  {!isCover ? (
                    <TouchableOpacity
                      onPress={() => setAsCoverPhoto(idx)}
                      disabled={updateTheme.isPending}
                      style={styles.galleryOrderBtn}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={t('storePreview.gallerySetCover')}
                    >
                      <Star size={ms(12)} color="#fff" strokeWidth={2.5} />
                    </TouchableOpacity>
                  ) : <View style={{ width: 24 }} />}
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <TouchableOpacity
                      onPress={() => moveGalleryImage(idx, idx - 1)}
                      disabled={idx === 0 || updateTheme.isPending}
                      style={[styles.galleryOrderBtn, idx === 0 && { opacity: 0.3 }]}
                      hitSlop={6}
                    >
                      <ChevronLeft size={ms(14)} color="#fff" strokeWidth={2.5} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveGalleryImage(idx, idx + 1)}
                      disabled={idx === galleryDraft.length - 1 || updateTheme.isPending}
                      style={[styles.galleryOrderBtn, idx === galleryDraft.length - 1 && { opacity: 0.3 }]}
                      hitSlop={6}
                    >
                      <ChevronRight size={ms(14)} color="#fff" strokeWidth={2.5} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Busy overlay */}
                {isBusy && (
                  <View style={styles.galleryBusyOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
              </View>
            );
          })}
          {galleryDraft.length < GALLERY_MAX && (
            <TouchableOpacity
              onPress={pickAndUploadGalleryImages}
              disabled={uploadGalleryImage.isPending}
              style={[styles.galleryAddBtn, { borderColor: accent, backgroundColor: `${accent}10` }]}
              accessibilityRole="button"
              accessibilityLabel={t('storePreview.galleryAddPhoto')}
            >
              {uploadGalleryImage.isPending ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <>
                  <View style={[styles.galleryAddIconCircle, { backgroundColor: accent }]}>
                    <Plus size={ms(18)} color="#fff" strokeWidth={2.5} />
                  </View>
                  <Text style={[styles.galleryAddText, { color: accent }]} numberOfLines={2}>
                    {t('storePreview.galleryAddPhoto')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
        </>)}

        {/* ── GROUP 2: Carte de fidélité ── */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => toggleSection('card')}
          style={[styles.groupBanner, { backgroundColor: `${accent}1A`, borderColor: `${accent}40` }]}
          accessibilityRole="button"
          accessibilityState={{ expanded: openSection === 'card' }}
        >
          <View style={[styles.groupBannerStripe, { backgroundColor: accent }]} />
          <View style={styles.groupBannerContent}>
            <Text style={[styles.groupBannerTitle, { color: theme.text }]}>{t('storePreview.group2Title')}</Text>
            <Text style={[styles.groupBannerSubtitle, { color: theme.textMuted }]}>{t('storePreview.group2Subtitle')}</Text>
          </View>
          {openSection === 'card'
            ? <ChevronUp size={ms(18)} color={accent} strokeWidth={2} />
            : <ChevronDown size={ms(18)} color={accent} strokeWidth={2} />}
        </TouchableOpacity>

        {openSection === 'card' && (<>
        {/* Live mini-preview of the loyalty card — matches client CardItem layout */}
        {(() => {
          const hasBg = !!cardBgUrl || !!cardBgColor;
          const overlayColor = hasBg
            ? (cardTextColor === 'DARK' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)')
            : 'transparent';
          const textPrimary = hasBg
            ? (cardTextColor === 'DARK' ? '#111827' : '#F9FAFB')
            : theme.text;
          const textSecondary = hasBg
            ? (cardTextColor === 'DARK' ? '#374151' : '#E5E7EB')
            : theme.textMuted;
          const accentDark = accent === palette.violet ? palette.violetDark : accent;
          const isStamps = merchant?.loyaltyType === 'STAMPS';
          const sampleGoal = 10;
          const sampleEarned = 3;
          const samplePct = 35;
          const categoryEmoji = merchant?.categorie ? (CATEGORY_EMOJIS[merchant.categorie] ?? '🏷️') : '🏷️';
          return (
            <View style={[styles.cardPreviewItem, { backgroundColor: cardBgColor ?? theme.bgCard }]}>
              {cardBgUrl ? (
                <>
                  <ExpoImage
                    source={resolveImageUrl(cardBgUrl)}
                    style={StyleSheet.absoluteFillObject as any}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <View pointerEvents="none" style={[StyleSheet.absoluteFillObject as any, { backgroundColor: overlayColor }]} />
                </>
              ) : cardBgColor ? (
                <View pointerEvents="none" style={[StyleSheet.absoluteFillObject as any, { backgroundColor: overlayColor }]} />
              ) : null}
              <LinearGradient
                colors={[accentDark, accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardPreviewAccentBar}
              />
              <View style={[styles.cardPreviewIcon, { backgroundColor: theme.primaryBg }]}>
                {merchant?.logoUrl ? (
                  <ExpoImage
                    source={resolveImageUrl(merchant.logoUrl)}
                    style={styles.cardPreviewLogo}
                    contentFit="cover"
                    cachePolicy="disk"
                  />
                ) : (
                  <Text style={styles.cardPreviewEmoji}>{categoryEmoji}</Text>
                )}
              </View>
              <View style={styles.cardPreviewInfo}>
                <View style={styles.cardPreviewNameRow}>
                  <Text style={[styles.cardPreviewName, { color: textPrimary }]} numberOfLines={1}>
                    {merchant?.nomBoutique || merchant?.nom || 'Commerce'}
                  </Text>
                </View>
                {isStamps ? (
                  <View style={styles.cardPreviewStampsGrid}>
                    {Array.from({ length: sampleGoal }, (_, i) => {
                      const filled = i < sampleEarned;
                      if (merchant?.logoUrl) {
                        return (
                          <View
                            key={`stamp-${i}`}
                            style={[
                              styles.cardPreviewStampDot,
                              filled
                                ? { borderColor: palette.violet, backgroundColor: theme.bgElevated }
                                : { borderColor: theme.borderLight, backgroundColor: theme.bgCard },
                            ]}
                          >
                            <ExpoImage
                              source={resolveImageUrl(merchant.logoUrl)}
                              style={{ width: '100%', height: '100%', borderRadius: ms(13), opacity: filled ? 1 : 0.18 }}
                              contentFit="cover"
                              cachePolicy="disk"
                            />
                          </View>
                        );
                      }
                      return (
                        <View
                          key={`stamp-${i}`}
                          style={[
                            styles.cardPreviewStampDot,
                            filled
                              ? { backgroundColor: palette.violet, borderColor: palette.violet }
                              : { backgroundColor: 'transparent', borderColor: theme.borderLight },
                          ]}
                        >
                          {filled && <Text style={styles.cardPreviewStampCheck}>✓</Text>}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <>
                    <View style={styles.cardPreviewPointsRow}>
                      <View style={styles.cardPreviewPointsLeft}>
                        <Coins size={ms(12)} color={palette.gold} strokeWidth={1.5} />
                        <Text style={[styles.cardPreviewPointsValue, { color: hasBg ? textPrimary : accent }]}>120 pts</Text>
                      </View>
                      <Text style={[styles.cardPreviewPct, { color: textSecondary }]}>{samplePct}%</Text>
                    </View>
                    <View style={[styles.cardPreviewBar, { backgroundColor: hasBg ? 'rgba(255,255,255,0.25)' : theme.borderLight }]}>
                      <View style={[styles.cardPreviewBarFill, { width: `${samplePct}%`, backgroundColor: accent }]} />
                    </View>
                  </>
                )}
                <Text style={[styles.cardPreviewLastScan, { color: textSecondary }]} numberOfLines={1}>
                  {t('storePreview.cardDesignPreviewSub')}
                </Text>
              </View>
              <ChevronRight size={ms(18)} color={textSecondary} strokeWidth={2} />
            </View>
          );
        })()}

        {/* Background picker */}
        <View style={styles.cardBgRow}>
          <TouchableOpacity
            onPress={pickAndUploadCardBackground}
            disabled={uploadCardBackground.isPending}
            style={[styles.cardBgPickBtn, { borderColor: accent, backgroundColor: `${accent}10` }]}
            accessibilityRole="button"
            accessibilityLabel={cardBgUrl ? t('storePreview.cardBackgroundReplace') : t('storePreview.cardBackgroundAdd')}
          >
            {uploadCardBackground.isPending ? (
              <ActivityIndicator size="small" color={accent} />
            ) : (
              <>
                <View style={[styles.cardBgPickIconCircle, { backgroundColor: accent }]}>
                  <ImagePlus size={ms(16)} color="#fff" strokeWidth={2.5} />
                </View>
                <Text style={[styles.cardBgPickText, { color: accent }]} numberOfLines={1}>
                  {cardBgUrl ? t('storePreview.cardBackgroundReplace') : t('storePreview.cardBackgroundAdd')}
                </Text>
              </>
            )}
          </TouchableOpacity>
          {cardBgUrl ? (
            <TouchableOpacity
              onPress={removeCardBackground}
              disabled={uploadCardBackground.isPending}
              style={[styles.cardBgRemoveBtn, { borderColor: theme.borderLight }]}
              accessibilityRole="button"
              accessibilityLabel={t('storePreview.cardBackgroundRemove')}
            >
              <Trash2 size={ms(14)} color="#ef4444" strokeWidth={2} />
              <Text style={[styles.cardBgRemoveText, { color: '#ef4444' }]}>{t('storePreview.cardBackgroundRemove')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Solid background color presets (used when no image is set) */}
        <Text style={[styles.cardBgSubLabel, { color: theme.text }]}>{t('storePreview.cardColorTitle')}</Text>
        <Text style={[styles.helperText, { color: theme.textMuted, marginBottom: 8 }]}>
          {t('storePreview.cardColorHint')}
        </Text>
        <View style={styles.cardColorRow}>
          <TouchableOpacity
            onPress={() => handleCardBgColorChange(null)}
            disabled={!!cardBgUrl}
            style={[
              styles.cardColorSwatch,
              {
                borderColor: cardBgColor === null ? accent : theme.borderLight,
                backgroundColor: theme.bgCard,
                opacity: cardBgUrl ? 0.4 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('storePreview.cardColorNone')}
            accessibilityState={{ selected: cardBgColor === null }}
          >
            <XIcon size={ms(16)} color={theme.textMuted} strokeWidth={2} />
          </TouchableOpacity>
          {PRESET_COLORS.map(({ hex, nameKey }) => {
            const active = cardBgColor?.toLowerCase() === hex.toLowerCase();
            const name = t(`storePreview.${nameKey}`);
            return (
              <TouchableOpacity
                key={hex}
                onPress={() => handleCardBgColorChange(hex)}
                disabled={!!cardBgUrl}
                style={[
                  styles.cardColorSwatch,
                  {
                    borderColor: active ? accent : 'transparent',
                    backgroundColor: hex,
                    opacity: cardBgUrl ? 0.4 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={name}
                accessibilityState={{ selected: active }}
              >
                {active ? <Check size={ms(14)} color="#fff" strokeWidth={3} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Text color toggle */}
        <Text style={[styles.cardBgSubLabel, { color: theme.text }]}>{t('storePreview.cardTextColorTitle')}</Text>
        <Text style={[styles.helperText, { color: theme.textMuted, marginBottom: 8 }]}>
          {t('storePreview.cardTextColorHint')}
        </Text>
        <View style={styles.cardTextColorRow}>
          {(['LIGHT', 'DARK'] as const).map((mode) => {
            const active = cardTextColor === mode;
            return (
              <TouchableOpacity
                key={mode}
                onPress={() => handleCardTextColorChange(mode)}
                style={[
                  styles.cardTextColorPill,
                  {
                    borderColor: active ? accent : theme.borderLight,
                    backgroundColor: active ? `${accent}15` : theme.bgCard,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View
                  style={[
                    styles.cardTextColorSwatch,
                    {
                      backgroundColor: mode === 'LIGHT' ? '#F9FAFB' : '#111827',
                      borderColor: theme.borderLight,
                    },
                  ]}
                />
                <Text style={[styles.cardTextColorLabel, { color: active ? accent : theme.text }]}>
                  {mode === 'LIGHT' ? t('storePreview.cardTextColorLight') : t('storePreview.cardTextColorDark')}
                </Text>
                {active ? <Check size={ms(14)} color={accent} strokeWidth={2.5} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
        </>)}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Sticky save bar ── */}
      <View style={[styles.saveBar, { backgroundColor: theme.bgCard, borderTopColor: theme.borderLight, paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!hasChanges || updateTheme.isPending}
          style={[
            styles.saveBtn,
            { backgroundColor: hasChanges ? accent : theme.borderLight },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('storePreview.save')}
        >
          {updateTheme.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Save size={18} color={hasChanges ? '#FFFFFF' : theme.textMuted} strokeWidth={2} />
              <Text style={[styles.saveBtnText, { color: hasChanges ? '#FFFFFF' : theme.textMuted }]}>
                {t('storePreview.save')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <FichePreviewModal
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        merchant={merchant}
        draft={{
          accent,
          iconSlug: selectedIcon,
          tagline: taglineInput,
          badges: selectedBadges,
          hours,
          gallery: galleryDraft,
          secondary: selectedSecondary,
        }}
        theme={theme}
        t={t}
        getCategoryLabel={(c) => getCategoryLabel(c as MerchantCategory)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: ms(18), fontWeight: '700', flex: 1 },
  previewHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  previewHeaderBtnText: { fontSize: ms(12), fontWeight: '700' },
  intro: { fontSize: ms(13), paddingHorizontal: 16, marginBottom: 12, lineHeight: ms(18) },

  // Preview card
  previewCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 24,
  },
  previewCover: {
    height: hp(140),
    width: '100%',
    backgroundColor: '#0001',
  },
  previewLogoRing: {
    position: 'absolute',
    bottom: -28,
    left: 16,
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    padding: 3,
  },
  previewLogo: { width: '100%', height: '100%', borderRadius: 33 },
  previewIconBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewBody: { padding: 16, paddingTop: 38 },
  previewName: { fontSize: ms(17), fontWeight: '700', marginBottom: 6 },
  previewBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  previewBadgeText: { fontSize: ms(11), fontWeight: '600' },
  previewStatsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  previewStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  previewStatText: { fontSize: ms(12), fontWeight: '600' },
  previewRewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewRewardIcon: {
    width: 26, height: 26, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
  },
  previewRewardText: { flex: 1, fontSize: ms(12), fontWeight: '600' },

  // Sections
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
    marginTop: 8,
  },
  sectionTitle: { fontSize: ms(14), fontWeight: '700' },

  // Swatches
  swatchGrid: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  swatch: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Icon picker
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ICON_GAP,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  iconTile: {
    width: ICON_TILE_SIZE,
    height: ICON_TILE_SIZE,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Secondary categories chips
  categoryChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  categoryChipText: { fontSize: ms(13), fontWeight: '600' },

  // Tagline input
  taglineWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  taglineInput: {
    fontSize: ms(15),
    minHeight: 56,
    textAlignVertical: 'top',
    padding: 0,
  },
  taglineCounter: {
    fontSize: ms(11),
    textAlign: 'right',
    marginTop: 4,
  },

  // Opening hours
  hoursContainer: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  hoursDayBlock: { paddingVertical: 12 },
  hoursDayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hoursDayLabel: { fontSize: ms(14), fontWeight: '700' },
  hoursToggle: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  hoursToggleText: { fontSize: ms(12), fontWeight: '700' },
  hoursSlots: { marginTop: 8, gap: 8 },
  hoursSlotRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hoursTimeInput: {
    width: 70,
    fontSize: ms(14),
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hoursTimeSep: { fontSize: ms(14), fontWeight: '700' },
  hoursSlotRemove: { padding: 6, marginLeft: 'auto' },
  hoursAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  hoursAddText: { fontSize: ms(12), fontWeight: '700' },

  // Gallery
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: GALLERY_GAP,
  },
  galleryCountPill: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  galleryCountText: { fontSize: ms(11), fontWeight: '700' },
  galleryThumbWrap: {
    width: GALLERY_TILE_SIZE,
    height: GALLERY_TILE_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  galleryThumb: { width: '100%', height: '100%' },
  galleryPosPill: {
    position: 'absolute',
    top: 4,
    left: 4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryPosText: { color: '#fff', fontSize: ms(11), fontWeight: '700' },
  galleryCoverBadge: {
    position: 'absolute',
    top: 30,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  galleryCoverText: { color: '#fff', fontSize: ms(9), fontWeight: '800', letterSpacing: 0.3 },
  galleryBusyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryOrderRow: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  galleryOrderBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryAddBtn: {
    width: GALLERY_TILE_SIZE,
    height: GALLERY_TILE_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 6,
  },
  galleryAddIconCircle: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  galleryAddText: { fontSize: ms(11), fontWeight: '700', textAlign: 'center' },

  helperText: { fontSize: ms(11), paddingHorizontal: 16, marginTop: 6 },

  // Reset
  resetBtn: {
    alignSelf: 'center',
    marginTop: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  resetText: { fontSize: ms(13), fontWeight: '600' },

  // Sticky save bar
  saveBar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveBtnText: { fontSize: ms(15), fontWeight: '700' },
  // ── Card design (mirrors apps/jitplus CardItem styles 1:1) ──
  cardPreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: wp(16),
    padding: wp(14),
    paddingLeft: wp(10),
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardPreviewAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: ms(4),
    borderTopLeftRadius: wp(16),
    borderBottomLeftRadius: wp(16),
  },
  cardPreviewIcon: {
    width: ms(50),
    height: ms(50),
    borderRadius: ms(14),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: wp(4),
    marginRight: wp(14),
    overflow: 'hidden',
  },
  cardPreviewLogo: { width: ms(50), height: ms(50), borderRadius: ms(14) },
  cardPreviewEmoji: { fontSize: ms(22) },
  cardPreviewInfo: { flex: 1 },
  cardPreviewNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: hp(4),
  },
  cardPreviewName: { fontSize: ms(15), fontWeight: '700', letterSpacing: -0.2, flex: 1 },
  cardPreviewStampsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: wp(4),
    marginTop: hp(4),
    marginBottom: hp(4),
  },
  cardPreviewStampDot: {
    width: ms(26),
    height: ms(26),
    borderRadius: ms(13),
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardPreviewStampCheck: { color: '#fff', fontSize: ms(12), fontWeight: '700' },
  cardPreviewPointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: hp(4),
    marginBottom: hp(5),
  },
  cardPreviewPointsLeft: { flexDirection: 'row', alignItems: 'center', gap: wp(4) },
  cardPreviewPointsValue: { fontSize: ms(13), fontWeight: '700' },
  cardPreviewPct: { fontSize: ms(11), fontWeight: '600' },
  cardPreviewBar: { height: ms(7), borderRadius: ms(4), overflow: 'hidden', marginBottom: hp(4) },
  cardPreviewBarFill: { height: '100%', borderRadius: ms(4) },
  cardPreviewLastScan: { fontSize: ms(11), fontWeight: '500', marginTop: hp(3), opacity: 0.75 },
  cardBgRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  cardColorRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  groupBanner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginTop: 20,
    marginBottom: 12,
  },
  groupBannerStripe: {
    width: 4,
    borderRadius: 2,
  },
  groupBannerContent: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  groupBannerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  groupBannerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardColorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBgPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  cardBgPickIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBgPickText: { fontSize: ms(13), fontWeight: '700' },
  cardBgRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardBgRemoveText: { fontSize: ms(12), fontWeight: '700' },
  cardBgSubLabel: { fontSize: ms(13), fontWeight: '700', marginBottom: 4 },
  cardTextColorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  cardTextColorPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  cardTextColorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardTextColorLabel: { flex: 1, fontSize: ms(13), fontWeight: '700' },
});
