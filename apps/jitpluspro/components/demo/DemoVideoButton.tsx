import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Play } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon as iconTokens } from '@/constants/design';
import type { DemoId } from '@/constants/demoVideos';
import { hapticLight } from '@/utils/haptics';
import { DemoVideoModal } from './DemoVideoModal';

interface Props {
  id: DemoId;
  /** 'pill' (default): play icon + label. 'header': compact play icon + label for a header's right slot (same line as the page title). */
  variant?: 'pill' | 'header';
  /** 'lg': bigger pill for screens where it must stand out (e.g. over the camera). */
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  /** Icon/label color override, e.g. on a coloured hero. */
  color?: string;
  /** Background override, e.g. on a coloured hero. */
  backgroundColor?: string;
  /** Called when the player opens/closes, e.g. to pause a camera behind it. */
  onOpenChange?: (open: boolean) => void;
}

/** "Voir la démo": opens the page's short demo clip in a full-screen player. */
export function DemoVideoButton({ id, variant = 'pill', size = 'md', style, color, backgroundColor, onOpenChange }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const [open, setOpen] = useState(false);
  const label = t('demo.watch');
  const fg = color ?? theme.primary;
  const bg = backgroundColor ?? theme.primaryBg;

  const onPress = () => {
    hapticLight();
    setOpen(true);
    onOpenChange?.(true);
  };
  const onClose = () => {
    setOpen(false);
    onOpenChange?.(false);
  };

  return (
    <>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        hitSlop={variant === 'pill' ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          [variant === 'header' ? styles.headerPill : styles.pill, { flexDirection: dir.row, alignSelf: variant === 'header' ? 'center' : dir.alignStart }],
          { backgroundColor: bg },
          size === 'lg' && styles.pillLg,
          style,
        ]}
      >
        <Play size={size === 'lg' ? 18 : 13} color={fg} fill={fg} strokeWidth={iconTokens.strokeSmall} />
        <Text style={[styles.label, size === 'lg' && styles.labelLg, { color: fg }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>
      </TouchableOpacity>
      <DemoVideoModal id={id} visible={open} onClose={onClose} />
    </>
  );
}

/** Header right slot: the labelled demo button followed by the screen's own actions (mirrored in Arabic). */
export function DemoHeaderActions({ id, children }: { id: DemoId; children?: React.ReactNode }) {
  const dir = useDir();
  return (
    <View style={[styles.headerActions, { flexDirection: dir.row }]}>
      <DemoVideoButton id={id} variant="header" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { alignItems: 'center', gap: 8 },
  pill: {
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  label: { fontFamily: font.semibold, fontSize: 13 },
  pillLg: { minHeight: 52, paddingHorizontal: 26, gap: 10 },
  labelLg: { fontSize: 17, fontFamily: font.bold },
  headerPill: { alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 999, flexShrink: 0 },
});
