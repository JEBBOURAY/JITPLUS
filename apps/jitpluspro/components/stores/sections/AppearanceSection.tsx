import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Store,
  CreditCard,
  Palette as PaletteIcon,
  Shapes,
  ImagePlus,
  Image as ImageIcon,
  Type,
  ChevronRight,
  Trash2,
  Gift,
  Stamp,
} from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthActions } from '@/contexts/AuthContext';
import {
  useUpdateMerchantProfile,
  useUploadMerchantCardBackground,
  useDeleteMerchantCardBackground,
  type MerchantProfilePayload,
} from '@/hooks/useQueryHooks';
import { resolveImageUrl } from '@/utils/imageUrl';
import { getErrorMessage } from '@/utils/error';
import { MERCHANT_ICON_MAP } from '@/utils/merchantIcons';
import { getCategoryLabel, CATEGORY_EMOJIS } from '@/constants/categories';
import type { Merchant } from '@/types';
import { PresetSwatches, IconGrid, CardColorRow, CardTextColorToggle } from '@/components/stores/FicheControls';
import {
  Panel, ProPill, Segmented, SaveBar, SectionScreen, useDiscardGuard, useToast, surfaceShadow, haptic,
  type SegmentItem,
} from '@/components/stores/StoreUi';
import { HEX_RE, PRESET_COLORS, brandColor } from '@/components/stores/brand';

const CARD_BG_MAX_BYTES = 5 * 1024 * 1024;
const STAMP_INDICES = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
const SAMPLE_EARNED = 3;

type Part = 'fiche' | 'card';
type TextMode = 'LIGHT' | 'DARK';

function savedIcon(m: Merchant): string | null {
  return m.themeIcon && MERCHANT_ICON_MAP[m.themeIcon] ? m.themeIcon : null;
}
function savedCardColor(m: Merchant): string | null {
  return m.cardBackgroundColor && HEX_RE.test(m.cardBackgroundColor) ? m.cardBackgroundColor : null;
}
function savedTextMode(m: Merchant): TextMode {
  return m.cardTextColor === 'DARK' ? 'DARK' : 'LIGHT';
}

/**
 * Brand color and icon (public profile) and the loyalty card design. The
 * card background photo is uploaded immediately; the rest is saved with
 * the Save button.
 */
export default function AppearanceSection({ merchant }: { merchant: Merchant }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { updateMerchant } = useAuthActions();
  const toast = useToast();
  const update = useUpdateMerchantProfile();
  const uploadCardBackground = useUploadMerchantCardBackground();
  const deleteCardBackground = useDeleteMerchantCardBackground();
  const isPremium = merchant.plan === 'PREMIUM';
  const scrollRef = useRef<ScrollView>(null);

  const [part, setPart] = useState<Part>('fiche');
  const [color, setColor] = useState(() => brandColor(merchant.themeColor));
  const [icon, setIcon] = useState<string | null>(() => savedIcon(merchant));
  const [cardColor, setCardColor] = useState<string | null>(() => savedCardColor(merchant));
  const [textMode, setTextMode] = useState<TextMode>(() => savedTextMode(merchant));
  const cardBgUrl = merchant.cardBackgroundUrl ?? null;

  const changes = useMemo<MerchantProfilePayload>(() => {
    const out: MerchantProfilePayload = {};
    if (color.toLowerCase() !== brandColor(merchant.themeColor).toLowerCase()) out.themeColor = color;
    if (icon !== savedIcon(merchant)) out.themeIcon = icon;
    if (cardColor !== savedCardColor(merchant)) out.cardBackgroundColor = cardColor;
    if (textMode !== savedTextMode(merchant)) out.cardTextColor = textMode;
    return out;
  }, [color, icon, cardColor, textMode, merchant]);
  const dirty = Object.keys(changes).length > 0;
  useDiscardGuard(dirty, update.isPending);

  const parts = useMemo<SegmentItem<Part>[]>(() => [
    { key: 'fiche', label: t('storePreview.group1Title'), Icon: Store },
    { key: 'card', label: t('storePreview.group2Title'), Icon: CreditCard },
  ], [t]);

  const selectPart = useCallback((next: Part) => {
    haptic();
    setPart(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const pickColor = useCallback((hex: string) => { haptic(); setColor(hex); }, []);
  const pickIcon = useCallback((slug: string | null) => { haptic(); setIcon(slug); }, []);
  const pickCardColor = useCallback((hex: string | null) => { haptic(); setCardColor(hex); }, []);
  const pickTextMode = useCallback((mode: TextMode) => { haptic(); setTextMode(mode); }, []);

  const pickCardBackground = useCallback(async () => {
    if (uploadCardBackground.isPending) return;
    if (!isPremium) {
      Alert.alert(t('storePreview.cardDesignTitle'), t('storePreview.cardBackgroundProOnly'));
      return;
    }
    try {
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.7,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (typeof asset.fileSize === 'number' && asset.fileSize > CARD_BG_MAX_BYTES) {
        Alert.alert(t('storePreview.cardDesignTitle'), t('storePreview.cardBackgroundTooLarge'));
        return;
      }
      // The upload endpoint also stores the URL on the merchant.
      const { url } = await uploadCardBackground.mutateAsync({ uri: asset.uri, mimeType: asset.mimeType, fileSize: asset.fileSize });
      updateMerchant({ cardBackgroundUrl: url });
      haptic();
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err));
    }
  }, [uploadCardBackground, isPremium, updateMerchant, t]);

  const removeCardBackground = useCallback(() => {
    Alert.alert(t('storePreview.cardBackgroundRemoveTitle'), t('storePreview.cardBackgroundRemoveMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCardBackground.mutateAsync();
            updateMerchant({ cardBackgroundUrl: null });
            haptic();
          } catch (err) {
            Alert.alert(t('common.error'), getErrorMessage(err));
          }
        },
      },
    ]);
  }, [deleteCardBackground, updateMerchant, t]);

  const showToast = toast.show;
  const save = useCallback(async () => {
    try {
      updateMerchant(await update.mutateAsync(changes));
      haptic();
      showToast(t('storePreview.savedToast'));
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err));
    }
  }, [changes, update, updateMerchant, showToast, t]);

  const IconCmp = icon ? MERCHANT_ICON_MAP[icon] : null;
  const logoSource = merchant.logoUrl ? resolveImageUrl(merchant.logoUrl) : null;
  const shadow = surfaceShadow(theme);

  const fichePreview = (
    <View style={[styles.hero, { backgroundColor: theme.bgCard }, shadow]}>
      {/* iOS clips shadows on views with overflow hidden: clip one level down. */}
      <View style={styles.heroClip}>
        <View style={styles.heroCover}>
          {merchant.coverUrl
            ? <ExpoImage source={resolveImageUrl(merchant.coverUrl)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
            : <LinearGradient colors={[`${color}55`, `${color}14`]} style={StyleSheet.absoluteFill} />}
          <LinearGradient colors={['transparent', theme.bgCard]} style={[StyleSheet.absoluteFill, styles.heroFade]} />
          <View style={[styles.heroLogoRing, { backgroundColor: theme.bgCard }]}>
            {logoSource ? (
              <ExpoImage source={logoSource} style={styles.heroLogo} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.heroLogo, styles.center, { backgroundColor: `${color}20` }]}>
                {IconCmp ? <IconCmp size={30} color={color} strokeWidth={1.75} /> : <Text style={styles.heroEmoji}>🏷️</Text>}
              </View>
            )}
            {logoSource && IconCmp ? (
              <View style={[styles.heroIconBadge, { backgroundColor: color, borderColor: theme.bgCard }]}>
                <IconCmp size={13} color="#FFFFFF" strokeWidth={2} />
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.heroBody}>
          <Text style={[styles.heroName, { color: theme.text }]} numberOfLines={1}>{merchant.nom}</Text>
          <View style={[styles.heroCategory, { backgroundColor: `${color}14` }]}>
            <Text style={[styles.heroCategoryText, { color }]} numberOfLines={1}>{getCategoryLabel(merchant.categorie)}</Text>
          </View>
          <View style={[styles.heroReward, { backgroundColor: `${color}0D` }]}>
            <View style={[styles.heroRewardIcon, { backgroundColor: `${color}1A` }]}><Stamp size={14} color={color} strokeWidth={1.8} /></View>
            <Text style={[styles.heroRewardText, { color: theme.text }]} numberOfLines={1}>{t('storePreview.stampCard')}</Text>
            <Gift size={14} color={color} strokeWidth={1.8} />
          </View>
        </View>
      </View>
    </View>
  );

  const hasCardBg = !!cardBgUrl || !!cardColor;
  const cardText = hasCardBg ? (textMode === 'DARK' ? '#111827' : '#F9FAFB') : theme.text;
  const cardSub = hasCardBg ? (textMode === 'DARK' ? '#374151' : '#E5E7EB') : theme.textMuted;
  const cardPreview = (
    <View style={[styles.cardShadow, shadow]}>
      <View style={[styles.card, { backgroundColor: cardColor ?? theme.bgCard }]}>
        {cardBgUrl ? <ExpoImage source={resolveImageUrl(cardBgUrl)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
        {hasCardBg ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: textMode === 'DARK' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)' }]} />
        ) : null}
        <LinearGradient colors={[color === palette.violet ? palette.violetDark : color, color]} style={styles.cardAccentBar} />
        <View style={[styles.cardLogoWrap, { backgroundColor: theme.primaryBg }]}>
          {logoSource
            ? <ExpoImage source={logoSource} style={styles.cardLogo} contentFit="cover" cachePolicy="disk" />
            : <Text style={styles.cardEmoji}>{CATEGORY_EMOJIS[merchant.categorie] ?? '🏷️'}</Text>}
        </View>
        <View style={styles.flex}>
          <Text style={[styles.cardName, { color: cardText }]} numberOfLines={1}>{merchant.nom}</Text>
          <View style={styles.stamps}>
            {STAMP_INDICES.map((i) => {
              const filled = i < SAMPLE_EARNED;
              return (
                <View
                  key={i}
                  style={[
                    styles.stamp,
                    filled
                      ? { backgroundColor: logoSource ? theme.bgElevated : palette.violet, borderColor: palette.violet }
                      : { backgroundColor: logoSource ? theme.bgCard : 'transparent', borderColor: theme.borderLight },
                  ]}
                >
                  {logoSource ? (
                    <ExpoImage source={logoSource} style={[styles.stampLogo, { opacity: filled ? 1 : 0.18 }]} contentFit="cover" cachePolicy="disk" />
                  ) : filled ? (
                    <Text style={styles.stampCheck}>✓</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Text style={[styles.cardSub, { color: cardSub }]} numberOfLines={1}>{t('storePreview.cardDesignPreviewSub')}</Text>
        </View>
        <ChevronRight size={18} color={cardSub} strokeWidth={2} />
      </View>
    </View>
  );

  const cardBgBusy = uploadCardBackground.isPending || deleteCardBackground.isPending;

  return (
    <SectionScreen
      title={t('storesHub.appearanceTitle')}
      caption={t('storesHub.appearanceCaption')}
      toast={toast.message}
      scrollRef={scrollRef}
      footer={<SaveBar dirty={dirty} saving={update.isPending} onSave={save} />}
    >
      <Segmented items={parts} value={part} onChange={selectPart} role="radiogroup" style={styles.switch} />

      {part === 'fiche' ? (
        <>
          {fichePreview}
          <Panel Icon={PaletteIcon} title={t('storePreview.choosePresets')}>
            <PresetSwatches presets={PRESET_COLORS} selected={color} onPick={pickColor} />
          </Panel>
          <Panel Icon={Shapes} title={t('storePreview.chooseIcon')} caption={t('storePreview.iconHint')}>
            <IconGrid selectedIcon={icon} accent={color} onSelect={pickIcon} />
          </Panel>
        </>
      ) : (
        <>
          {cardPreview}
          <Panel
            Icon={ImageIcon}
            title={t('storePreview.cardBackgroundTitle')}
            caption={t('storePreview.cardBackgroundHint')}
            right={isPremium ? null : <ProPill />}
          >
            <View style={styles.cardBgRow}>
              <TouchableOpacity
                onPress={pickCardBackground}
                disabled={cardBgBusy}
                activeOpacity={0.85}
                style={[styles.cardBgBtn, { backgroundColor: `${color}14` }]}
                accessibilityRole="button"
              >
                {uploadCardBackground.isPending ? (
                  <ActivityIndicator size="small" color={color} />
                ) : (
                  <>
                    <ImagePlus size={16} color={color} strokeWidth={2.2} />
                    <Text style={[styles.cardBgBtnText, { color }]} numberOfLines={1}>
                      {cardBgUrl ? t('storePreview.cardBackgroundReplace') : t('storePreview.cardBackgroundAdd')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              {cardBgUrl ? (
                <TouchableOpacity
                  onPress={removeCardBackground}
                  disabled={cardBgBusy}
                  activeOpacity={0.85}
                  style={[styles.cardBgRemove, { backgroundColor: theme.danger + '14' }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('storePreview.cardBackgroundRemove')}
                >
                  <Trash2 size={16} color={theme.danger} strokeWidth={2} />
                </TouchableOpacity>
              ) : null}
            </View>
          </Panel>
          <Panel
            Icon={PaletteIcon}
            title={t('storePreview.cardColorTitle')}
            caption={cardBgUrl ? t('storePreview.cardColorDisabledHint') : t('storePreview.cardColorHint')}
          >
            <CardColorRow presets={PRESET_COLORS} selected={cardColor} disabled={!!cardBgUrl} accent={color} onPick={pickCardColor} />
          </Panel>
          <Panel Icon={Type} title={t('storePreview.cardTextColorTitle')} caption={t('storePreview.cardTextColorHint')}>
            <CardTextColorToggle selected={textMode} onChange={pickTextMode} />
          </Panel>
        </>
      )}
    </SectionScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  switch: { marginHorizontal: 16, marginTop: 6 },

  hero: { marginHorizontal: 16, marginTop: 16, borderRadius: 20 },
  heroClip: { borderRadius: 20, overflow: 'hidden' },
  heroCover: { height: 120, width: '100%' },
  heroFade: { top: '45%' },
  heroLogoRing: { position: 'absolute', bottom: -30, left: 16, width: 72, height: 72, borderRadius: 36, padding: 3 },
  heroLogo: { width: '100%', height: '100%', borderRadius: 33 },
  heroEmoji: { fontSize: 28 },
  heroIconBadge: { position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  heroBody: { padding: 16, paddingTop: 40, gap: 8 },
  heroName: { fontSize: 17, fontFamily: 'Lexend_600SemiBold', letterSpacing: -0.3 },
  heroCategory: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  heroCategoryText: { fontSize: 11.5, fontFamily: 'Lexend_500Medium' },
  heroReward: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 13 },
  heroRewardIcon: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  heroRewardText: { flex: 1, fontSize: 12.5, fontFamily: 'Lexend_500Medium' },

  cardShadow: { marginHorizontal: 16, marginTop: 16, borderRadius: 20 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 14, paddingLeft: 12, overflow: 'hidden' },
  cardAccentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  cardLogoWrap: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 4, marginRight: 14, overflow: 'hidden' },
  cardLogo: { width: 50, height: 50, borderRadius: 14 },
  cardEmoji: { fontSize: 22 },
  cardName: { fontSize: 15, fontFamily: 'Lexend_600SemiBold', letterSpacing: -0.2 },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginVertical: 8 },
  stamp: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stampLogo: { width: '100%', height: '100%', borderRadius: 12 },
  stampCheck: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardSub: { fontSize: 11, fontFamily: 'Lexend_500Medium', opacity: 0.8 },

  cardBgRow: { flexDirection: 'row', gap: 8 },
  cardBgBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 13 },
  cardBgBtnText: { fontSize: 13.5, fontFamily: 'Lexend_600SemiBold' },
  cardBgRemove: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
