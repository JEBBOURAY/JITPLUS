import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { RefreshCw } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { hp } from '@/utils/responsive';
import { GAME_STAGE_GRADIENT, GameHeader, GameStateCard } from '@/components/GameStage';

interface Props {
  /** Header title of the main view; the history view shows `historyLabel`. */
  title: string;
  historyLabel: string;
  /** Accessible label of the "to use" badge on the history button. */
  badgeLabel: string;
  badgeCount: number;
  inHistory: boolean;
  onClose: () => void;
  onShowMain: () => void;
  onShowHistory: () => void;
  isLoading: boolean;
  /** Set when the first load failed: a card with a retry replaces the main view. */
  loadError?: { title: string; onRetry: () => void } | null;
  /** The history view (it scrolls itself). */
  history: ReactNode;
  /** The main view, shown once loaded. */
  children: ReactNode;
  /** Scrolled under the main view, also while loading (rules, hints). */
  footer?: ReactNode;
}

/** Shell of the game hubs (collections, scratch cards): stage gradient, header, main / history switch. */
export default function GameHubScreen({
  title, historyLabel, badgeLabel, badgeCount, inHistory, onClose, onShowMain, onShowHistory,
  isLoading, loadError, history, children, footer,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const fonts = useAppFonts();

  let main: ReactNode = children;
  if (isLoading) {
    main = <ActivityIndicator color={palette.goldLight} style={styles.spinner} />;
  } else if (loadError) {
    main = (
      <GameStateCard
        title={loadError.title}
        action={{ label: t('common.retry'), onPress: loadError.onRetry, Icon: RefreshCw }}
        fonts={fonts}
      />
    );
  }

  return (
    <LinearGradient colors={GAME_STAGE_GRADIENT} style={styles.root}>
      <StatusBar barStyle="light-content" />
      <GameHeader
        inHistory={inHistory}
        title={inHistory ? historyLabel : title}
        historyLabel={historyLabel}
        badgeLabel={badgeLabel}
        badgeCount={badgeCount}
        isRTL={isRTL}
        topInset={insets.top}
        fonts={fonts}
        t={t}
        onClose={onClose}
        onBack={onShowMain}
        onOpenHistory={onShowHistory}
      />

      {inHistory ? (
        <Animated.View key="history" entering={FadeIn.duration(220)} style={styles.body}>
          {history}
        </Animated.View>
      ) : (
        <Animated.View key="main" entering={FadeIn.duration(220)} style={styles.body}>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + hp(28) }]}
            showsVerticalScrollIndicator={false}
          >
            {main}
            {footer}
          </ScrollView>
        </Animated.View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  scroll: { paddingTop: hp(8) },
  spinner: { marginTop: hp(80) },
});
