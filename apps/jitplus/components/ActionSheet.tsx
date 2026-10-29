import { memo, useEffect, useState } from 'react';
import { Modal, View, Pressable, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { wp, hp, ms } from '@/utils/responsive';

/** iOS silently drops an Alert presented while a Modal is still dismissing. */
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
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [hp(320), 0] });

  const handlePress = (option: ActionSheetOption) => {
    haptic();
    if (option.keepOpen) {
      option.onPress();
      return;
    }
    onClose();
    setTimeout(option.onPress, DISMISS_DELAY_MS);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={cancelLabel} />
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: theme.bgElevated, paddingBottom: insets.bottom + hp(12), transform: [{ translateY }] },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
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
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    borderTopLeftRadius: ms(26), borderTopRightRadius: ms(26),
    paddingHorizontal: wp(16), paddingTop: hp(10),
  },
  handle: { alignSelf: 'center', width: ms(38), height: 4, borderRadius: 2, marginBottom: hp(14) },
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
