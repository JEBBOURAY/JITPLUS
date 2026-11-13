import React, { useState, useCallback } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Info } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import BottomSheet from '@/components/ui/BottomSheet';
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

      <BottomSheet visible={visible} onClose={close}>
        <Text style={[styles.body, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.6}>
          {text}
        </Text>
        <TouchableOpacity onPress={close} activeOpacity={0.7} style={styles.closeBtn} accessibilityRole="button">
          <Text style={[styles.closeText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>
            {t('common.gotIt')}
          </Text>
        </TouchableOpacity>
      </BottomSheet>
    </>
  );
}

export default React.memo(InfoHint);

const styles = StyleSheet.create({
  dot: { alignItems: 'center', justifyContent: 'center', opacity: 0.8 },
  body: { fontSize: 14, lineHeight: 21, fontFamily: font.regular },
  closeBtn: { alignSelf: 'center', paddingVertical: 12, marginTop: 14 },
  closeText: { fontSize: 14, fontFamily: font.semibold },
});
