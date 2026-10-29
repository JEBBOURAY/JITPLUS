import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';

// Same colours as the JitPlus game screens: the merchant previews exactly what clients see.
export const GAME_STAGE_GRADIENT = ['#24104A', '#150830', '#0B0418'] as const;
export const GAME_GOLD = { base: '#F59E0B', light: '#FBBF24', dark: '#D97706', soft: '#FDE68A', ink: '#3B1D06' } as const;
export const GAME_VIOLET = { base: palette.violet, vivid: palette.violetVivid } as const;
export const STAGE_TEXT = { strong: '#FFFFFF', soft: 'rgba(255,255,255,0.75)', muted: 'rgba(255,255,255,0.6)' } as const;

/** Dark violet panel the client games are played on. */
export function GameStage({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={GAME_STAGE_GRADIENT} style={styles.stage}>
      {children}
    </LinearGradient>
  );
}

/** Gold call to action of the client spin screen. */
export function StageGoldButton({ label, onPress, disabled, busy }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.85}
      style={[styles.goldWrap, (disabled || busy) && styles.dimmed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
    >
      <LinearGradient colors={[GAME_GOLD.soft, GAME_GOLD.light, GAME_GOLD.dark]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.gold}>
        {busy ? <ActivityIndicator color={GAME_GOLD.ink} /> : (
          <Text style={styles.goldText} maxFontSizeMultiplier={1.3}>{label}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

/** Small rounded label of the client game screens (gold, or muted white). */
export function StagePill({ icon: Icon, text, muted }: { icon: LucideIcon; text: string; muted?: boolean }) {
  const color = muted ? STAGE_TEXT.soft : GAME_GOLD.light;
  return (
    <View style={[styles.pill, muted && styles.pillMuted]}>
      <Icon size={ms(13)} color={color} strokeWidth={2} />
      <Text style={[styles.pillText, { color }]} maxFontSizeMultiplier={1.3}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 20, padding: 16, gap: 14, overflow: 'hidden' },
  goldWrap: {
    alignSelf: 'stretch',
    borderRadius: 14,
    shadowColor: GAME_GOLD.base,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  dimmed: { opacity: 0.55 },
  gold: { height: ms(52), alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  goldText: { color: GAME_GOLD.ink, fontSize: ms(16), fontFamily: font.bold, letterSpacing: 0.2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  pillMuted: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' },
  pillText: { fontSize: ms(12), fontFamily: font.semibold },
});
