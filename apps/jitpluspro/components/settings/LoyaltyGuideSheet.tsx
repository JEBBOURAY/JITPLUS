import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Configuration guide opened from the "?" button in the topbar (§7). The only
 * source of long-form text on the Fidéliser screen — everything else uses the
 * ponctual "!" InfoHint affordances (§8).
 */
function LoyaltyGuideSheet({ visible, onClose }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const items = [1, 2, 3] as const;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.bgCard, paddingBottom: Math.max(insets.bottom + 16, 30) }]}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
        >
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />

          <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
            {t('settingsPage.guideSheetTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
            {t('settingsPage.guideSheetSubtitle')}
          </Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {items.map((n) => (
              <View key={n} style={styles.item}>
                <View style={[styles.num, { backgroundColor: theme.primary + '17' }]}>
                  <Text style={[styles.numText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{n}</Text>
                </View>
                <View style={styles.itemBody}>
                  <Text style={[styles.itemTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                    {t(`settingsPage.guideStep${n}Title`)}
                  </Text>
                  <Text style={[styles.itemText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.5}>
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default React.memo(LoyaltyGuideSheet);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,15,20,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingTop: 12, maxHeight: '78%' },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontFamily: 'Lexend_400Regular', marginTop: 4, marginBottom: 18 },
  list: { flexGrow: 0 },
  item: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 13, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  itemText: { fontSize: 13, lineHeight: 19, fontFamily: 'Lexend_400Regular', marginTop: 3 },
  closeBtn: { alignSelf: 'center', paddingVertical: 12, marginTop: 4 },
  closeText: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
});
