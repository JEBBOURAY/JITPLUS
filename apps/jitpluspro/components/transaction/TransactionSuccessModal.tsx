import { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import { brandGradientFull, useTheme } from '@/contexts/ThemeContext';
import ZelligePattern from '@/components/home/ZelligePattern';
import { ms } from '@/utils/responsive';

// lottie-react-native is NOT available in Expo Go SDK 51+
let LottieView: typeof import('lottie-react-native').default | null = null;
try {
  LottieView = require('lottie-react-native').default;
} catch {
  // Not available in Expo Go
}

interface Props {
  visible: boolean;
  title: string;
  lines: string[];
  hint: string;
  onClose: () => void;
}

export function TransactionSuccessModal({ visible, title, lines, hint, onClose }: Props) {
  const theme = useTheme();
  const [scale] = useState(() => new Animated.Value(0.88));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.88);
      opacity.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [visible, scale, opacity]);

  const [main, ...details] = lines;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel={hint}>
        <Animated.View style={[styles.content, { backgroundColor: theme.bgCard, opacity, transform: [{ scale }] }]}>
          <LinearGradient colors={[...brandGradientFull]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <ZelligePattern cells={16} spacing={12} />
            {LottieView ? (
              <LottieView source={require('@/assets/animations/success.json')} autoPlay loop={false} style={styles.animation} />
            ) : (
              <View style={styles.badge}>
                <Check size={ms(40)} color="#fff" strokeWidth={3} />
              </View>
            )}
          </LinearGradient>

          <View style={styles.body}>
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
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15,10,30,0.6)' },
  content: { borderRadius: 24, width: '84%', maxWidth: 360, overflow: 'hidden' },
  hero: { height: ms(130), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  animation: { width: ms(120), height: ms(120) },
  badge: {
    width: ms(76),
    height: ms(76),
    borderRadius: ms(38),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  body: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 22, alignItems: 'center', gap: 6 },
  title: { fontSize: ms(21), textAlign: 'center', fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },
  main: { fontSize: ms(17), textAlign: 'center', fontFamily: 'Lexend_700Bold' },
  details: { alignSelf: 'stretch', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, gap: 4, marginTop: 6 },
  detail: { fontSize: ms(14), textAlign: 'center', lineHeight: ms(20), fontFamily: 'Lexend_500Medium' },
  hint: { fontSize: ms(12), textAlign: 'center', marginTop: 10, fontFamily: 'Lexend_400Regular' },
});
