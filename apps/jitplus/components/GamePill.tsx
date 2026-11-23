import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { palette } from '@/contexts/ThemeContext';
import { ms, fontSize as FS } from '@/utils/responsive';
import { GAME_GOLD_BORDER, GAME_GOLD_TINT } from '@/components/gameTokens';

const MUTED_TEXT = 'rgba(255,255,255,0.75)';

interface Props {
  Icon: LucideIcon;
  label: string;
  /** Gold (the game's promise) or muted white (a side fact, e.g. the expiry date). */
  tone?: 'gold' | 'muted';
  /** md: icon 14 / text sm, sm: icon 13 / text xs. */
  size?: 'md' | 'sm';
  fontFamily: string;
}

/** Rounded pill with an icon on the game stages (spins left, "always a win", expiry). */
export default React.memo(function GamePill({ Icon, label, tone = 'gold', size = 'sm', fontFamily }: Props) {
  const muted = tone === 'muted';
  const color = muted ? MUTED_TEXT : palette.goldLight;
  return (
    <View style={[styles.pill, muted && styles.pillMuted]}>
      <Icon size={ms(size === 'md' ? 14 : 13)} color={color} strokeWidth={2} />
      <Text style={{ color, fontSize: size === 'md' ? FS.sm : FS.xs, fontFamily }}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    paddingHorizontal: ms(12),
    paddingVertical: ms(6),
    borderRadius: 999,
    backgroundColor: GAME_GOLD_TINT,
    borderWidth: 1,
    borderColor: GAME_GOLD_BORDER,
  },
  pillMuted: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' },
});
