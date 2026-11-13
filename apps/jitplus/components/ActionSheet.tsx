import { memo, useCallback, useRef } from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import BottomSheet from '@/components/BottomSheet';
import { wp, hp, ms } from '@/utils/responsive';

/** iOS silently drops an Alert presented while a Modal is still dismissing (counted from the end of the slide-out). */
const DISMISS_DELAY_MS = Platform.OS === 'ios' ? 350 : 0;

export interface ActionSheetOption {
  key: string;
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  /** Keep the sheet open, e.g. to swap its content for a sub-menu. */
  keepOpen?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  cancelLabel: string;
  onClose: () => void;
}

/** Bottom sheet menu: unlike Alert, it supports any number of options on Android. */
function ActionSheet({ visible, title, message, options, cancelLabel, onClose }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();
  // The chosen option runs once the sheet has slid away, so it can present an Alert or navigate.
  const pendingRef = useRef<(() => void) | null>(null);
  const runPending = useCallback(() => {
    const run = pendingRef.current;
    pendingRef.current = null;
    if (run) setTimeout(run, DISMISS_DELAY_MS);
  }, []);

  const handlePress = (option: ActionSheetOption) => {
    haptic();
    if (option.keepOpen) {
      option.onPress();
      return;
    }
    pendingRef.current = option.onPress;
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onExited={runPending}
      backdropLabel={cancelLabel}
      style={[styles.sheet, { backgroundColor: theme.bgElevated, paddingBottom: insets.bottom + hp(12) }]}
    >
      {!!title && (
        <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={2}>{title}</Text>
      )}
      {!!message && (
        <Text style={[styles.message, { color: theme.textMuted, fontFamily: fonts.regular }]}>{message}</Text>
      )}
      <View style={styles.options}>
        {options.map((option) => {
          const Icon = option.icon;
          const tint = option.destructive ? theme.danger : theme.primary;
          return (
            <Pressable
              key={option.key}
              onPress={() => handlePress(option)}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: theme.primaryBg }]}
              accessibilityRole="button"
              accessibilityLabel={option.label}
            >
              {Icon && (
                <View style={[styles.optionIcon, { backgroundColor: `${tint}14` }]}>
                  <Icon size={ms(18)} color={tint} strokeWidth={2} />
                </View>
              )}
              <Text
                style={[styles.optionLabel, { color: option.destructive ? theme.danger : theme.text, fontFamily: fonts.semibold }]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [styles.cancel, { backgroundColor: theme.bgInput, opacity: pressed ? 0.8 : 1 }]}
        accessibilityRole="button"
      >
        <Text style={[styles.cancelText, { color: theme.text, fontFamily: fonts.semibold }]}>{cancelLabel}</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: wp(16) },
  title: { fontSize: ms(17), textAlign: 'center', paddingHorizontal: wp(12) },
  message: { fontSize: ms(13), lineHeight: ms(19), textAlign: 'center', marginTop: hp(6), paddingHorizontal: wp(12) },
  options: { marginTop: hp(12), gap: hp(2) },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12),
    paddingVertical: hp(11), paddingHorizontal: wp(10), borderRadius: ms(14),
  },
  optionIcon: { width: ms(36), height: ms(36), borderRadius: ms(12), alignItems: 'center', justifyContent: 'center' },
  optionLabel: { flex: 1, fontSize: ms(15) },
  cancel: { marginTop: hp(10), paddingVertical: hp(14), borderRadius: ms(16), alignItems: 'center' },
  cancelText: { fontSize: ms(15) },
});

export default memo(ActionSheet);
