import { memo, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ActionButton } from '@/components/ui/ActionButton';
import { font } from '@/constants/design';

export const SEND_COOLDOWN_MS = 30_000;
const SEND_COOLDOWN_S = SEND_COOLDOWN_MS / 1000;

/**
 * Seconds left until `until`, ticking locally so only the consumer re-renders.
 * The interval stops by itself once the deadline has passed.
 */
function useSecondsLeft(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until == null) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [until]);
  if (until == null) return 0;
  // `now` can lag behind until the first tick, so clamp to the cooldown length.
  return Math.min(SEND_COOLDOWN_S, Math.max(0, Math.ceil((until - now) / 1000)));
}

const IndeterminateBar = memo(function IndeterminateBar() {
  const theme = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: 900, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);
  const translateX = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.4, width] }),
    [progress, width],
  );
  return (
    <View
      style={[styles.progressTrack, { backgroundColor: theme.border }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      importantForAccessibility="no"
    >
      <Animated.View style={[styles.progressIndet, { backgroundColor: theme.primary, transform: [{ translateX }] }]} />
    </View>
  );
});

/** Campaign send button with sending and post-send cooldown states. */
const SendButton = memo(function SendButton({
  label,
  Icon,
  canSend,
  isSending,
  cooldownUntil,
  hint,
  onPress,
}: {
  label: string;
  Icon: LucideIcon;
  /** When false the button stays tappable so it can guide the user to the missing field. */
  canSend: boolean;
  isSending: boolean;
  cooldownUntil: number | null;
  hint?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const cooldownRemaining = useSecondsLeft(cooldownUntil);
  const cooling = cooldownRemaining > 0;
  const disabled = isSending || cooling;
  const ready = canSend && !disabled;
  const coolFraction = cooling ? (SEND_COOLDOWN_S - cooldownRemaining) / SEND_COOLDOWN_S : 0;
  const cooldownLabel = t('messages.cooldownWait', { s: cooldownRemaining });
  const active = ready || isSending;
  return (
    <View style={styles.sendBlock}>
      <ActionButton
        onPress={onPress}
        disabled={disabled}
        size="lg"
        variant={active ? 'primary' : 'secondary'}
        labelStyle={active ? undefined : { color: theme.textMuted }}
        iconColor={active ? undefined : theme.textMuted}
        icon={cooling || isSending ? undefined : Icon}
        label={cooling ? cooldownLabel : isSending ? t('messages.sendingShort') : label}
        accessibilityLabel={cooling ? cooldownLabel : label}
        accessibilityHint={!canSend ? hint : undefined}
      />
      {!canSend && !disabled && hint && (
        <Text style={[styles.sendHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
          {hint}
        </Text>
      )}
      {isSending && <IndeterminateBar />}
      {cooling && (
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]} importantForAccessibility="no">
          <View style={[styles.progressFill, { backgroundColor: theme.textMuted, width: `${Math.round(coolFraction * 100)}%` }]} />
        </View>
      )}
    </View>
  );
});

export default SendButton;

const styles = StyleSheet.create({
  sendBlock: { marginTop: 16 },
  sendHint: { fontSize: 11, textAlign: 'center', marginTop: 8, fontFamily: font.medium },

  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: { height: 3, borderRadius: 2 },
  progressIndet: { width: '40%', height: 3, borderRadius: 2 },
});
