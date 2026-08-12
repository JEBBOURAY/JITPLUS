import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface InfoHintProps {
  /** Explanation shown in the bottom sheet when tapped. */
  text: string;
  /** Optional heading above the explanation. */
  title?: string;
  /** Colour treatment — violet (default) or amber (used inside warnings). */
  variant?: 'violet' | 'amber';
  /** Diameter of the round "!" button. Defaults to 18. */
  size?: number;
  accessibilityLabel?: string;
}

/**
 * Small round "!" affordance used across the Fidéliser screen. Replaces
 * permanent explanatory paragraphs (§8): the concept is labelled with a short
 * word and the full explanation appears in a bottom sheet only on tap.
 */
function InfoHint({ text, title, variant = 'violet', size = 18, accessibilityLabel }: InfoHintProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  const isAmber = variant === 'amber';
  const dotBg = isAmber ? 'rgba(146,64,14,0.14)' : theme.primary + '17';
  const dotColor = isAmber ? theme.warning : theme.primary;

  return (
    <>
      <TouchableOpacity
        onPress={open}
        activeOpacity={0.7}
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: dotBg }]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? t('common.moreInfo')}
      >
        <Text style={[styles.dotText, { color: dotColor, fontSize: Math.round(size * 0.62) }]} maxFontSizeMultiplier={1.2}>
          !
        </Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('common.close')}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: theme.bgCard, paddingBottom: Math.max(insets.bottom + 16, 28) },
            ]}
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal
          >
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            {title ? (
              <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            <Text style={[styles.body, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
              {text}
            </Text>
            <TouchableOpacity onPress={close} activeOpacity={0.7} style={styles.closeBtn} accessibilityRole="button">
              <Text style={[styles.closeText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>
                {t('common.gotIt')}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default React.memo(InfoHint);

const styles = StyleSheet.create({
  dot: { alignItems: 'center', justifyContent: 'center' },
  dotText: { fontWeight: '800', fontFamily: 'Lexend_700Bold' },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,15,20,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 16, fontWeight: '700', fontFamily: 'Lexend_700Bold', marginBottom: 8, letterSpacing: -0.2 },
  body: { fontSize: 14, lineHeight: 21, fontFamily: 'Lexend_400Regular' },
  closeBtn: { alignSelf: 'center', paddingVertical: 12, marginTop: 14 },
  closeText: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
});
