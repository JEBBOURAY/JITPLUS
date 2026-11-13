// Pieces shared by the two games shown on a dark stage (lucky wheel and
// scratch cards): the header with its history button, and the state card
// (load error, nothing to play).
import React from 'react';
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronLeft, ChevronRight, History, X, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { palette } from '@/contexts/ThemeContext';
import type { AppFonts } from '@/utils/fonts';
import { hp, ms, wp, fontSize as FS, radius } from '@/utils/responsive';

interface HeaderProps {
  /** History view: the left button goes back instead of closing, and the history button is hidden. */
  inHistory: boolean;
  title: string;
  historyLabel: string;
  /** Read after the history label when the badge is shown ("2 lots à récupérer"). */
  badgeLabel: string;
  badgeCount: number;
  historyDisabled?: boolean;
  isRTL: boolean;
  topInset: number;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
  onClose: () => void;
  onBack: () => void;
  onOpenHistory: () => void;
}

export const GameHeader = React.memo(function GameHeader({
  inHistory, title, historyLabel, badgeLabel, badgeCount, historyDisabled = false, isRTL, topInset, fonts, t,
  onClose, onBack, onOpenHistory,
}: HeaderProps) {
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  return (
    <View style={[styles.header, { paddingTop: topInset + hp(8) }]}>
      <TouchableOpacity
        onPress={inHistory ? onBack : onClose}
        activeOpacity={0.7}
        style={styles.iconBtn}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={inHistory ? t('common.back') : t('common.close')}
      >
        {inHistory
          ? <BackIcon size={ms(22)} color="#fff" strokeWidth={2} />
          : <X size={ms(20)} color="#fff" strokeWidth={2} />}
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { fontFamily: fonts.bold }]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {inHistory ? (
        <View style={styles.iconBtnSpacer} />
      ) : (
        <TouchableOpacity
          onPress={onOpenHistory}
          disabled={historyDisabled}
          activeOpacity={0.7}
          style={[styles.iconBtn, historyDisabled && styles.disabled]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={badgeCount > 0 ? `${historyLabel}, ${badgeLabel}` : historyLabel}
        >
          <History size={ms(20)} color="#fff" strokeWidth={2} />
          {badgeCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={[styles.headerBadgeText, { fontFamily: fonts.bold }]} maxFontSizeMultiplier={1.2}>
                {badgeCount > 99 ? '99+' : badgeCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
});

interface StateCardProps {
  Icon?: LucideIcon;
  title: string;
  hint?: string;
  /** Pill button under the text, with an optional leading icon or trailing count. */
  action?: { label: string; onPress: () => void; Icon?: LucideIcon; badge?: number };
  style?: StyleProp<ViewStyle>;
  fonts: AppFonts;
}

export function GameStateCard({ Icon, title, hint, action, style, fonts }: StateCardProps) {
  return (
    <View style={[styles.stateCard, style]}>
      {Icon && (
        <View style={styles.stateIcon}>
          <Icon size={ms(26)} color={palette.goldLight} strokeWidth={1.8} />
        </View>
      )}
      <Text style={[styles.stateTitle, { fontFamily: fonts.bold }]}>{title}</Text>
      {hint ? <Text style={[styles.stateHint, { fontFamily: fonts.regular }]}>{hint}</Text> : null}
      {action && (
        <TouchableOpacity onPress={action.onPress} activeOpacity={0.8} style={styles.ghostBtn} accessibilityRole="button">
          {action.Icon && <action.Icon size={ms(16)} color="#fff" strokeWidth={2} />}
          <Text style={[styles.ghostBtnText, { fontFamily: fonts.semibold }]}>{action.label}</Text>
          {action.badge != null && (
            <View style={styles.badge}>
              <Text style={[styles.badgeText, { fontFamily: fonts.bold }]}>{action.badge}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

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
  disabled: { opacity: 0.4 },
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

  stateCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: hp(8),
    paddingVertical: hp(18),
    paddingHorizontal: wp(20),
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  stateIcon: {
    width: ms(52),
    height: ms(52),
    borderRadius: ms(26),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.12)',
    marginBottom: hp(2),
  },
  stateTitle: { color: '#fff', fontSize: FS.lg, textAlign: 'center' },
  stateHint: { color: 'rgba(255,255,255,0.6)', fontSize: FS.sm, textAlign: 'center', lineHeight: ms(20) },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    marginTop: hp(6),
    paddingHorizontal: ms(16),
    height: ms(42),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  ghostBtnText: { color: '#fff', fontSize: FS.sm },
  badge: {
    minWidth: ms(20),
    height: ms(20),
    borderRadius: ms(10),
    paddingHorizontal: ms(5),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.goldLight,
  },
  badgeText: { color: '#3B1D06', fontSize: FS.xs },
});
