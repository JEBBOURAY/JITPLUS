import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Info } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';

interface InfoHintProps {
  /** Explanation shown in the bottom sheet when tapped. */
  text: string;
}

/**
 * Discreet grey "i" affordance used across the Fidéliser screen. Replaces
 * permanent explanatory paragraphs: the concept is labelled with a short
 * word and the full explanation appears in a bottom sheet only on tap.
 */
function InfoHint({ text }: InfoHintProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { textAlign } = useDir();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  return (
    <>
      <TouchableOpacity
        onPress={open}
        activeOpacity={0.7}
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        style={styles.dot}
        accessibilityRole="button"
        accessibilityLabel={t('common.moreInfo')}
      >
        <Info size={16} color={theme.textMuted} strokeWidth={icon.stroke} />
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
            <Text style={[styles.body, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.6}>
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
  dot: { alignItems: 'center', justifyContent: 'center', opacity: 0.8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,15,20,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 4, borderRadius: 999, alignSelf: 'center', marginBottom: 16 },
  body: { fontSize: 14, lineHeight: 21, fontFamily: font.regular },
  closeBtn: { alignSelf: 'center', paddingVertical: 12, marginTop: 14 },
  closeText: { fontSize: 14, fontFamily: font.semibold },
});
