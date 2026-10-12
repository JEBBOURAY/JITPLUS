import { memo, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Cake, Check, Gift, Plus } from 'lucide-react-native';
import { brandGradientFull, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import ZelligePattern from '@/components/home/ZelligePattern';
import { ms } from '@/utils/responsive';
import { initials } from '@/utils/stampTransaction';

/** Beyond this, stamp circles get too small: a bar is shown instead. */
const MAX_CIRCLES = 12;
const CIRCLE = ms(30);

interface Props {
  name: string;
  prenom?: string | null;
  nom?: string | null;
  stamps: number;
  /** Stamps this validation will add (previewed on the card). */
  pendingStamps: number;
  /** Stamps needed for the next reward. */
  goal: number;
  isBirthday?: boolean;
}

function usePulse(active: boolean) {
  const [value] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!active) {
      value.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 0.55, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(value, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, value]);
  return value;
}

function StampClientCardBase({ name, prenom, nom, stamps, pendingStamps, goal, isBirthday }: Props) {
  const { t, isRTL } = useLanguage();
  const row = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';

  const safeGoal = Math.max(1, goal);
  const filled = Math.min(stamps, safeGoal);
  const preview = Math.min(stamps + pendingStamps, safeGoal);
  const ready = stamps >= safeGoal;
  const pulse = usePulse(preview > filled);
  const slots = useMemo(() => Array.from({ length: safeGoal }, (_, i) => i), [safeGoal]);

  return (
    <View style={styles.shadow}>
      <LinearGradient
        colors={[...brandGradientFull]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <ZelligePattern cells={28} spacing={12} />

        <View style={[styles.top, { flexDirection: row }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText} maxFontSizeMultiplier={1.2}>
              {initials(prenom, nom)}
            </Text>
          </View>
          <View style={styles.identity}>
            <Text style={[styles.caption, { textAlign }]} maxFontSizeMultiplier={1.2}>
              {t('clientDetail.loyaltyCard').toUpperCase()}
            </Text>
            <Text style={[styles.name, { textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {name}
            </Text>
            {isBirthday && (
              <View style={[styles.birthday, { flexDirection: row, alignSelf: isRTL ? 'flex-end' : 'flex-start' }]}>
                <Cake size={ms(12)} color={palette.charbonDark} strokeWidth={2} />
                <Text style={styles.birthdayText}>{t('stampScreen.birthday')}</Text>
              </View>
            )}
          </View>
          <View style={styles.balance}>
            <Text style={styles.balanceValue} maxFontSizeMultiplier={1.2}>
              {stamps}
            </Text>
            <Text style={styles.balanceLabel}>{t('stampScreen.stampsUnit')}</Text>
          </View>
        </View>

        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: safeGoal, now: filled }}
        >
          {safeGoal <= MAX_CIRCLES ? (
            <View style={[styles.circles, { flexDirection: row }]}>
              {slots.map((i) => {
                const isFilled = i < filled;
                const isPending = !isFilled && i < preview;
                const isLast = i === safeGoal - 1;
                if (isPending) {
                  return (
                    <Animated.View key={i} style={[styles.circle, styles.circlePending, { opacity: pulse }]}>
                      <Plus size={CIRCLE * 0.5} color={palette.charbonDark} strokeWidth={3} />
                    </Animated.View>
                  );
                }
                return (
                  <View key={i} style={[styles.circle, isFilled ? styles.circleFilled : styles.circleEmpty]}>
                    {isFilled ? (
                      <Check size={CIRCLE * 0.5} color={palette.violet} strokeWidth={3} />
                    ) : isLast ? (
                      <Gift size={CIRCLE * 0.48} color="rgba(255,255,255,0.85)" strokeWidth={1.8} />
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.track}>
              <Animated.View
                style={[styles.fill, isRTL ? styles.fillRtl : styles.fillLtr, styles.fillPending, { width: `${(preview / safeGoal) * 100}%`, opacity: pulse }]}
              />
              <View style={[styles.fill, isRTL ? styles.fillRtl : styles.fillLtr, styles.fillDone, { width: `${(filled / safeGoal) * 100}%` }]} />
            </View>
          )}
        </View>

        <View style={[styles.footer, { flexDirection: row }]}>
          {ready ? (
            <View style={[styles.readyChip, { flexDirection: row }]}>
              <Gift size={ms(13)} color={palette.charbonDark} strokeWidth={2} />
              <Text style={styles.readyText}>{t('stampScreen.rewardReady')}</Text>
            </View>
          ) : (
            <Text style={styles.goalText}>{t('stampScreen.progressGoal', { current: filled, total: safeGoal })}</Text>
          )}
          {pendingStamps > 0 && (
            <View style={styles.pendingChip}>
              <Text style={styles.pendingText}>{t('stampScreen.stampsPreview', { count: pendingStamps })}</Text>
            </View>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

export const StampClientCard = memo(StampClientCardBase);

const WHITE_SOFT = 'rgba(255,255,255,0.18)';

const styles = StyleSheet.create({
  shadow: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 22,
    shadowColor: palette.violet,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 8,
  },
  card: { borderRadius: 22, padding: 18, gap: 16, overflow: 'hidden' },
  top: { alignItems: 'center', gap: 12 },
  avatar: {
    width: ms(50),
    height: ms(50),
    borderRadius: ms(25),
    backgroundColor: WHITE_SOFT,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: ms(17), fontFamily: 'Lexend_700Bold' },
  identity: { flex: 1, gap: 2 },
  caption: { color: 'rgba(255,255,255,0.7)', fontSize: ms(10.5), letterSpacing: 1.2, fontFamily: 'Lexend_600SemiBold' },
  name: { color: '#fff', fontSize: ms(18), fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },
  birthday: {
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: palette.gold,
  },
  birthdayText: { color: palette.charbonDark, fontSize: ms(11.5), fontFamily: 'Lexend_600SemiBold' },
  balance: {
    alignItems: 'center',
    minWidth: ms(64),
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: WHITE_SOFT,
  },
  balanceValue: { color: '#fff', fontSize: ms(28), fontFamily: 'Lexend_700Bold', letterSpacing: -0.8 },
  balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: ms(10.5), fontFamily: 'Lexend_500Medium', marginTop: -3 },
  circles: { flexWrap: 'wrap', gap: 8 },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: 'center', justifyContent: 'center' },
  circleFilled: { backgroundColor: '#fff' },
  circleEmpty: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', borderStyle: 'dashed' },
  circlePending: { backgroundColor: palette.gold },
  track: { height: 10, borderRadius: 5, backgroundColor: WHITE_SOFT, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 5 },
  fillLtr: { left: 0 },
  fillRtl: { right: 0 },
  fillPending: { backgroundColor: palette.gold },
  fillDone: { backgroundColor: '#fff' },
  footer: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  goalText: { flexShrink: 1, color: 'rgba(255,255,255,0.88)', fontSize: ms(12.5), fontFamily: 'Lexend_500Medium' },
  readyChip: {
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: palette.gold,
  },
  readyText: { color: palette.charbonDark, fontSize: ms(12), fontFamily: 'Lexend_700Bold' },
  pendingChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(252,211,77,0.22)' },
  pendingText: { color: palette.gold, fontSize: ms(12), fontFamily: 'Lexend_700Bold' },
});
