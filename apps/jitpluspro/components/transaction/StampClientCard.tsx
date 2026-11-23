import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { Cake } from 'lucide-react-native';
import { JitGift } from '@/components/icons';
import { palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { font, icon } from '@/constants/design';
import { ms, radius } from '@/utils/responsive';

interface Props {
  /** Full name, or "?" for an anonymous client. */
  name: string;
  stamps: number;
  /** Stamps needed for the next reward. */
  goal: number;
  isBirthday?: boolean;
}

/**
 * Who is at the till. What this visit adds is shown once, in the action bar.
 */
function StampClientCardBase({ name, stamps, goal, isBirthday }: Props) {
  const { t, isRTL } = useLanguage();
  const row = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';

  const safeGoal = Math.max(1, goal);
  const ready = stamps >= safeGoal;

  return (
    <View style={styles.card}>
      <Text style={[styles.name, { textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3} accessibilityRole="header">
        {name}
      </Text>
      {(isBirthday || ready) && (
        <View style={[styles.chips, { flexDirection: row }]}>
          {ready && (
            <View style={[styles.chip, { flexDirection: row }]}>
              <JitGift size={ms(14)} color={palette.charbonDark} strokeWidth={icon.strokeSmall} />
              <Text style={styles.chipText}>{t('stampScreen.rewardReady')}</Text>
            </View>
          )}
          {isBirthday && (
            <View style={[styles.chip, { flexDirection: row }]}>
              <Cake size={ms(14)} color={palette.charbonDark} strokeWidth={icon.strokeSmall} />
              <Text style={styles.chipText}>{t('stampScreen.birthday')}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export const StampClientCard = memo(StampClientCardBase);

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    backgroundColor: palette.violet,
  },
  name: { color: '#fff', fontSize: ms(20), fontFamily: font.semibold },
  chips: { flexWrap: 'wrap', gap: 8 },
  chip: { alignItems: 'center', gap: 6, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: palette.gold },
  chipText: { color: palette.charbonDark, fontSize: ms(13), fontFamily: font.semibold },
});
