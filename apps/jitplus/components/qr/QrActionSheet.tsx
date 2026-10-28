import { memo } from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Download, Share2 } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import type { useTheme } from '@/contexts/ThemeContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

interface Props {
  visible: boolean;
  bottomInset: number;
  theme: ReturnType<typeof useTheme>;
  fonts: { regular: string; semibold: string; bold: string };
  t: (key: string) => string;
  onClose: () => void;
  onShare: () => void;
  onSave: () => void;
}

/** Bottom sheet with the loyalty card actions: share, save to gallery. */
export default memo(function QrActionSheet({ visible, bottomInset, theme, fonts, t, onClose, onShare, onSave }: Props) {
  const rows = [
    { key: 'share', Icon: Share2, onPress: onShare, title: t('qr.shareTitle'), sub: t('qr.shareSubtitle'), a11y: t('qr.shareAccessibility') },
    { key: 'save', Icon: Download, onPress: onSave, title: t('qr.saveTitle'), sub: t('qr.saveSubtitle'), a11y: t('qr.saveAccessibility') },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: theme.bgCard, paddingBottom: bottomInset + hp(16) }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]}>{t('qr.actionsTitle')}</Text>
          {rows.map(({ key, Icon, onPress, title, sub, a11y }) => (
            <TouchableOpacity
              key={key}
              style={[styles.row, { backgroundColor: theme.bgInput }]}
              onPress={onPress}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={a11y}
            >
              <View style={[styles.icon, { backgroundColor: theme.primaryBg }]}>
                <Icon size={ms(18)} color={theme.primary} strokeWidth={2} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: theme.text, fontFamily: fonts.semibold }]}>{title}</Text>
                <Text style={[styles.rowSub, { color: theme.textMuted, fontFamily: fonts.regular }]}>{sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
    paddingHorizontal: wp(20), paddingTop: hp(10), gap: hp(10),
  },
  handle: { width: wp(40), height: ms(5), borderRadius: 999, alignSelf: 'center', marginBottom: hp(6) },
  title: { fontSize: fontSize.lg, marginBottom: hp(4), letterSpacing: -0.2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: wp(14),
    paddingVertical: hp(12), paddingHorizontal: wp(12), borderRadius: radius.lg,
  },
  icon: { width: ms(42), height: ms(42), borderRadius: ms(13), alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: fontSize.md },
  rowSub: { fontSize: fontSize.xs, marginTop: hp(2) },
});
