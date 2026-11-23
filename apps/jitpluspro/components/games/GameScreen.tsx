import React, { useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import PremiumLockCard from '@/components/PremiumLockCard';
import { Button, Notice, ScreenHeader } from '@/components/scratch/ScratchUI';

/** i18n namespace of a game, for the texts every game screen shares (`<ns>.list.ownerOnly`, …). */
export type GameNamespace = 'luckyWheel' | 'scratch' | 'collection' | 'deals';

/** Back to the previous screen, or to `fallback` when the screen was opened from a link or a notification. */
export function useBackTo(fallback: Href) {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}

/** Full-screen spinner while the campaign loads. */
export function GameScreenLoading() {
  const theme = useTheme();
  return (
    <View style={[styles.container, styles.center, { backgroundColor: theme.bg }]}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

/** Header and a message shown instead of the screen (no access, load error, not editable, not found). */
export function GameScreenMessage({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={title} onBack={onBack} />
      {children}
    </View>
  );
}

/** A single notice instead of the screen. */
export function GameScreenNotice({ title, onBack, text, tone }: {
  title: string;
  onBack: () => void;
  text: string;
  tone?: React.ComponentProps<typeof Notice>['tone'];
}) {
  return (
    <GameScreenMessage title={title} onBack={onBack}>
      <View style={styles.padded}><Notice tone={tone} text={text} /></View>
    </GameScreenMessage>
  );
}

/** The campaign could not be loaded: say it and offer to try again. */
export function GameLoadError({ title, onBack, text, onRetry, retrying }: {
  title: string;
  onBack: () => void;
  text: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const { t } = useLanguage();
  return (
    <GameScreenMessage title={title} onBack={onBack}>
      <View style={[styles.padded, styles.gap]}>
        <Notice tone="danger" text={text} />
        <Button label={t('common.retry')} onPress={onRetry} loading={retrying} />
      </View>
    </GameScreenMessage>
  );
}

/** No answer, a timeout or a server error: trying again may work. A 4xx (deleted, other merchant) will not. */
function isTransientError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return !status || status >= 500 || status === 408 || status === 429;
}

/**
 * Detail page whose campaign did not load. A network error offers to try again
 * (pull-to-refresh is not there in this state); otherwise the campaign is gone.
 */
export function GameDetailMissing({ title, onBack, ns, query }: {
  title: string;
  onBack: () => void;
  ns: GameNamespace;
  query: { error: unknown; refetch: () => unknown; isRefetching: boolean };
}) {
  const { t } = useLanguage();
  if (query.error && isTransientError(query.error)) {
    return (
      <GameLoadError
        title={title}
        onBack={onBack}
        text={t(`${ns}.wizard.loadError`)}
        onRetry={() => void query.refetch()}
        retrying={query.isRefetching}
      />
    );
  }
  return <GameScreenNotice title={title} onBack={onBack} tone="danger" text={t(`${ns}.detail.notFound`)} />;
}

/** A team member cannot manage the game; an owner without the plan sees the Pro lock. */
export function GameNoAccess({ title, onBack, ns, isTeamMember }: {
  title: string;
  onBack: () => void;
  ns: GameNamespace;
  isTeamMember: boolean;
}) {
  const { t } = useLanguage();
  return (
    <GameScreenMessage title={title} onBack={onBack}>
      {isTeamMember
        ? <View style={styles.padded}><Notice text={t(`${ns}.list.ownerOnly`)} /></View>
        : <PremiumLockCard titleKey={`${ns}.list.premiumTitle`} descriptionKey={`${ns}.list.premiumDesc`} />}
    </GameScreenMessage>
  );
}

/** One line of facts on a game's detail page. */
export function InfoLine({ text, muted }: { text: string; muted?: boolean }) {
  const theme = useTheme();
  const { textAlign } = useDir();
  return (
    <Text style={[styles.info, { color: muted ? theme.textMuted : theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  padded: { padding: 16 },
  gap: { gap: 12 },
  info: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular },
});
