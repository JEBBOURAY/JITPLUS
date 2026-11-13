import { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Animated } from 'react-native';
import { Check } from 'lucide-react-native';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { font, icon } from '@/constants/design';
import { ms, radius } from '@/utils/responsive';
import { EASE_OUT } from '@/utils/motion';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const CARD_FROM = 0.96;
const CHECK_FROM = 0.85;

interface Props {
  visible: boolean;
  title: string;
  lines: string[];
  hint: string;
  onClose: () => void;
}

export function TransactionSuccessModal({ visible, title, lines, hint, onClose }: Props) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion() === true;
  const [scale] = useState(() => new Animated.Value(CARD_FROM));
  const [checkScale] = useState(() => new Animated.Value(CHECK_FROM));

  // The Modal already fades in: only a small scale on top, no second fade.
  useEffect(() => {
    if (!visible) {
      scale.setValue(CARD_FROM);
      checkScale.setValue(CHECK_FROM);
      return;
    }
    if (reduceMotion) {
      scale.setValue(1);
      checkScale.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 180, easing: EASE_OUT, useNativeDriver: true }),
      Animated.timing(checkScale, { toValue: 1, duration: 200, easing: EASE_OUT, useNativeDriver: true }),
    ]).start();
  }, [visible, reduceMotion, scale, checkScale]);

  const [main, ...details] = lines;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel={hint}>
        <Animated.View
          style={[
            styles.content,
            { backgroundColor: theme.bgCard, borderColor: theme.border, transform: [{ scale }] },
          ]}
        >
          <Animated.View style={[styles.badge, { transform: [{ scale: checkScale }] }]}>
            <View style={styles.badgeGradient}>
              <Check size={ms(32)} color="#fff" strokeWidth={icon.stroke} />
            </View>
          </Animated.View>

          <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
          {!!main && <Text style={[styles.main, { color: theme.primary }]}>{main}</Text>}
          {details.length > 0 && (
            <View style={[styles.details, { backgroundColor: theme.bgInput }]}>
              {details.map((line) => (
                <Text key={line} style={[styles.detail, { color: theme.textSecondary }]}>
                  {line}
                </Text>
              ))}
            </View>
          )}
          <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15,10,30,0.6)' },
  content: {
    borderRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    width: '84%',
    maxWidth: 360,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    width: ms(64),
    height: ms(64),
    borderRadius: ms(32),
    overflow: 'hidden',
    marginBottom: 10,
  },
  badgeGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.violet },
  title: { fontSize: ms(20), textAlign: 'center', fontFamily: font.semibold, letterSpacing: -0.3 },
  main: { fontSize: ms(17), textAlign: 'center', fontFamily: font.semibold },
  details: { alignSelf: 'stretch', borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, gap: 4, marginTop: 6 },
  detail: { fontSize: ms(14), textAlign: 'center', lineHeight: ms(20), fontFamily: font.medium },
  hint: { fontSize: ms(12), textAlign: 'center', marginTop: 10, fontFamily: font.regular },
});
