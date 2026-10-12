import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, I18nManager } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  BadgeInfo, MapPin, Share2, Clock, Sparkles, Palette, Eye, Check, ChevronRight,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useStores, queryKeys } from '@/hooks/useQueryHooks';
import FichePreviewModal from '@/components/FichePreviewModal';
import MerchantCategoryIcon from '@/components/MerchantCategoryIcon';
import { getCategoryLabel } from '@/constants/categories';
import { resolveImageUrl } from '@/utils/imageUrl';
import type { Merchant, MerchantCategory, Store } from '@/types';
import {
  ScreenHeader, OwnerOnlyNotice, Toast, useToast, useQueuedToast, usePressGuard, surfaceShadow, fieldFill, ui,
} from '@/components/stores/StoreUi';
import {
  STORE_SECTIONS, brandColor, countSocials, hoursHasAny, normalizeHours, sectionDone, todayKey,
  type StoreSection,
} from '@/components/stores/brand';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const SECTION_UI: Record<StoreSection, { Icon: LucideIcon; titleKey: string }> = {
  identity: { Icon: BadgeInfo, titleKey: 'storesHub.identityTitle' },
  locations: { Icon: MapPin, titleKey: 'storesHub.locationsTitle' },
  contact: { Icon: Share2, titleKey: 'storesHub.contactTitle' },
  hours: { Icon: Clock, titleKey: 'storesHub.hoursTitle' },
  services: { Icon: Sparkles, titleKey: 'storesHub.servicesTitle' },
  appearance: { Icon: Palette, titleKey: 'storesHub.appearanceTitle' },
};

/** One-line state of a section, shown under its title. */
function sectionSummary(section: StoreSection, merchant: Merchant, stores: Store[], t: Translate): string {
  switch (section) {
    case 'identity':
      return merchant.tagline?.trim() || getCategoryLabel(merchant.categorie);
    case 'locations': {
      const count = stores.length;
      return t(count === 1 ? 'storesHub.locationsCount_one' : 'storesHub.locationsCount_other', { count });
    }
    case 'contact': {
      const count = countSocials(merchant.socialLinks);
      if (count === 0) return t('storesHub.contactEmpty');
      return t(count === 1 ? 'storesHub.socialCount_one' : 'storesHub.socialCount_other', { count });
    }
    case 'hours': {
      if (!hoursHasAny(merchant.openingHours)) return t('storesHub.hoursEmpty');
      const today = merchant.openingHours?.[todayKey()];
      const slots = today?.closed ? [] : today?.slots ?? [];
      const value = slots.length === 0
        ? t('storePreview.hoursClosed')
        : slots.map((s) => `${s.open} – ${s.close}`).join(', ');
      return t('storesHub.hoursToday', { value });
    }
    case 'services':
      return t('storesHub.servicesSummary', {
        badges: merchant.badges?.length ?? 0,
        photos: merchant.gallery?.length ?? 0,
      });
    case 'appearance':
      return t('storesHub.appearanceSummary');
  }
}

const SectionRow = React.memo(function SectionRow({ section, summary, done, accent, last, onPress }: {
  section: StoreSection;
  summary: string;
  done: boolean;
  accent: string;
  last: boolean;
  onPress: (s: StoreSection) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { Icon, titleKey } = SECTION_UI[section];
  const title = t(titleKey);
  return (
    <TouchableOpacity
      onPress={() => onPress(section)}
      activeOpacity={0.7}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderLight }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${summary}`}
      accessibilityHint={done ? undefined : t('storesHub.toComplete')}
    >
      <View style={[styles.rowIcon, { backgroundColor: theme.primaryBg }]}>
        <Icon size={18} color={theme.primary} strokeWidth={1.9} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{title}</Text>
        <Text style={[ui.caption, { color: theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{summary}</Text>
      </View>
      {section === 'appearance' ? <View style={[styles.swatch, { backgroundColor: accent }]} /> : null}
      {done ? (
        <View style={[styles.doneDot, { backgroundColor: theme.success + '1F' }]}>
          <Check size={12} color={theme.success} strokeWidth={3} />
        </View>
      ) : (
        <View style={[styles.todoDot, { backgroundColor: theme.warning }]} />
      )}
      <ChevronRight size={18} color={theme.textMuted} strokeWidth={2} style={I18nManager.isRTL ? ui.flipX : undefined} />
    </TouchableOpacity>
  );
});

/**
 * "Ma boutique" hub: brand header, completeness gauge and one row per
 * section. Each row opens `/store-section?section=…`. `preview=1` opens the
 * client preview straight away.
 */
export default function StoresScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { merchant, isTeamMember, loadProfile } = useAuth();
  const { data: stores = [] } = useStores();
  const toast = useToast();
  useQueuedToast(toast.show);
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const [previewOpen, setPreviewOpen] = useState(preview === '1');
  const [refreshing, setRefreshing] = useState(false);

  const guarded = usePressGuard();
  const openSection = useCallback((section: StoreSection) => {
    guarded(() => router.push({ pathname: '/store-section', params: { section } }));
  }, [guarded, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadProfile(), qc.invalidateQueries({ queryKey: queryKeys.stores })]);
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile, qc]);

  const status = useMemo(() => {
    if (!merchant) return null;
    const done = STORE_SECTIONS.filter((s) => sectionDone(s, merchant, stores));
    const next = STORE_SECTIONS.find((s) => !done.includes(s)) ?? null;
    return { done, next, percent: Math.round((done.length / STORE_SECTIONS.length) * 100) };
  }, [merchant, stores]);

  const previewMerchant = useMemo(() => (merchant ? { ...merchant, stores } : null), [merchant, stores]);
  const previewDraft = useMemo(() => merchant && {
    accent: brandColor(merchant.themeColor),
    iconSlug: merchant.themeIcon ?? null,
    tagline: merchant.tagline ?? '',
    badges: merchant.badges ?? [],
    hours: normalizeHours(merchant.openingHours),
    gallery: merchant.gallery ?? [],
    secondary: merchant.secondaryCategories ?? [],
  }, [merchant]);

  if (shouldWait || !merchant || !status) return null;
  if (isTeamMember) return <OwnerOnlyNotice />;

  const accent = brandColor(merchant.themeColor);
  const shadow = surfaceShadow(theme);
  const complete = status.next === null;

  return (
    <View style={[ui.flex, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <ScreenHeader title={t('stores.title')} caption={t('storesHub.caption')} />

        {/* Brand card */}
        <View style={[styles.brandCard, { backgroundColor: theme.bgCard }, shadow]}>
          <TouchableOpacity
            onPress={() => openSection('identity')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${merchant.nom}, ${t('storesHub.identityTitle')}`}
          >
            <View style={styles.cover}>
              {merchant.coverUrl ? (
                <ExpoImage source={resolveImageUrl(merchant.coverUrl)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <LinearGradient colors={[`${accent}55`, `${accent}14`]} style={StyleSheet.absoluteFill} />
              )}
            </View>
            <View style={[styles.logoRing, { backgroundColor: theme.bgCard }]}>
              {merchant.logoUrl ? (
                <ExpoImage source={resolveImageUrl(merchant.logoUrl)} style={styles.logo} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={[styles.logo, styles.logoEmpty, { backgroundColor: `${accent}1A` }]}>
                  <MerchantCategoryIcon category={merchant.categorie} size={30} />
                </View>
              )}
            </View>
            <View style={styles.brandText}>
              <Text style={[styles.brandName, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{merchant.nom}</Text>
              <Text style={[ui.caption, { color: theme.textMuted }]} numberOfLines={1}>
                {[merchant.categorie, ...(merchant.secondaryCategories ?? [])]
                  .map((c) => getCategoryLabel(c as MerchantCategory)).join(' · ')}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setPreviewOpen(true)}
            activeOpacity={0.85}
            style={[styles.previewBtn, { backgroundColor: fieldFill(theme) }]}
            accessibilityRole="button"
          >
            <Eye size={16} color={theme.primary} strokeWidth={2} />
            <Text style={[styles.previewText, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>{t('storesHub.previewCta')}</Text>
          </TouchableOpacity>
        </View>

        {/* Completeness */}
        <TouchableOpacity
          disabled={complete}
          onPress={() => status.next && openSection(status.next)}
          activeOpacity={0.8}
          style={[styles.progressCard, { backgroundColor: theme.bgCard }, shadow]}
          accessibilityRole={complete ? 'text' : 'button'}
        >
          <View style={styles.progressHead}>
            <Text style={[styles.progressTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
              {complete ? t('storesHub.completeTitle') : t('storesHub.progressTitle', { percent: status.percent })}
            </Text>
            <Text style={[styles.progressCount, { color: theme.textSecondary }]}>
              {status.done.length}/{STORE_SECTIONS.length}
            </Text>
          </View>
          <View
            style={[styles.track, { backgroundColor: fieldFill(theme) }]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: status.percent }}
          >
            <View style={[styles.fill, { width: `${status.percent}%`, backgroundColor: complete ? theme.success : theme.primary }]} />
          </View>
          <Text style={[ui.caption, styles.progressHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
            {status.next
              ? t('storesHub.nextStep', { section: t(SECTION_UI[status.next].titleKey) })
              : t('storesHub.completeCaption')}
          </Text>
        </TouchableOpacity>

        {/* Sections */}
        <View style={[styles.list, { backgroundColor: theme.bgCard }, shadow]}>
          {STORE_SECTIONS.map((section, i) => (
            <SectionRow
              key={section}
              section={section}
              summary={sectionSummary(section, merchant, stores, t)}
              done={status.done.includes(section)}
              accent={accent}
              last={i === STORE_SECTIONS.length - 1}
              onPress={openSection}
            />
          ))}
        </View>
      </ScrollView>

      <Toast message={toast.message} bottom={insets.bottom + 24} />

      {previewMerchant && previewDraft ? (
        <FichePreviewModal
          visible={previewOpen}
          onClose={() => setPreviewOpen(false)}
          merchant={previewMerchant}
          draft={previewDraft}
          theme={theme}
          t={t}
          getCategoryLabel={(c) => getCategoryLabel(c as MerchantCategory)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  brandCard: { marginHorizontal: 16, marginTop: 8, borderRadius: 20, overflow: 'hidden' },
  cover: { height: 112 },
  logoRing: { position: 'absolute', left: 16, top: 72, width: 76, height: 76, borderRadius: 38, padding: 3 },
  logo: { width: '100%', height: '100%', borderRadius: 35 },
  logoEmpty: { alignItems: 'center', justifyContent: 'center' },
  brandText: { paddingTop: 10, paddingLeft: 104, paddingRight: 16, minHeight: 56, gap: 2 },
  brandName: { fontSize: 17, fontFamily: 'Lexend_600SemiBold', letterSpacing: -0.3 },
  previewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, marginTop: 14, paddingVertical: 12, borderRadius: 13 },
  previewText: { fontSize: 13.5, fontFamily: 'Lexend_600SemiBold' },

  progressCard: { marginHorizontal: 16, marginTop: 16, borderRadius: 20, padding: 16 },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTitle: { flex: 1, fontSize: 15, fontFamily: 'Lexend_600SemiBold', letterSpacing: -0.2 },
  progressCount: { fontSize: 12.5, fontFamily: 'Lexend_600SemiBold' },
  track: { height: 8, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  progressHint: { marginTop: 10 },

  list: { marginHorizontal: 16, marginTop: 16, borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14.5, fontFamily: 'Lexend_600SemiBold', letterSpacing: -0.2 },
  swatch: { width: 16, height: 16, borderRadius: 8 },
  doneDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  todoDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 7 },
});
