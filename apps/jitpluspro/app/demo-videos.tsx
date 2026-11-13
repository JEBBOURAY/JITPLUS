import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Check, Play, type LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { font, icon } from '@/constants/design';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import { hapticLight } from '@/utils/haptics';
import type { DemoId } from '@/constants/demoVideos';
import { DemoVideoModal } from '@/components/demo/DemoVideoModal';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import { ProgressBar } from '@/components/ui/SummaryCard';
import {
  JitCard, JitClients, JitDeals, JitGames, JitGift, JitHome, JitMessages, JitParcel, JitPersonAdd, JitPoster,
  JitPremium, JitScan, JitStamp, JitStar, JitStats, JitStore, JitTeam, JitTicket,
} from '@/components/icons';

// Same artwork as the "Tutoriels vidéo" card of Accueil.
const HERO_IMAGE = require('@/assets/images/tools/videos_demos.png');

/** JitPlus icon of every clip. Keyed by id so a new `DemoId` without an icon fails the type check. */
const DEMO_ICON: Record<DemoId, LucideIcon> = {
  intro: JitHome,
  scanner: JitScan,
  caisse: JitStamp,
  offrir: JitGift,
  sansapp: JitPersonAdd,
  carte: JitCard,
  cadeaux: JitStar,
  boutique: JitStore,
  affiche: JitPoster,
  clients: JitClients,
  messages: JitMessages,
  bonsplans: JitDeals,
  roue: JitGames,
  gratter: JitTicket,
  qrcolis: JitParcel,
  equipe: JitTeam,
  stats: JitStats,
  forfait: JitPremium,
};

/** The intro clip opens the page on its own card; the others are grouped by the moment they are useful. */
const FEATURED: DemoId = 'intro';
const SECTIONS: { key: string; ids: DemoId[] }[] = [
  { key: 'checkout', ids: ['scanner', 'caisse', 'offrir', 'sansapp'] },
  { key: 'program', ids: ['carte', 'cadeaux', 'boutique', 'affiche'] },
  { key: 'clients', ids: ['clients', 'messages'] },
  { key: 'boost', ids: ['bonsplans', 'roue', 'gratter', 'qrcolis'] },
  { key: 'manage', ids: ['equipe', 'stats', 'forfait'] },
];
const TOTAL = Object.keys(DEMO_ICON).length;

function isDemoId(v: unknown): v is DemoId {
  return typeof v === 'string' && v in DEMO_ICON;
}

/** Clips already opened on this device, so the merchant sees what is left to watch. */
function useSeenDemos() {
  const [seen, setSeen] = useState<ReadonlySet<DemoId>>(() => new Set());
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(ASYNC_STORAGE_KEYS.DEMO_VIDEOS_SEEN)
      .then((raw) => {
        if (!alive || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setSeen((prev) => new Set([...prev, ...parsed.filter(isDemoId)]));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const markSeen = useCallback((id: DemoId) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      AsyncStorage.setItem(ASYNC_STORAGE_KEYS.DEMO_VIDEOS_SEEN, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);
  return { seen, markSeen };
}

const DemoRow = React.memo(function DemoRow({ id, first, seen, onPlay }: {
  id: DemoId;
  first: boolean;
  seen: boolean;
  onPlay: (id: DemoId) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const Icon = DEMO_ICON[id];
  const title = t(`demoVideos.items.${id}`);
  return (
    <TouchableOpacity
      style={[
        styles.row,
        { flexDirection: dir.row },
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderLight },
      ]}
      activeOpacity={0.7}
      onPress={() => onPlay(id)}
      accessibilityRole="button"
      accessibilityLabel={`${t('demo.watch')}, ${title}`}
      accessibilityHint={t(`demoVideos.hints.${id}`)}
      accessibilityState={{ checked: seen }}
    >
      <Icon size={22} color={theme.text} strokeWidth={icon.stroke} />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {title}
        </Text>
        <Text style={[styles.rowHint, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.4}>
          {t(`demoVideos.hints.${id}`)}
        </Text>
      </View>
      {seen ? (
        <Check size={18} color={theme.success} strokeWidth={icon.strokeSmall} />
      ) : (
        <View style={[styles.playDot, { backgroundColor: theme.primary }]}>
          <Play size={12} color="#FFFFFF" fill="#FFFFFF" strokeWidth={icon.strokeSmall} style={dir.flip} />
        </View>
      )}
    </TouchableOpacity>
  );
});

/**
 * "Tutoriels vidéo": the intro clip on its own card, then every clip grouped
 * by the moment it is useful, with a line of explanation and a tick once opened.
 */
export default function DemoVideosScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const dir = useDir();
  const [playing, setPlaying] = useState<DemoId | null>(null);
  const { seen, markSeen } = useSeenDemos();

  const close = useCallback(() => setPlaying(null), []);
  const play = useCallback((id: DemoId) => {
    hapticLight();
    markSeen(id);
    setPlaying(id);
  }, [markSeen]);

  if (shouldWait) return null;

  const card = { backgroundColor: theme.bgCard, borderColor: theme.border };
  const featuredTitle = t(`demoVideos.items.${FEATURED}`);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t('demoVideos.title')} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: TOTAL, now: seen.size }}>
          <Text style={[styles.progressText, { color: theme.textSecondary, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('demoVideos.progress', { done: seen.size, total: TOTAL })}
          </Text>
          <ProgressBar ratio={seen.size / TOTAL} />
        </View>

        <TouchableOpacity
          style={[styles.featured, card, { flexDirection: dir.row }]}
          activeOpacity={0.8}
          onPress={() => play(FEATURED)}
          accessibilityRole="button"
          accessibilityLabel={`${t('demo.watch')}, ${featuredTitle}`}
          accessibilityHint={t(`demoVideos.hints.${FEATURED}`)}
          accessibilityState={{ checked: seen.has(FEATURED) }}
        >
          <Image source={HERO_IMAGE} style={styles.featuredImage} contentFit="contain" accessible={false} />
          <View style={styles.featuredBody}>
            <Text style={[styles.featuredLabel, { color: theme.primary, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
              {t('demoVideos.startHere')}
            </Text>
            <Text style={[styles.featuredTitle, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
              {featuredTitle}
            </Text>
            <Text style={[styles.rowHint, { color: theme.textMuted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
              {t(`demoVideos.hints.${FEATURED}`)}
            </Text>
            <View style={[styles.watchPill, { flexDirection: dir.row, alignSelf: dir.alignStart, backgroundColor: theme.primary }]}>
              <Play size={13} color="#FFFFFF" fill="#FFFFFF" strokeWidth={icon.strokeSmall} style={dir.flip} />
              <Text style={styles.watchText} maxFontSizeMultiplier={1.2}>{t('demo.watch')}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {SECTIONS.map((section) => (
          <View key={section.key}>
            <Text style={[styles.sectionTitle, { color: theme.text, textAlign: dir.textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
              {t(`demoVideos.sections.${section.key}`)}
            </Text>
            <View style={[styles.card, card]}>
              {section.ids.map((id, i) => (
                <DemoRow key={id} id={id} first={i === 0} seen={seen.has(id)} onPlay={play} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {playing && <DemoVideoModal id={playing} visible onClose={close} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4 },

  progress: { gap: 8, paddingHorizontal: 4, marginBottom: 14 },
  progressText: { fontSize: 13, fontFamily: font.medium },

  // Same bordered cards and section titles as "Mes outils" on Accueil.
  featured: { alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 14 },
  featuredImage: { width: 92, height: 92, margin: -4 },
  featuredBody: { flex: 1, gap: 3 },
  featuredLabel: { fontSize: 12, fontFamily: font.semibold },
  featuredTitle: { fontSize: 17, lineHeight: 22, fontFamily: font.semibold, letterSpacing: -0.3 },
  watchPill: { alignItems: 'center', gap: 6, marginTop: 8, height: 36, paddingHorizontal: 14, borderRadius: 999 },
  watchText: { color: '#FFFFFF', fontSize: 13, fontFamily: font.semibold },

  sectionTitle: { fontSize: 18, fontFamily: font.semibold, letterSpacing: -0.3, marginTop: 22, marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  row: { alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 12, paddingHorizontal: 16 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontFamily: font.semibold, letterSpacing: -0.2 },
  rowHint: { fontSize: 13, lineHeight: 18, fontFamily: font.regular },
  playDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
