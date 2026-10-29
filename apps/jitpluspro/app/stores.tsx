import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  BadgeInfo,
  Share2,
  Clock,
  Award,
  Palette,
  Eye,
  Check,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react-native';
import { JitPin } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useStores, queryKeys } from '@/hooks/useQueryHooks';
import FichePreviewModal from '@/components/FichePreviewModal';
import MerchantCategoryIcon from '@/components/MerchantCategoryIcon';
import { getCategoryLabel } from '@/constants/categories';
import { resolveImageUrl } from '@/utils/imageUrl';
import type { Merchant, Store } from '@/types';
import {
  ScreenHeader, OwnerOnlyNotice, Toast, useToast, useQueuedToast, usePressGuard, surfaceShadow, fieldFill, ui,
} from '@/components/stores/StoreUi';
import { formatDaySlots } from '@jitplus/shared';
import {
  STORE_SECTIONS, brandColor, countSocials, hoursHasAny, sectionDone, todayKey,
  type StoreSection,
} from '@/components/stores/brand';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const SECTION_UI: Record<StoreSection, { Icon: LucideIcon; titleKey: string }> = {
  identity: { Icon: BadgeInfo, titleKey: 'storesHub.identityTitle' },
  locations: { Icon: JitPin, titleKey: 'storesHub.locationsTitle' },
  contact: { Icon: Share2, titleKey: 'storesHub.contactTitle' },
  hours: { Icon: Clock, titleKey: 'storesHub.hoursTitle' },
  services: { Icon: Award, titleKey: 'storesHub.servicesTitle' },
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
      const value = formatDaySlots(merchant.openingHours?.[todayKey()]) ?? t('fiche.dayClosed');
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
  const dir = useDir();
  const { Icon, titleKey } = SECTION_UI[section];
  const title = t(titleKey);
  return (
    <TouchableOpacity
      onPress={() => onPress(section)}
      activeOpacity={0.7}
      style={[styles.row, { flexDirection: dir.row }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderLight }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${summary}`}
      accessibilityHint={done ? undefined : t('storesHub.toComplete')}
    >
      <View style={[styles.rowIcon, { backgroundColor: theme.primaryBg }]}>
        <Icon size={18} color={theme.primary} strokeWidth={icon.stroke} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{title}</Text>
        <Text style={[ui.caption, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{summary}</Text>
      </View>
      {section === 'appearance' ? <View style={[styles.swatch, { backgroundColor: accent }]} /> : null}
      {done ? (
        <View style={[styles.doneDot, { backgroundColor: theme.success + '1F' }]}>
          <Check size={12} color={theme.success} strokeWidth={icon.strokeSmall} />
        </View>
      ) : (
        <View style={[styles.todoDot, { backgroundColor: theme.warning }]} />
      )}
      <ChevronRight size={18} color={theme.textMuted} strokeWidth={icon.stroke} style={dir.flip} />
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
  const dir = useDir();
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

  const closePreview = useCallback(() => setPreviewOpen(false), []);
  const manageLocations = useCallback(() => {
    setPreviewOpen(false);
    openSection('locations');
  }, [openSection]);

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
            <View style={[styles.logoRing, dir.isRTL ? styles.logoRingRtl : styles.logoRingLtr, { backgroundColor: theme.bgCard }]}>
              {merchant.logoUrl ? (
                <ExpoImage source={resolveImageUrl(merchant.logoUrl)} style={styles.logo} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={[styles.logo, styles.logoEmpty, { backgroundColor: `${accent}1A` }]}>
                  <MerchantCategoryIcon category={merchant.categorie} size={30} />
                </View>
              )}
            </View>
            <View style={[styles.brandText, dir.isRTL ? styles.brandTextRtl : styles.brandTextLtr]}>
              <Text style={[styles.brandName, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{merchant.nom}</Text>
              <Text style={[ui.caption, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1}>
                {[merchant.categorie, ...(merchant.secondaryCategories ?? [])]
                  .map((c) => getCategoryLabel(c)).join(' · ')}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setPreviewOpen(true)}
            activeOpacity={0.85}
            style={[styles.previewBtn, { flexDirection: dir.row, backgroundColor: fieldFill(theme) }]}
            accessibilityRole="button"
          >
            <Eye size={16} color={theme.primary} strokeWidth={icon.stroke} />
            <Text style={[styles.previewText, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>{t('storesHub.previewCta')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          disabled={complete}
          onPress={() => status.next && openSection(status.next)}
          activeOpacity={0.8}
          style={[styles.progressCard, { backgroundColor: theme.bgCard }, shadow]}
          accessibilityRole={complete ? 'text' : 'button'}
        >
          <View style={[styles.progressHead, { flexDirection: dir.row }]}>
            <Text style={[styles.progressTitle, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
              {complete ? t('storesHub.completeTitle') : t('storesHub.progressTitle', { percent: status.percent })}
            </Text>
            <Text style={[styles.progressCount, { color: theme.textSecondary }]}>
              {status.done.length}/{STORE_SECTIONS.length}
            </Text>
          </View>
          <View
            style={[styles.track, { alignItems: dir.alignStart, backgroundColor: fieldFill(theme) }]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: status.percent }}
          >
            <View style={[styles.fill, { width: `${status.percent}%`, backgroundColor: complete ? theme.success : theme.primary }]} />
          </View>
          <Text style={[ui.caption, styles.progressHint, { color: theme.textMuted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
            {status.next
              ? t('storesHub.nextStep', { section: t(SECTION_UI[status.next].titleKey) })
              : t('storesHub.completeCaption')}
          </Text>
        </TouchableOpacity>

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

      <FichePreviewModal
        visible={previewOpen}
        onClose={closePreview}
        merchant={merchant}
        stores={stores}
        onManageLocations={manageLocations}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  brandCard: { marginHorizontal: 16, marginTop: 8, borderRadius: 16, overflow: 'hidden' },
  cover: { height: 112 },
  logoRing: { position: 'absolute', top: 72, width: 76, height: 76, borderRadius: 38, padding: 3 },
  logoRingLtr: { left: 16 },
  logoRingRtl: { right: 16 },
  logo: { width: '100%', height: '100%', borderRadius: 35 },
  logoEmpty: { alignItems: 'center', justifyContent: 'center' },
  brandText: { paddingTop: 10, minHeight: 56, gap: 2 },
  brandTextLtr: { paddingLeft: 104, paddingRight: 16 },
  brandTextRtl: { paddingRight: 104, paddingLeft: 16 },
  brandName: { fontSize: 17, fontFamily: font.semibold, letterSpacing: -0.3 },
  previewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, marginTop: 14, minHeight: 44, paddingVertical: 12, borderRadius: 12 },
  previewText: { fontSize: 14, fontFamily: font.semibold },

  progressCard: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 16 },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTitle: { flex: 1, fontSize: 15, fontFamily: font.semibold, letterSpacing: -0.2 },
  progressCount: { fontSize: 13, fontFamily: font.semibold },
  track: { height: 8, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  progressHint: { marginTop: 10 },

  list: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontFamily: font.semibold, letterSpacing: -0.2 },
  swatch: { width: 16, height: 16, borderRadius: 8 },
  doneDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  todoDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 7 },
});
