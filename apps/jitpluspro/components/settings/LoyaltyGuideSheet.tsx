import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import BottomSheet from '@/components/ui/BottomSheet';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font } from '@/constants/design';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Configuration guide opened from the "?" button in the topbar (§7). The only
 * source of long-form text on the Fidéliser screen — everything else uses the
 * ponctual grey "i" InfoHint affordances.
 */
const GUIDE_STEPS = [1, 2, 3] as const;

function LoyaltyGuideSheet({ visible, onClose }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      scrollable
      style={styles.sheet}
      header={(
        <>
          <Text style={[styles.title, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
            {t('settingsPage.guideSheetTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>
            {t('settingsPage.guideSheetSubtitle')}
          </Text>
        </>
      )}
    >
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {GUIDE_STEPS.map((n) => (
          <View key={n} style={[styles.item, { flexDirection: row }]}>
            <View style={[styles.num, { borderColor: theme.border }]}>
              <Text style={[styles.numText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>{n}</Text>
            </View>
            <View style={styles.itemBody}>
              <Text style={[styles.itemTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
                {t(`settingsPage.guideStep${n}Title`)}
              </Text>
              <Text style={[styles.itemText, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.5}>
                {t(`settingsPage.guideStep${n}Text`)}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn} accessibilityRole="button">
        <Text style={[styles.closeText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>
          {t('settingsPage.guideClose')}
        </Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

export default React.memo(LoyaltyGuideSheet);

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 22, maxHeight: '78%' },
  title: { fontSize: 18, fontFamily: font.semibold, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontFamily: font.regular, marginTop: 4, marginBottom: 18 },
  list: { flexGrow: 0, flexShrink: 1 },
  item: { gap: 12, marginBottom: 18 },
  // Same plain numbered marker as the "Guide de départ" steps.
  num: { width: 26, height: 26, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 13, fontFamily: font.semibold },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 14, fontFamily: font.semibold },
  itemText: { fontSize: 13, lineHeight: 19, fontFamily: font.regular, marginTop: 3 },
  closeBtn: { alignSelf: 'center', paddingVertical: 12, marginTop: 4 },
  closeText: { fontSize: 14, fontFamily: font.semibold },
});
