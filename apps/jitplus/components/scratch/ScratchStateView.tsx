import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { hp, wp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { scratchSharedStyles as shared } from './scratchStyles';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  icon: React.ReactNode;
  title: string;
  action?: { label: string; onPress: () => void; icon?: React.ReactNode };
  onBack: () => void;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/** Terminal state of the scratch screen (not found, expired, cancelled, unavailable). */
export default React.memo(function ScratchStateView({ icon, title, action, onBack, fonts, t }: Props) {
  return (
    <View style={shared.stateWrap}>
      <View style={styles.stateCard}>
        <View style={styles.stateIcon}>{icon}</View>
        <Text style={[styles.stateTitle, { fontFamily: fonts.bold }]}>{title}</Text>
        <TouchableOpacity
          onPress={action?.onPress ?? onBack}
          activeOpacity={0.8}
          style={shared.ghostBtn}
          accessibilityRole="button"
        >
          {action?.icon}
          <Text style={[shared.ghostBtnText, { fontFamily: fonts.semibold }]}>{action?.label ?? t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  stateCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: hp(10),
    paddingVertical: hp(24),
    paddingHorizontal: wp(20),
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  stateIcon: {
    width: ms(56),
    height: ms(56),
    borderRadius: ms(28),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  stateTitle: { color: '#fff', fontSize: FS.lg, textAlign: 'center' },
});
