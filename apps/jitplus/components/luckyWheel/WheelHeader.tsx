import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { ChevronLeft, ChevronRight, History, X } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { hp, ms, wp, fontSize as FS } from '@/utils/responsive';
import type { WheelPhase } from './useLuckyWheel';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  phase: WheelPhase;
  spinning: boolean;
  pendingCount: number;
  isRTL: boolean;
  topInset: number;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
  onClose: () => void;
  onBack: () => void;
  onOpenHistory: () => void;
}

export default React.memo(function WheelHeader({
  phase, spinning, pendingCount, isRTL, topInset, fonts, t, onClose, onBack, onOpenHistory,
}: Props) {
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  return (
    <View style={[styles.header, { paddingTop: topInset + hp(8) }]}>
      <TouchableOpacity
        onPress={phase === 'history' ? onBack : onClose}
        activeOpacity={0.7}
        style={styles.iconBtn}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={phase === 'history' ? t('common.back') : t('common.close')}
      >
        {phase === 'history'
          ? <BackIcon size={ms(22)} color="#fff" strokeWidth={2} />
          : <X size={ms(20)} color="#fff" strokeWidth={2} />}
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { fontFamily: fonts.bold }]} numberOfLines={1} accessibilityRole="header">
        {phase === 'history' ? t('luckyWheel.history') : t('luckyWheel.title')}
      </Text>
      {phase === 'wheel' ? (
        <TouchableOpacity
          onPress={onOpenHistory}
          disabled={spinning}
          activeOpacity={0.7}
          style={[styles.iconBtn, spinning && { opacity: 0.4 }]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={pendingCount > 0
            ? `${t('luckyWheel.history')}, ${t('luckyWheel.toCollect', { count: pendingCount })}`
            : t('luckyWheel.history')}
        >
          <History size={ms(20)} color="#fff" strokeWidth={2} />
          {pendingCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={[styles.headerBadgeText, { fontFamily: fonts.bold }]}>{pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.iconBtnSpacer} />
      )}
    </View>
  );
});

const ICON_BTN = ms(40);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(16),
    paddingBottom: hp(8),
  },
  headerTitle: { flex: 1, color: '#fff', fontSize: FS.lg, textAlign: 'center', marginHorizontal: ms(8) },
  iconBtn: {
    width: ICON_BTN,
    height: ICON_BTN,
    borderRadius: ICON_BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  iconBtnSpacer: { width: ICON_BTN, height: ICON_BTN },
  headerBadge: {
    position: 'absolute',
    top: -ms(3),
    right: -ms(3),
    minWidth: ms(18),
    height: ms(18),
    borderRadius: ms(9),
    paddingHorizontal: ms(4),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.goldLight,
    borderWidth: 2,
    borderColor: '#1E0D40',
  },
  headerBadgeText: { color: '#3B1D06', fontSize: ms(10) },
});
