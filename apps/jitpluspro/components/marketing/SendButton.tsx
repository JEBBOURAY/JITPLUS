import { memo, useEffect, useState } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';
import { Send } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ActionButton } from '@/components/ui/ActionButton';
import { SEND_COOLDOWN_MS } from '@/hooks/useNotificationSend';

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

/** "Send to all" button: leads to the recap, and counts down the pause that follows a send. */
const SendButton = memo(function SendButton({
  cooldownUntil,
  ready,
  loading,
  disabled = false,
  onPress,
}: {
  cooldownUntil: number | null;
  /** False while the message is incomplete: the button stays tappable to point at the missing field. */
  ready: boolean;
  /** The content check that precedes the recap is in flight. */
  loading: boolean;
  /** Nothing can be sent right now (quota spent, no customer yet). */
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const cooldownRemaining = useSecondsLeft(cooldownUntil);
  // The bar runs on its own clock, so it glides instead of stepping with the seconds.
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (cooldownUntil == null) return;
    const left = cooldownUntil - Date.now();
    if (left <= 0) return;
    progress.setValue(1 - left / SEND_COOLDOWN_MS);
    const animation = Animated.timing(progress, { toValue: 1, duration: left, easing: Easing.linear, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [cooldownUntil, progress]);
  const cooling = cooldownRemaining > 0;
  const locked = disabled || cooling;
  const muted = locked || !ready;
  const label = cooling ? t('messages.cooldownWait', { s: cooldownRemaining }) : t('messages.sendToAll');
  return (
    <View style={styles.sendBlock}>
      <ActionButton
        onPress={onPress}
        disabled={locked}
        loading={loading}
        size="lg"
        variant={muted ? 'secondary' : 'primary'}
        labelStyle={muted ? { color: theme.textMuted } : undefined}
        iconColor={muted ? theme.textMuted : undefined}
        icon={cooling ? undefined : Send}
        label={label}
      />
      {cooling && (
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]} importantForAccessibility="no">
          <Animated.View
            style={[
              styles.progressFill,
              { backgroundColor: theme.textMuted, transformOrigin: isRTL ? 'right' : 'left', transform: [{ scaleX: progress }] },
            ]}
          />
        </View>
      )}
    </View>
  );
});

export default SendButton;

const styles = StyleSheet.create({
  sendBlock: { marginTop: 12 },
  progressTrack: { height: 3, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },
});
