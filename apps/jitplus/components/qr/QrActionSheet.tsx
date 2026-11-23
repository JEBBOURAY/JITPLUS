import { memo, useCallback, useRef } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Download, Share2 } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import BottomSheet from '@/components/BottomSheet';
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

/** iOS drops (or dismisses with it) a share sheet / Alert presented while a Modal is still dismissing. */
const DISMISS_DELAY_MS = Platform.OS === 'ios' ? 350 : 0;

/**
 * Bottom sheet with the loyalty card actions: share, save to gallery.
 * The chosen action runs once the sheet has slid away (same as ActionSheet),
 * so the iOS share sheet is not presented on top of the closing Modal.
 */
export default memo(function QrActionSheet({ visible, bottomInset, theme, fonts, t, onClose, onShare, onSave }: Props) {
  const pendingRef = useRef<(() => void) | null>(null);
  const runPending = useCallback(() => {
    const run = pendingRef.current;
    pendingRef.current = null;
    if (run) setTimeout(run, DISMISS_DELAY_MS);
  }, []);
  const choose = (action: () => void) => () => {
    pendingRef.current = action;
    onClose();
  };
  const rows = [
    { key: 'share', Icon: Share2, onPress: choose(onShare), title: t('qr.shareTitle'), sub: t('qr.shareSubtitle'), a11y: t('qr.shareAccessibility') },
    { key: 'save', Icon: Download, onPress: choose(onSave), title: t('qr.saveTitle'), sub: t('qr.saveSubtitle'), a11y: t('qr.saveAccessibility') },
  ];
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onExited={runPending}
      backdropColor="rgba(15,23,42,0.5)"
      backdropLabel={t('common.close')}
      handleStyle={styles.handle}
      style={[styles.sheet, { backgroundColor: theme.bgCard, paddingBottom: bottomInset + hp(16) }]}
    >
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
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
    paddingHorizontal: wp(20), gap: hp(10),
  },
  handle: { width: wp(40), height: ms(5), borderRadius: 999, marginBottom: hp(6) },
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
